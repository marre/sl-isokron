"""Build walking pairs locally over filtered OSM geometry with conservative endpoint checks.
Surface stops need an unambiguous pedestrian way. An identified OSM bus-stop
position can resolve ambiguous/inaccurate GTFS coordinates; all offsets are timed.
No broad nearest-road access; rail platforms and ambiguous points remain data gaps.
"""
import argparse
import csv
import io
import json
import math
import time
import zipfile
from collections import Counter
from pathlib import Path
from osm_walks import distance,load_stops,normalize,blocked_node
from stop_matching import match_bus_stops, junction_edge, way_id

LOCATION = {'radius':5,'search_cutoff':30,'node_snap_tolerance':0,'minimum_reachability':0}

def endpoint_tolerance(stop, features):
    # Only a small coordinate mismatch at an identified surface bus stop. Never
    # broaden boat/rail access or guess across a large gap to the nearest road.
    if not stop.get('busOnly'): return 1
    matches = [n for n in features if n['tags'].get('highway') == 'bus_stop' and not blocked_node(n['tags'])
        and normalize(n['tags'].get('name', '')) == normalize(stop['name'])
        and (not stop.get('platform') or stop['platform'] in (n['tags'].get('local_ref'), n['tags'].get('ref')))
        and distance((stop['lat'], stop['lon']), (n['lat'], n['lon'])) <= 10]
    return 5 if len(matches) == 1 else 1


def identified_anchor(stop, feature, result):
    position={**stop,'lat':feature['lat'],'lon':feature['lon']}
    anchor=select_anchor(position,result,5)
    if anchor is None:
        edge=junction_edge(position,result)
        if edge is None:return None
        anchor=select_anchor(position,{'edges':[edge]},5)
        anchor['junctionVerified']=True
    shift=distance((stop['lat'],stop['lon']),(feature['lat'],feature['lon']))
    return {**anchor,'lat':stop['lat'],'lon':stop['lon'],'osmNode':feature['id'],
        'binding':'identified-osm-bus-stop','coordinateShiftMetres':shift,
        'offsetMetres':shift+anchor['offsetMetres']}


def select_anchor(stop,result,tolerance=1):
    edges=[e for e in result.get('edges') or [] if distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon'])) <= tolerance]
    legacy=[e for e in edges if not any('sliso:urban-default' in str(n) for n in e.get('edge_info',{}).get('names',e.get('names',[])))]
    if legacy:edges=legacy
    if not edges or len({way_id(e) for e in edges}) != 1:
        return None
    edge=min(edges,key=lambda e:distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon'])))
    return {**stop,'anchorLat':edge['correlated_lat'],'anchorLon':edge['correlated_lon'],'way':way_id(edge),'offsetMetres':distance((stop['lat'],stop['lon']),(edge['correlated_lat'],edge['correlated_lon']))}

def surface_stops(feed):
    from build_data import rows
    with zipfile.ZipFile(feed) as z:
        routes={r['route_id']:int(r['route_type']) for r in rows(z,'routes.txt',True)}
        trips={t['trip_id']:routes[t['route_id']] for t in rows(z,'trips.txt',True)}
        modes={}
        with io.TextIOWrapper(z.open('stop_times.txt'),encoding='utf-8-sig',newline='') as f:
            for row in csv.DictReader(f):modes.setdefault(row['stop_id'],set()).add(trips[row['trip_id']])
    return [{**s,'busOnly':modes[s['id']] <= {3,700}} for s in load_stops(feed) if modes.get(s['id']) and modes[s['id']] <= {3,4,700,1000}]

def walking_pair(source_stop, target_stop, seconds, kilometres, provenance, max_minutes):
    if seconds is None or kilometres is None: return None
    offset=source_stop['offsetMetres']+target_stop['offsetMetres']
    duration=math.ceil(seconds+offset/(80/60))
    if not 0<duration<=max_minutes*60: return None
    return {'from':source_stop['id'],'to':target_stop['id'],'seconds':duration,
        'metres':round(kilometres*1000+offset),'source':provenance}


def build(config_file,feed,graph_report,output,max_minutes=30,stop_features=None):
    import valhalla
    if not 5<=max_minutes<=30:raise ValueError('Maximum walking minutes must be 5–30')
    started=time.monotonic();config=json.loads(Path(config_file).read_text())
    config['mjolnir']['max_cache_size']=128*1024*1024
    actor=valhalla.Actor(config)
    candidates=surface_stops(feed);anchors=[]
    features=json.loads(Path(stop_features).read_text()) if stop_features else []
    by_name={}
    for feature in features: by_name.setdefault(normalize(feature['tags'].get('name','')),[]).append(feature)
    for at in range(0,len(candidates),100):
        chunk=candidates[at:at+100]
        result=actor.locate({'locations':[{**LOCATION,'lat':s['lat'],'lon':s['lon']} for s in chunk],'costing':'pedestrian','verbose':True})
        for s,r in zip(chunk,result):
            anchor=select_anchor(s,r,endpoint_tolerance(s,by_name.get(normalize(s['name']),[])))
            if anchor:anchors.append(anchor)
    # A GTFS point can lie between sidewalks. Match the actual named OSM bus
    # stop first, then locate that position, rather than widening road snapping.
    matches=match_bus_stops(candidates,features)
    bound={s['id'] for s in anchors}
    pending=[(s,matches[s['id']]) for s in candidates if s['id'] not in bound and s['id'] in matches]
    identified_count=0
    for at in range(0,len(pending),100):
        chunk=pending[at:at+100]
        located=actor.locate({'locations':[{**LOCATION,'lat':n['lat'],'lon':n['lon']} for s,n in chunk],'costing':'pedestrian','verbose':True})
        for (stop,feature),result in zip(chunk,located):
            anchor=identified_anchor(stop,feature,result)
            if anchor:anchors.append(anchor);identified_count+=1
    # Distinct GTFS platform IDs at the same projected point require review; no free platform hops.
    key=lambda s:(round(s['anchorLat'],6),round(s['anchorLon'],6))
    counts=Counter(key(s) for s in anchors)
    anchors=[s for s in anchors if counts[key(s)]==1]
    print(f'Valhalla endpoint checks: {len(anchors)}/{len(candidates)} surface stops accepted',flush=True)
    geo=json.loads(Path(graph_report).read_text())
    source=f"{geo['version']} / Valhalla {valhalla.__version__} / one-to-one OSM bus-stop assignment <=25m; unique ways or graph-verified junction <=15m; timed offsets; rail access omitted"
    bins={}
    for s in anchors:bins.setdefault((math.floor(s['lat']*100),math.floor(s['lon']*50)),[]).append(s)
    pairs=[];errors=0
    loc=lambda s:{**LOCATION,'lat':s['anchorLat'],'lon':s['anchorLon'],'search_cutoff':1}
    for index,s in enumerate(anchors):
        cell=(math.floor(s['lat']*100),math.floor(s['lon']*50))
        # Bin radius over-covers 2400m at these latitudes; exact haversine then filters.
        targets=[t for a in range(-3,4) for b in range(-4,5) for t in bins.get((cell[0]+a,cell[1]+b),[]) if t['id']!=s['id'] and distance((s['anchorLat'],s['anchorLon']),(t['anchorLat'],t['anchorLon']))<=max_minutes*80]
        for at in range(0,len(targets),100):
            chunk=targets[at:at+100]
            try:
                result=actor.matrix({'sources':[loc(s)],'targets':[loc(t) for t in chunk],'costing':'pedestrian','units':'kilometers','costing_options':{'pedestrian':{'walking_speed':4.8,'step_penalty':0}},'expansion_max_distance':max_minutes*80,'verbose':False})
            except valhalla.ValhallaError:
                errors+=1;continue
            for t,seconds,kilometres in zip(chunk,result['sources_to_targets']['durations'][0],result['sources_to_targets']['distances'][0]):
                pair=walking_pair(s,t,seconds,kilometres,'OSM/Valhalla pedestrian',max_minutes)
                if pair: pairs.append(pair)
        if (index+1)%100==0:print(f'Walking routes {index+1}/{len(anchors)}; pairs {len(pairs)}',flush=True)
    all_stops=load_stops(feed)
    data={'version':geo['version']+'-valhalla-bus-assignment-junction-v4','maxMinutes':max_minutes,'speedKmh':4.8,'profile':source,'stops':[{k:s[k] for k in ('id','lat','lon')} | {k:s[k] for k in ('osmNode','binding','coordinateShiftMetres') if k in s} for s in anchors],'edges':pairs,'reviewed':False,'attribution':['© OpenStreetMap contributors · ODbL','Geofabrik OSM extract; local Valhalla pedestrian routing'],'warnings':['Ofullständigt gångunderlag: automatiskt matchade yttrafiklägen, namngivna OSM-busshållplatser och topologiskt verifierade korta gångkorsningar. Små koordinatavvikelser räknas in i gångtid och avstånd. Stationsplattformar och övriga lägen kräver granskning.','Kända stängda passager och tillträdeshinder är uteslutna. Okända öppettider är en databegränsning.']}
    from walking_audit import audit
    reference_file=Path('data/walking-reference-pairs.json')
    references=json.loads(reference_file.read_text()) if reference_file.exists() else []
    quality=audit(candidates,anchors,pairs,references)
    quality['version']=data['version']
    Path(str(output)+'.audit.json').write_text(json.dumps(quality,ensure_ascii=False,separators=(',',':')))
    if quality['referenceFailures']:
        raise ValueError('Walking reference regressions; inspect '+str(output)+'.audit.json: '+json.dumps(quality['referenceFailures'],ensure_ascii=False))
    Path(output).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    report={'surfaceCandidates':len(candidates),'boundStops':len(anchors),'totalStops':len(all_stops),'directedPairs':len(pairs),'identifiedPositionBindings':identified_count,'matrixErrors':errors,'elapsedSeconds':round(time.monotonic()-started,2),'profile':source,'reviewed':False}
    Path(str(output)+'.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    Path(str(output)+'.anchors.json').write_text(json.dumps(anchors,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',required=True);p.add_argument('--gtfs',required=True);p.add_argument('--graph-report',required=True);p.add_argument('--output',required=True);p.add_argument('--max-minutes',type=int,default=30);p.add_argument('--stop-features');a=p.parse_args();build(a.config,a.gtfs,a.graph_report,a.output,a.max_minutes,a.stop_features)
