"""GTFS-to-OSM platform identities by explicit binding or named area and code."""
import math
from osm_walks import distance, normalize, timed, FORBIDDEN


def platform_allowed(tags):
    return (tags.get('railway') == 'platform' or tags.get('highway') == 'platform') and not timed(tags) and tags.get('foot') not in FORBIDDEN | {'use_sidepath'} and (tags.get('access') not in FORBIDDEN or tags.get('foot') in ('yes','designated','permissive'))


def project(position, points):
    """Nearest point on this identified platform's own mapped boundary."""
    scale = math.cos(math.radians(position['lat']))
    best = None
    for a,b in zip(points,points[1:]):
        x,y = (b['lon']-a['lon'])*scale,b['lat']-a['lat']
        if x*x+y*y == 0: continue
        t = max(0,min(1,((position['lon']-a['lon'])*scale*x+(position['lat']-a['lat'])*y)/(x*x+y*y)))
        p = dict(lat=a['lat']+t*(b['lat']-a['lat']),lon=a['lon']+t*(b['lon']-a['lon']))
        d = distance((position['lat'],position['lon']),(p['lat'],p['lon']))
        if best is None or d < best['offsetMetres']: best = {**p,'offsetMetres':d}
    return best


def platform_positions(bindings, stops, ways):
    known = {s['id']:s for s in stops}; result=[]
    for binding in bindings:
        s = known.get(binding['id'])
        if s is None: continue # Removed stops are not reintroduced.
        if any(abs(s[k]-binding[k])>1e-6 for k in ('lat','lon')) or normalize(s['name']) != normalize(binding['name']) or s['platform'] != binding['platform']:
            raise ValueError('Stale platform identity: '+binding['id'])
        way=ways.get(binding['osmWay'])
        if not way or not platform_allowed(way['tags']): raise ValueError('Missing/restricted mapped platform: '+str(binding['osmWay']))
        refs=set((way['tags'].get('local_ref') or way['tags'].get('ref','')).split(';'))
        if binding['platform'] not in refs: raise ValueError('Platform number changed: '+binding['id'])
        p=project(s,way['points'])
        if p is None or p['offsetMetres']>25: raise ValueError('Platform geometry moved: '+binding['id'])
        result.append({**s,'accessSeconds':binding.get('accessSeconds',0),'platformWay':binding['osmWay'],'platformLat':p['lat'],'platformLon':p['lon'],'offsetMetres':p['offsetMetres']})
    return result


def platform_refs(tags):
    values=[tags.get('local_ref') or tags.get('ref','')]
    values += [v for k,v in tags.items() if k.startswith('gtfs:platform_code:')]
    if not any(values) and tags.get('name','').isdigit():values.append(tags['name'])
    return {ref.strip() for value in values for ref in value.split(';') if ref.strip()}


def discover_platforms(stops, ways, way_areas, excluded=()):
    """Bind surface rail stops by named stop-area membership AND platform code.

    Coordinates only validate an independently identified platform. Underground,
    estimated and ambiguous identities remain unbound.
    """
    result=[]
    for stop in stops:
        if stop['id'] in excluded or not stop.get('platform'):continue
        candidates=[]
        for wid,way in ways.items():
            tags=way['tags']
            if tags.get('railway')!='platform' or not platform_allowed(tags):continue
            if tags.get('fixme') or tags.get('tunnel')=='yes' or tags.get('location')=='underground' or tags.get('subway')=='yes':continue
            if any(part.strip().startswith('-') for key in ('level','layer') for part in tags.get(key,'').split(';')):continue
            if normalize(stop['name']) not in {normalize(n) for n in way_areas.get(wid,())}:continue
            if stop['platform'] not in platform_refs(tags):continue
            p=project(stop,way['points'])
            if p is not None and p['offsetMetres']<=25:candidates.append((wid,p))
        if len(candidates)==1:
            wid,p=candidates[0]
            result.append({**stop,'accessSeconds':0,'platformWay':wid,'platformLat':p['lat'],'platformLon':p['lon'],'offsetMetres':p['offsetMetres'],'identity':'named-osm-stop-area-platform-ref'})
    return result
