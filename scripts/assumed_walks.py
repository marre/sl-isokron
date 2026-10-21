"""User-authorized access assumption: same name, at most 250 metres apart."""
from collections import defaultdict
import math
import unicodedata
from osm_walks import distance

POLICY = {'maxMetres':250,'distanceMultiplier':1.25,'speedKmh':4.8,'minimumSeconds':60,'nameNormalization':'case-space-station-genitive-v3'}
SOURCE = 'Assumed same-name stop transfer; <=250m; distance x1.25; 4.8km/h; minimum 60s'

def name_key(name):
    # Preserve punctuation: similar names must not become the same stop name.
    key=' '.join(unicodedata.normalize('NFC',name).casefold().split())
    # Rail and bus parts of the same station often differ only by this suffix.
    return key[:-8] if key.endswith(' station') else key

def add_assumed_walks(stops, edges):
    groups=defaultdict(list)
    for stop in stops:
        key=name_key(stop['name'])
        if key:groups[key].append(stop)
    # Swedish bus names often use a possessive before "station": Lindholmens
    # station / Lindholmen. Resolve against existing nearby names, without
    # stripping natural final s (Hägernäs) or cascading inferred aliases.
    original={k:list(v) for k,v in groups.items()}
    plain=lambda name:' '.join(unicodedata.normalize('NFC',name).casefold().split())
    close=lambda a,b:distance((a['lat'],a['lon']),(b['lat'],b['lon']))<=250
    for stop in stops:
        key=name_key(stop['name'])
        if not plain(stop['name']).endswith(' station') or not key.endswith('s'):continue
        if any(plain(s['name'])==key and close(stop,s) for s in original[key]):continue
        if any(close(stop,s) for s in original.get(key[:-1],[])):groups[key[:-1]].append(stop)
    existing={(e['from'],e['to']) for e in edges}
    additions=[]
    for group in groups.values():
        for a in group:
            for b in group:
                if a['id']==b['id'] or (a['id'],b['id']) in existing:continue
                direct=distance((a['lat'],a['lon']),(b['lat'],b['lon']))
                if direct>250:continue
                metres=math.ceil(direct*1.25)
                additions.append(dict(from_=a['id'],to=b['id'],seconds=max(60,math.ceil(metres/(4800/3600))),metres=metres,source=SOURCE))
                existing.add((a['id'],b['id']))
    return edges+[{('from' if k=='from_' else k):v for k,v in e.items()} for e in additions]

def extend_index(data, stops):
    data['edges']=add_assumed_walks(stops,data['edges'])
    included={s['id'] for s in data['stops']}
    used={e[k] for e in data['edges'] for k in ('from','to')}
    missing=used-included
    data['stops'].extend({k:s[k] for k in ('id','lat','lon')} | {'binding':'assumed-same-name'} for s in stops if s['id'] in missing)
    warning=('Antagna gångbyten: hållplatser med samma namn (med eller utan suffixet station och svensk genitiv-s före station) högst 250 meter från varandra kopplas när kartlagd gångväg saknas. Avstånd uppskattas till fågelvägen × 1,25, tid vid 4,8 km/h, minst en minut. Dessa passager är inte verifierade i gångkartan.')
    if warning not in data.setdefault('warnings',[]):data['warnings'].append(warning)
    data['sameNameTransfers']=POLICY.copy()
    return data


def refresh_assumed_walks(data, stops):
    """Re-evaluate assumptions against each new feed, retaining physical checks."""
    if not data.get('sameNameTransfers') and not any(e.get('source')==SOURCE for e in data['edges']):return data
    data['edges']=[e for e in data['edges'] if e.get('source')!=SOURCE]
    data['stops']=[s for s in data['stops'] if s.get('binding')!='assumed-same-name']
    data['warnings']=[w for w in data.get('warnings',[]) if not w.startswith('Antagna gångbyten:')]
    return extend_index(data,stops)
