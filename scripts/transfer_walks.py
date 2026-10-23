"""Bridge missing station access using explicitly timed, unscoped GTFS transfers.

These are declared connections with estimated walking costs, not surveyed OSM
geometry. Existing walking components/directions are never short-circuited.
"""
import math
import re
from osm_walks import distance

PREFIX='Assumed published GTFS station transfer; '
POLICY='gtfs-station-access-v1'
WARNING='Publicerade stationsbyten: saknade gånganslutningar kompletteras bara där GTFS anger ett riktat byte med positiv minsta bytestid. Tiden används som uppskattad gångtid, utan påhittad gånggeometri eller uppmätt sträcka. Befintliga gångvägar och bytesvillkor behålls.'


def add_transfer_walks(stops, walks, transfers, max_minutes):
    base=[w for w in walks if not w['source'].startswith(PREFIX)]
    parents=list(range(len(stops)))
    def find(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for w in base:
        a,b=find(w['from']),find(w['to'])
        if a!=b:parents[b]=a
    # Freeze components before adding any bridges. Every added direction must
    # have its own feed declaration; one new bridge cannot justify another.
    components=[find(i) for i in range(len(stops))]
    def retired(s):
        return s['retired'] if 'retired' in s else bool(re.match(r'^Läge OLD\S*(?:$|\s+·)',s.get('platform',''),re.IGNORECASE))
    blocked={(r['from'],r['to']) for r in transfers if r['type']==3 and not any(r.get(k) for k in ('fromTrip','toTrip','fromRoute','toRoute'))}
    candidates={};counts=dict(policy=POLICY,eligibleRows=0,addedLinks=0,existingComponent=0,rejectedCost=0)
    for r in transfers:
        a,b=r['from'],r['to'];seconds=r['seconds']
        if (r['type']!=2 or a==b or any(r.get(k) for k in ('fromTrip','toTrip','fromRoute','toRoute'))
            or (a,b) in blocked or retired(stops[a]) or retired(stops[b])
            or not isinstance(seconds,(int,float)) or isinstance(seconds,bool) or not math.isfinite(seconds) or seconds<=0):continue
        counts['eligibleRows']+=1
        if components[a]==components[b]:counts['existingComponent']+=1;continue
        # A geometric lower bound guards obviously inconsistent transfer times;
        # it is never treated as a route or displayed as a measured distance.
        direct=distance((stops[a]['lat'],stops[a]['lon']),(stops[b]['lat'],stops[b]['lon']))
        cost=max(math.ceil(seconds),math.ceil(direct/(4800/3600)))
        if cost>max_minutes*60:counts['rejectedCost']+=1;continue
        if (a,b) not in candidates or seconds>candidates[a,b][0]:candidates[a,b]=(seconds,cost)
    additions=[dict(**{'from':a,'to':b},seconds=cost,source=PREFIX+f'unscoped transfer_type=2; min_transfer_time={seconds:g}s; walking cost estimated; distance unknown') for (a,b),(seconds,cost) in sorted(candidates.items())]
    counts['addedLinks']=len(additions)
    return base+additions,counts


def update_walking_status(stops,walks):
    outgoing={w['from'] for w in walks};mapped={w['from'] for w in walks if not w['source'].startswith('Assumed ')}
    for i,s in enumerate(stops):s['walking']='available' if i in mapped else 'estimated' if i in outgoing else 'missing'
