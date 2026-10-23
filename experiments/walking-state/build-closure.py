"""Research artifact only: exact <=30 minute closure with original first-edge witnesses."""
import gzip,hashlib,heapq,json,struct,time
from pathlib import Path

root=Path('.data-build/walking-state');raw=(root/'network.json').read_bytes();fixture=json.loads(raw)
network=fixture['network'];n=len(network['stops']);walks=network['walks'];limit=1800
assert n<=65535 and all(isinstance(w['seconds'],int) and 0<w['seconds']<=65535 for w in walks)
adj=[[] for _ in range(n)]
for index,w in enumerate(walks):adj[w['from']].append((w['to'],w['seconds'],index))
offsets=[0];entries=bytearray();start=time.perf_counter()
for origin in range(n):
    distances={origin:0};first={};heap=[(0,origin)]
    while heap:
        distance,u=heapq.heappop(heap)
        if distances[u]!=distance:continue
        for v,seconds,edge in adj[u]:
            candidate=distance+seconds
            if candidate<=limit and candidate<distances.get(v,float('inf')):
                distances[v]=candidate;first[v]=edge if u==origin else first[u];heapq.heappush(heap,(candidate,v))
    for destination in sorted(first):entries.extend(struct.pack('<HHI',destination,distances[destination],first[destination]))
    offsets.append(len(entries)//8)
header=struct.pack('<8I',0x43574c53,1,n,len(walks),limit,offsets[-1],0,0)
data=header+struct.pack('<'+str(len(offsets))+'I',*offsets)+entries
(root/'closure.bin').write_bytes(data);compressed=gzip.compress(data,mtime=0);(root/'closure.bin.gz').write_bytes(compressed)
metadata={'dataset':fixture['dataset'],'fixtureSHA256':hashlib.sha256(raw).hexdigest(),'sha256':hashlib.sha256(data).hexdigest(),'pairs':offsets[-1],'bytes':len(data),'gzipBytes':len(compressed),'buildSecondsIncludingCompression':time.perf_counter()-start,'stopCount':n,'walkCount':len(walks),'maxSeconds':limit}
(root/'closure-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n');print(metadata)
