"""Estimate bounded all-pairs walking-closure density from reproducible sample roots."""
import collections,heapq,json,statistics,time,sys
from pathlib import Path
fixture=json.loads(Path('.data-build/walking-state/network.json').read_text())
network=fixture['network'];n=len(network['stops']);adj=[[] for _ in range(n)]
for w in network['walks']:adj[w['from']].append((w['to'],w['seconds']))
full='--all' in sys.argv
roots=list(range(n)) if full else sorted(set(range(0,n,max(1,n//64)))|{next(i for i,s in enumerate(network['stops']) if s['id']==q['stop']) for q in fixture['settings']})
rows=[];start=time.perf_counter()
for root in roots:
    dist={root:0};heap=[(0,root)]
    while heap:
        d,u=heapq.heappop(heap)
        if dist[u]!=d:continue
        for v,w in adj[u]:
            candidate=d+w
            if candidate<=1800 and candidate<dist.get(v,float('inf')):
                dist[v]=candidate;heapq.heappush(heap,(candidate,v))
    direct={}
    for v,w in adj[root]:direct[v]=min(w,direct.get(v,float('inf')))
    rows.append({'stop':root,'name':network['stops'][root]['name'],'direct':len(direct),'closure':len(dist)-1,'new':sum(v!=root and v not in direct for v in dist),'improved':sum(dist[v]<w for v,w in direct.items())})
report={'dataset':fixture['dataset'],'full':full,'sampleCount':len(roots),'method':'All stops; directed shortest paths <=1800 seconds.' if full else 'Evenly spaced stop indices plus three query origins; directed shortest paths <=1800 seconds. Not a uniform geographic sample or a full all-pairs build.','elapsedSeconds':time.perf_counter()-start,'sampleDirect':sum(r['direct'] for r in rows),'sampleClosure':sum(r['closure'] for r in rows),'sampleNew':sum(r['new'] for r in rows),'sampleImproved':sum(r['improved'] for r in rows),'rows':rows}
Path('.data-build/walking-state/'+('closure-all.json' if full else 'closure-results.json')).write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='rows'},indent=2))
