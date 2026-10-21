"""Explicit GTFS-to-OSM platform identities; no nearest-station inference."""
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
