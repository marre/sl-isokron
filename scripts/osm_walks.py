"""Conservative offline OSM walking graph. Requires osmium; no routing API.
Only unique, same-name bus-stop nodes within 1 m of GTFS coordinates are auto-bound.
No nearest-road connectors. Other bindings require an explicitly reviewed input file.
"""
import argparse
import csv
import gzip
import hashlib
import io
from itertools import pairwise
import json
import math
import time
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path

SPEED = 4.8
SAFE = {'footway','pedestrian','path','steps','living_street','residential','service','unclassified','track'}
EXPLICIT = {'cycleway','tertiary','secondary','primary','tertiary_link','secondary_link','primary_link'}
FORBIDDEN = {'no','private','customers','delivery','agricultural','forestry'}

def timed(tags):
    return (bool(tags.get('opening_hours')) and tags['opening_hours'] != '24/7') or any('conditional' in k for k in tags)

def walkable(tags):
    h = tags.get('highway')
    if h not in SAFE | EXPLICIT or timed(tags) or tags.get('foot') in FORBIDDEN | {'use_sidepath'}:
        return False
    if tags.get('access') in FORBIDDEN and tags.get('foot') not in ('yes','designated','permissive'):
        return False
    # In Sweden ordinary tertiary roads permit pedestrians by default, including
    # rural roads without a tagged sidewalk. A vehicle speed limit is not a foot
    # access restriction. This models access, not walking comfort or road safety.
    if tags.get('motorroad') == 'yes':
        return False
    default_tertiary = h in {'tertiary','tertiary_link'}
    if h in EXPLICIT and not default_tertiary and tags.get('foot') not in ('yes','designated','permissive') and tags.get('sidewalk') not in ('yes','both','left','right'):
        return False
    if tags.get('construction') or tags.get('proposed') or tags.get('route') == 'ferry' or tags.get('conveying') in ('forward','backward','reversible','yes'):
        return False
    return True

def blocked_node(tags):
    if timed(tags) or tags.get('foot') in FORBIDDEN | {'use_sidepath'}:
        return True
    if tags.get('access') in FORBIDDEN and tags.get('foot') not in ('yes','designated','permissive'):
        return True
    # Unknown gate availability is conservatively omitted, even in daytime.
    return tags.get('barrier') not in (None,'no','entrance','kerb')

def distance(a,b):
    lat1,lon1,lat2,lon2=map(math.radians, [a[0],a[1],b[0],b[1]])
    x=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000*2*math.atan2(math.sqrt(x),math.sqrt(max(0,1-x)))

def normalize(s):
    return ' '.join(unicodedata.normalize('NFC',s).casefold().split())

def load_stops(feed):
    with zipfile.ZipFile(feed) as z:
        with io.TextIOWrapper(z.open('stops.txt'),encoding='utf-8-sig',newline='') as f:
            return [dict(id=s['stop_id'],name=s['stop_name'],platform=s.get('platform_code',''),lat=float(s['stop_lat']),lon=float(s['stop_lon'])) for s in csv.DictReader(f) if s.get('location_type','0') in ('','0')]

def bindings(stops, features, graph_nodes):
    # Spatial hash only filters candidates; physical identity is required for acceptance.
    bins = {}
    for n in features:
        if n['id'] not in graph_nodes or n['tags'].get('highway') != 'bus_stop':
            continue
        key=(math.floor(n['lat']*10000),math.floor(n['lon']*10000))
        bins.setdefault(key,[]).append(n)
    candidates=[]
    for s in stops:
        key=(math.floor(s['lat']*10000),math.floor(s['lon']*10000))
        nearby=[n for a in (-1,0,1) for b in (-1,0,1) for n in bins.get((key[0]+a,key[1]+b),[])]
        matches=[]
        for n in nearby:
            tags=n['tags']
            if normalize(tags.get('name','')) != normalize(s['name']):
                continue
            if s['platform'] and s['platform'] not in (tags.get('local_ref'),tags.get('ref')):
                continue
            if distance((s['lat'],s['lon']),(n['lat'],n['lon'])) <= 1:
                matches.append(n)
        if len(matches)==1:
            candidates.append((s,matches[0]))
    usage=Counter(n['id'] for s,n in candidates)
    return [dict(id=s['id'],node=n['id'],lat=s['lat'],lon=s['lon'],verified=True,source=f"OSM node/{n['id']}; unique bus-stop name/platform and <=1m coordinate match") for s,n in candidates if usage[n['id']]==1]

def extract(pbf,feed,output,reviewed=None):
    import osmium
    started=time.monotonic()
    stops=load_stops(feed)
    bounds=(min(s['lon'] for s in stops)-.05,min(s['lat'] for s in stops)-.05,max(s['lon'] for s in stops)+.05,max(s['lat'] for s in stops)+.05)
    def inside(lat,lon):return bounds[0]<=lon<=bounds[2] and bounds[1]<=lat<=bounds[3]
    blocked=set();features=[]
    platform_file=Path('data/platform-bindings.json')
    platform_bindings=json.loads(platform_file.read_text()) if platform_file.exists() else []
    platform_ids={b['osmWay'] for b in platform_bindings};platform_ways={}
    access_file=Path('data/station-access.json')
    access=json.loads(access_file.read_text()) if access_file.exists() else {}
    elevators=set(access.get('elevators',[]));fare_gates=set(access.get('fareGates',[]))
    keys=osmium.filter.KeyFilter('barrier','access','foot','opening_hours','access:conditional','foot:conditional','highway','public_transport')
    processor=osmium.FileProcessor(str(pbf)).with_filter(osmium.filter.EntityFilter(osmium.osm.NODE)).with_filter(keys)
    for n in processor:
        if not inside(n.location.lat,n.location.lon):continue
        tags=dict(n.tags)
        gate_tags={**tags,'barrier':'no'} if n.id in fare_gates and tags.get('amenity')=='ticket_validator' and tags.get('operator')=='SL' else tags
        if blocked_node(gate_tags):blocked.add(n.id)
        if tags.get('highway')=='bus_stop':features.append(dict(id=str(n.id),lat=n.location.lat,lon=n.location.lon,tags=tags))
    print(f'OSM restriction scan: {len(blocked)} blocked nodes, {len(features)} bus-stop nodes',flush=True)
    edges=[];nodes=set();accepted_ways=0;excluded_ways=0
    wayfilter=osmium.filter.TagFilter(*[('highway',h) for h in sorted(SAFE|EXPLICIT)],('railway','platform'),('highway','platform'),('highway','elevator'))
    processor=osmium.FileProcessor(str(pbf)).with_locations().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(wayfilter)
    for w in processor:
        tags=dict(w.tags)
        is_platform=w.id in platform_ids
        is_elevator=w.id in elevators and tags.get('highway')=='elevator'
        if is_platform:
            platform_ways[w.id]={'tags':tags,'points':[{'lat':n.lat,'lon':n.lon} for n in w.nodes if n.location.valid()]}
        from platform_access import platform_allowed
        if not (platform_allowed(tags) if is_platform else walkable({**tags,'highway':'footway'}) if is_elevator else walkable(tags)):
            excluded_ways+=1;continue
        relevant=False
        for a,b in pairwise(w.nodes):
            if a.ref in blocked or b.ref in blocked or not a.location.valid() or not b.location.valid():continue
            if not inside(a.lat,a.lon) or not inside(b.lat,b.lon):continue
            metres=distance((a.lat,a.lon),(b.lat,b.lon))
            if metres<=.001 and not is_elevator:continue
            edges.append(dict(from_=str(a.ref),to=str(b.ref),metres=round(metres,3),source=f'OSM way/{w.id} version/{w.version}',oneWay=tags.get('oneway:foot')=='yes'))
            if is_elevator:edges[-1]['kind']='elevator';edges[-1]['level']=tags.get('level','')
            # Foot-specific -1 is supported independently of vehicle one-way rules.
            if tags.get('oneway:foot')=='-1':edges[-1]['from_'],edges[-1]['to']=edges[-1]['to'],edges[-1]['from_'];edges[-1]['oneWay']=True
            nodes.update((str(a.ref),str(b.ref)));relevant=True
        if relevant:
            accepted_ways+=1
            if accepted_ways%50000==0:print(f'OSM walking ways: {accepted_ways}; segments: {len(edges)}',flush=True)
    from platform_access import platform_positions
    platforms=platform_positions(platform_bindings,stops,platform_ways)
    accepted=bindings(stops,features,nodes)
    if reviewed:
        overrides=json.loads(Path(reviewed).read_text())
        known={s['id']:s for s in stops}
        for s in overrides:
            if s.get('verified') is not True or not s.get('source') or s['node'] not in nodes or s['id'] not in known:
                raise ValueError('Invalid reviewed binding')
            orig=known[s['id']]
            if abs(orig['lat']-s['lat'])>1e-6 or abs(orig['lon']-s['lon'])>1e-6:
                raise ValueError('Reviewed binding has stale GTFS coordinates')
        ids={s['id'] for s in overrides};accepted=[s for s in accepted if s['id'] not in ids]+overrides
    digest=hashlib.sha256()
    with Path(pbf).open('rb') as f:
        while b:=f.read(4*1024*1024):digest.update(b)
    version='geofabrik-sweden-'+digest.hexdigest()[:20]+'-default-tertiary-platform-lift-v5'
    graph=dict(platforms=platforms,platformWays=sorted(platform_ids),version=version,attribution=['© OpenStreetMap contributors · ODbL','OSM extract: Geofabrik'],nodes=sorted(nodes),stops=accepted,edges=[{'from':e.pop('from_'),**e} for e in edges])
    with gzip.open(output,'wt',encoding='utf-8') as f:json.dump(graph,f,ensure_ascii=False,separators=(',',':'))
    report=dict(osmSha256=digest.hexdigest(),bounds=bounds,nodes=len(nodes),segments=len(edges),walkingWays=accepted_ways,excludedWays=excluded_ways,blockedNodes=len(blocked),gtfsStops=len(stops),boundStops=len(accepted),unboundStops=len(stops)-len(accepted),elapsedSeconds=round(time.monotonic()-started,2),platforms=platforms,profile='4.8 km/h. Conservative access. No spatially invented connectors; many unbound stops expected.',version=version)
    Path(str(output)+'.bus-stops.json').write_text(json.dumps(features,ensure_ascii=False,separators=(',',':')))
    Path(str(output)+'.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pbf',required=True);p.add_argument('--gtfs',required=True);p.add_argument('--output',required=True);p.add_argument('--reviewed-bindings');a=p.parse_args()
    extract(a.pbf,a.gtfs,a.output,a.reviewed_bindings)
