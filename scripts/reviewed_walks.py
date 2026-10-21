"""Reviewed public station passages; estimated costs remain separate from OSM."""
import hashlib
import json
import math
from pathlib import Path
from osm_walks import distance, normalize

PREFIX = 'Assumed reviewed station access; '
FILE = Path(__file__).resolve().parent.parent/'data/reviewed-walking-access.json'


def refresh_reviewed_walks(data, stops, document=None):
    document = json.loads(FILE.read_text()) if document is None else document
    if document.get('schema') != 1 or not isinstance(document.get('links'), list):
        raise ValueError('Invalid reviewed walking access document')
    known = {s['id']: s for s in stops}
    edges = [e for e in data['edges'] if not e.get('source', '').startswith(PREFIX)]
    bindings = [s for s in data['stops'] if s.get('binding') != 'assumed-reviewed-access']
    identities = set(); applied = []; retired = []
    for link in document['links']:
        if not link.get('id') or link['id'] in identities:
            raise ValueError('Duplicate/missing reviewed access identity')
        identities.add(link['id'])
        for key in ('source', 'reviewedOn', 'via', 'estimate'):
            if not isinstance(link.get(key), str) or not link[key].strip():
                raise ValueError('Reviewed access lacks provenance: '+link['id'])
        a, b = link['from'], link['to']
        if a['id'] == b['id']:
            raise ValueError('Reviewed access must join distinct stops')
        # Removed positions do not reappear. Moved/renamed active endpoints need
        # another review, rather than silently inheriting the old passage.
        if a['id'] not in known or b['id'] not in known:
            retired.append(link['id']); continue
        for endpoint in (a, b):
            actual = known[endpoint['id']]
            if normalize(actual['name']) != normalize(endpoint['name']) or any(abs(actual[k]-endpoint[k]) > 1e-6 for k in ('lat', 'lon')):
                raise ValueError('Stale reviewed access endpoint: '+endpoint['id'])
        seconds, metres = link['seconds'], link['metres']
        direct = distance((a['lat'], a['lon']), (b['lat'], b['lon']))
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (seconds, metres)) or not 0 < seconds <= data['maxMinutes']*60 or not direct <= metres < 100_000 or seconds < metres/(4800/3600):
            raise ValueError('Invalid reviewed walking duration/distance: '+link['id'])
        if not isinstance(link.get('bidirectional'), bool):
            raise ValueError('Reviewed access requires explicit direction')
        pairs = [(a, b), (b, a)] if link['bidirectional'] else [(a, b)]
        # Preserve physical routes even when they are slower: they can have
        # different geometry and access conditions. The router chooses a cost.
        for start, end in pairs:
            edges.append({'from':start['id'], 'to':end['id'], 'seconds':seconds, 'metres':metres,
                'source':PREFIX+link['id']+'; '+link['source']+'; '+link['estimate']})
        applied.append(link['id'])
    included = {s['id'] for s in bindings}
    used = {e[k] for e in edges for k in ('from', 'to')}
    bindings.extend({k:s[k] for k in ('id','lat','lon')} | {'binding':'assumed-reviewed-access'} for s in stops if s['id'] in used-included)
    data['edges'], data['stops'] = edges, bindings
    data['reviewedAccess'] = {'sha256':hashlib.sha256(json.dumps(document, sort_keys=True).encode()).hexdigest(), 'applied':applied, 'retired':retired}
    data['warnings'] = [w for w in data.get('warnings', []) if not w.startswith('Granskade stationsanslutningar:')]
    if applied:
        data['warnings'].append('Granskade stationsanslutningar: '+str(len(applied))+' offentliga passager kompletterar gångkartan. Tid och avstånd är uppskattade och märks i resedetaljerna. '+', '.join(link['id']+': '+link['source'] for link in document['links'] if link['id'] in applied))
    return data
