"""Rebundle existing sparse previews into ~4 km cells, leaving detail unchanged."""
import copy,gzip,hashlib,json,math,struct,time
from collections import defaultdict
from pathlib import Path

out=Path('.data-build/delivery-lab');root=out/'data';manifests=json.loads((out/'manifests.json').read_bytes());m=manifests['preview256'];areas=m['walkingAreas']
fixture=json.loads((out/'fixture.json').read_bytes());locations=defaultdict(list)
for stop in fixture['stops']:
    if stop['id'] in areas['index']:locations[areas['index'][stop['id']]].append(stop)
def read(ref):
    packed=(root/ref['url'].removeprefix('/data/')).read_bytes();assert hashlib.sha256(packed).hexdigest()==ref['sha256'];raw=gzip.decompress(packed);magic,n=struct.unpack_from('<2I',raw);assert magic==0x534c4131
    directory=json.loads(raw[8:8+n]);base=(8+n+7)//8*8
    return {sid:[(e['minutes'],raw[base+e['offset']:base+e['offset']+e['length']]) for e in entries] for sid,entries in directory.items()}
def pack(profiles):
    directory={};chunks=[];offset=0
    for sid,parts in profiles.items():
        directory[sid]=[]
        for minute,chunk in parts:directory[sid].append(dict(minutes=minute,offset=offset,length=len(chunk)));chunks.append(chunk);offset+=len(chunk)
    text=json.dumps(directory,separators=(',',':'),ensure_ascii=False).encode();head=struct.pack('<2I',0x534c4131,len(text))+text
    return gzip.compress(head+b'\0'*(-len(head)%8)+b''.join(chunks),compresslevel=6,mtime=0)
cells=defaultdict(list)
for i in range(len(areas['files'])):
    positions=locations[i]
    key=(math.floor(sum(s['lat'] for s in positions)/len(positions)/.036),math.floor(sum(s['lon'] for s in positions)/len(positions)/.072)) if positions else ('unbound',i)
    cells[key].append(i)
folder=root/'previewWide';folder.mkdir(exist_ok=True);files=[];index={};started=time.perf_counter()
def flush(items):
    if not items:return
    profiles={}
    for i,p in items:assert not profiles.keys()&p.keys();profiles.update(p)
    packed=pack(profiles)
    if len(packed)>256*1024 and len(items)>1:
        n=len(items)//2;flush(items[:n]);flush(items[n:]);return
    number=len(files);name=f'areas-{number:04d}.bin';(folder/name).write_bytes(packed)
    files.append(dict(url='/data/previewWide/'+name,bytes=len(packed),sha256=hashlib.sha256(packed).hexdigest()))
    for sid in profiles:
        if sid in areas['index']:index[sid]=number
for group in cells.values():
    pending=[];estimate=0
    for i in group:
        ref=areas['files'][i]
        if pending and estimate+ref['bytes']>256*1024:flush(pending);pending=[];estimate=0
        pending.append((i,read(ref)));estimate+=ref['bytes']
    flush(pending)
assert set(index)==set(areas['index'])
wide=copy.deepcopy(m);wide['walkingAreas'].update(index=index,files=files);manifests['previewWide']=wide;(out/'manifests.json').write_text(json.dumps(manifests,separators=(',',':')))
report={'files':len(files),'bytes':sum(f['bytes'] for f in files),'largestBytes':max(f['bytes'] for f in files),'cellDegrees':[.036,.072],'buildSeconds':time.perf_counter()-started};(out/'wide-preview.json').write_text(json.dumps(report,indent=2));print(report)
