"""Build walking pairs locally over filtered OSM geometry with conservative endpoint checks.
Only surface bus/boat stops within 1m of one unambiguous pedestrian way are automatic.
No invented access legs; rail platforms and ambiguous points remain explicit data gaps.
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
from osm_walks import distance,load_stops

LOCATION = {'radius':1,'search_cutoff':30,'node_snap_tolerance':0,'minimum_reachability':0}

def select_anchor(stop,result):
    edges=[e for e in result.get('edges') or [] if distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon'])) <= 1]
    if not edges or len({e['way_id'] for e in edges}) != 1:
        return None
    edge=min(edges,key=lambda e:distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon'])))
    return {**stop,'anchorLat':edge['correlated_lat'],'anchorLon':edge['correlated_lon'],'way':edge['way_id'],'offsetMetres':distance((stop['lat'],stop['lon']),(edge['correlated_lat'],edge['correlated_lon']))}

def surface_stops(feed):
    from build_data import rows
    with zipfile.ZipFile(feed) as z:
        routes={r['route_id']:int(r['route_type']) for r in rows(z,'routes.txt',True)}
        trips={t['trip_id']:routes[t['route_id']] for t in rows(z,'trips.txt',True)}
        modes={}
        with io.TextIOWrapper(z.open('stop_times.txt'),encoding='utf-8-sig',newline='') as f:
            for row in csv.DictReader(f):modes.setdefault(row['stop_id'],set()).add(trips[row['trip_id']])
    return [s for s in load_stops(feed) if modes.get(s['id']) and modes[s['id']] <= {3,4,700,1000}]

def build(config_file,feed,graph_report,output,max_minutes=30):
    import valhalla
    if not 5<=max_minutes<=30:raise ValueError('Maximum walking minutes must be 5–30')
    started=time.monotonic();config=json.loads(Path(config_file).read_text())
    config['mjolnir']['max_cache_size']=128*1024*1024
    actor=valhalla.Actor(config)
    candidates=surface_stops(feed);anchors=[]
    for at in range(0,len(candidates),100):
        chunk=candidates[at:at+100]
        result=actor.locate({'locations':[{**LOCATION,'lat':s['lat'],'lon':s['lon']} for s in chunk],'costing':'pedestrian'})
        for s,r in zip(chunk,result):
            anchor=select_anchor(s,r)
            if anchor:anchors.append(anchor)
    # Distinct GTFS platform IDs at the same projected point require review; no free platform hops.
    key=lambda s:(round(s['anchorLat'],6),round(s['anchorLon'],6))
    counts=Counter(key(s) for s in anchors)
    anchors=[s for s in anchors if counts[key(s)]==1]
    print(f'Valhalla endpoint checks: {len(anchors)}/{len(candidates)} surface stops accepted',flush=True)
    geo=json.loads(Path(graph_report).read_text())
    source=f"{geo['version']} / Valhalla {valhalla.__version__} / endpoint precision <=1m; unreviewed stations omitted"
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
                if seconds is not None and 0<seconds<=max_minutes*60:
                    pairs.append({'from':s['id'],'to':t['id'],'seconds':math.ceil(seconds),'metres':round(kilometres*1000),'source':source})
        if (index+1)%100==0:print(f'Walking routes {index+1}/{len(anchors)}; pairs {len(pairs)}',flush=True)
    all_stops=load_stops(feed)
    data={'version':geo['version']+'-valhalla-precision1m-v1','maxMinutes':max_minutes,'speedKmh':4.8,'stops':[{k:s[k] for k in ('id','lat','lon')} for s in anchors],'edges':pairs,'reviewed':False,'attribution':['© OpenStreetMap contributors · ODbL','Geofabrik OSM extract; local Valhalla pedestrian routing'],'warnings':['Ofullständigt gångunderlag: endast entydiga buss-/båtlägen inom 1m av en modellerad gångväg. Inga fria anslutningslinjer har skapats. Stationsplattformar och övriga lägen kräver granskning.','Kända stängda passager och tillträdeshinder är uteslutna. Okända öppettider är en databegränsning.']}
    Path(output).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    report={'surfaceCandidates':len(candidates),'boundStops':len(anchors),'totalStops':len(all_stops),'directedPairs':len(pairs),'matrixErrors':errors,'elapsedSeconds':round(time.monotonic()-started,2),'profile':source,'reviewed':False}
    Path(str(output)+'.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    Path(str(output)+'.anchors.json').write_text(json.dumps(anchors,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',required=True);p.add_argument('--gtfs',required=True);p.add_argument('--graph-report',required=True);p.add_argument('--output',required=True);p.add_argument('--max-minutes',type=int,default=30);a=p.parse_args();build(a.config,a.gtfs,a.graph_report,a.output,a.max_minutes)
