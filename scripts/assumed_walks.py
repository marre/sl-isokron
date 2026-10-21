"""User-authorized access assumption: same name, at most 250 metres apart."""
from collections import defaultdict
import math
import unicodedata
from osm_walks import distance

SOURCE = 'Assumed same-name stop transfer; <=250m; distance x1.25; 4.8km/h; minimum 60s'

def name_key(name):
    # Preserve punctuation: similar names must not become the same stop name.
    return ' '.join(unicodedata.normalize('NFC',name).casefold().split())

def add_assumed_walks(stops, edges):
    groups=defaultdict(list)
    for stop in stops:
        key=name_key(stop['name'])
        if key:groups[key].append(stop)
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
    return edges+[{('from' if k=='from_' else k):v for k,v in e.items()} for e in additions]

def extend_index(data, stops):
    data['edges']=add_assumed_walks(stops,data['edges'])
    included={s['id'] for s in data['stops']}
    used={e[k] for e in data['edges'] for k in ('from','to')}
    missing=used-included
    data['stops'].extend({k:s[k] for k in ('id','lat','lon')} | {'binding':'assumed-same-name'} for s in stops if s['id'] in missing)
    data['warnings'].append('Antagna gångbyten: hållplatser med samma namn högst 250 meter från varandra kopplas när kartlagd gångväg saknas. Avstånd uppskattas till fågelvägen × 1,25, tid vid 4,8 km/h, minst en minut. Dessa passager är inte verifierade i gångkartan.')
    return data
