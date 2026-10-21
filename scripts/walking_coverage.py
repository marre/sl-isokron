"""Audit precomputed stop profiles and directed walking access to those profiles.

This diagnoses data coverage, not a guarantee that a search has enough time or
continuous walking budget left. It never creates routes or geometry.
"""
import argparse
import csv
import hashlib
import heapq
import json
import math
from collections import defaultdict
from pathlib import Path


def coverage(stops, edges, profiles, max_minutes=30):
    if not 5 <= max_minutes <= 30:raise ValueError('Walking limit must be 5–30 minutes')
    indices={s['id']:i for i,s in enumerate(stops)}
    if not set(profiles) <= indices.keys():raise ValueError('Walking profile references an unknown stop')
    incoming=[[] for _ in stops]
    for edge in edges:
        a,b,seconds=edge['from'],edge['to'],edge['seconds']
        if not 0<=a<len(stops) or not 0<=b<len(stops) or not math.isfinite(seconds) or seconds<=0:raise ValueError('Invalid directed walking edge')
        incoming[b].append((a,seconds))
    seconds=[math.inf]*len(stops);target=[None]*len(stops);queue=[]
    for sid in sorted(profiles):
        at=indices[sid];seconds[at]=0;target[at]=sid;heapq.heappush(queue,(0,at))
    # Reverse multi-source Dijkstra: reaching a stop FROM a profile does not
    # establish the required outward walking access FROM that stop.
    while queue:
        elapsed,at=heapq.heappop(queue)
        if elapsed!=seconds[at]:continue
        for previous,cost in incoming[at]:
            total=elapsed+cost
            if total<seconds[previous] and total+60<=max_minutes*60:
                seconds[previous]=total;target[previous]=target[at];heapq.heappush(queue,(total,previous))
    rows=[]
    for i,stop in enumerate(stops):
        rows.append({k:stop.get(k,'') for k in ('id','name','stationId','platform','lat','lon','walking')} | {
            'ownProfile':stop['id'] in profiles,'profileStop':target[i],
            'accessSeconds':seconds[i] if math.isfinite(seconds[i]) else None})
    gaps=[r for r in rows if r['profileStop'] is None]
    grouped=defaultdict(list)
    for row in rows:grouped[row['stationId'] or row['name']].append(row)
    stations=[dict(id=sid,name=group[0]['name'],stops=len(group)) for sid,group in grouped.items() if all(r['profileStop'] is None for r in group)]
    return dict(totalStops=len(stops),precomputedProfiles=len(profiles),withoutOwnProfile=len(stops)-len(profiles),
        viaWalkingAccess=sum(not r['ownProfile'] and r['profileStop'] is not None for r in rows),
        withoutKnownProfileAccess=len(gaps),uncoveredStations=sorted(stations,key=lambda s:(s['name'],s['id'])),
        byWalkingMinutes={str(n):sum(r['accessSeconds'] is not None and r['accessSeconds']+60<=n*60 for r in rows) for n in (5,10,15,20,25,30) if n<=max_minutes},
        note='Potential outward access with a full walking allowance and at least one contour minute left. A particular search can have less time or walking budget remaining. Coverage gaps are missing exit data, not evidence that walking is impossible.',stops=rows)


def published(manifest_path,max_minutes=30):
    manifest_path=Path(manifest_path);m=json.loads(manifest_path.read_text());root=manifest_path.parent
    def read(ref):
        url=ref['url']
        if not url.startswith('/data/') or '..' in Path(url).parts:raise ValueError('Invalid manifest path')
        raw=(root/url.removeprefix('/data/')).read_bytes()
        if len(raw)!=ref['bytes'] or hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('Data integrity check failed: '+url)
        return json.loads(raw)
    stops=read(m['stops']);payload=read(m['walks'])
    edges=[dict(from_=r[0],to=r[1],seconds=r[2]) for r in payload['edges']] if isinstance(payload,dict) and payload.get('schema')==1 else payload
    if isinstance(payload,dict):
        for edge in edges:edge['from']=edge.pop('from_')
    areas=m.get('walkingAreas',{});profiles=areas.get('index',{})
    if any(not isinstance(i,int) or not 0<=i<len(areas['files']) for i in profiles.values()):raise ValueError('Invalid profile file index')
    return {'dataset':m['version'],'walkingVersion':m['walkingVersion'],**coverage(stops,edges,profiles,max_minutes)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',required=True);parser.add_argument('--output',required=True);parser.add_argument('--csv');parser.add_argument('--max-minutes',type=int,default=30)
    args=parser.parse_args();report=published(args.manifest,args.max_minutes)
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if args.csv:
        with open(args.csv,'w',encoding='utf-8-sig',newline='') as stream:
            writer=csv.DictWriter(stream,fieldnames=list(report['stops'][0]) if report['stops'] else ['id','name'])
            writer.writeheader();writer.writerows(r for r in report['stops'] if r['profileStop'] is None)
    print(json.dumps({k:v for k,v in report.items() if k not in ('stops','uncoveredStations')},ensure_ascii=False))


if __name__=='__main__':main()
