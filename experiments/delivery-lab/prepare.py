"""Repack verified native contours spatially. Research only; no source/data changes."""
import copy,gzip,hashlib,json,math,os,struct,time
from collections import defaultdict
from pathlib import Path

src=Path(os.environ.get('SLISO_DATA_ROOT','public/data')).resolve()
out=Path('.data-build/delivery-lab');root=out/'data';root.mkdir(parents=True,exist_ok=True)
m=json.loads((src/'manifest.json').read_bytes());areas=m['walkingAreas'];assert areas['format']=='sliso-contours-v1'
def load(ref):
    raw=(src/ref['url'].removeprefix('/data/')).read_bytes()
    assert len(raw)==ref['bytes'] and hashlib.sha256(raw).hexdigest()==ref['sha256']
    return raw
stops=json.loads(load(m['stops']));by_id={s['id']:s for s in stops};locations=defaultdict(list)
for sid,file in areas['index'].items():
    if sid in by_id:locations[file].append(by_id[sid])
original=root/m['version']
if not original.exists():original.symlink_to(src/m['version'],target_is_directory=True)
groups=defaultdict(list)
for i in range(len(areas['files'])):
    positions=locations[i]
    if positions:
        lat=sum(s['lat'] for s in positions)/len(positions);lon=sum(s['lon'] for s in positions)/len(positions)
        # ~1 km spatial cells, not arbitrary file-order concatenation.
        key=(math.floor(lat/.009),math.floor(lon/.018))
    else:key=('unbound',i)
    groups[key].append(i)

def unpack(raw,preview=False):
    raw=gzip.decompress(raw);magic,n=struct.unpack_from('<2I',raw);assert magic==0x534c4131
    directory=json.loads(raw[8:8+n]);base=(8+n+7)//8*8;profiles={}
    for sid,entries in directory.items():
        parts=[]
        first=min((e['minutes'] for e in entries),default=0)
        for e in entries:
            if preview and e['minutes']!=first and e['minutes']%5:continue
            selected=e
            chunk=raw[base+selected['offset']:base+selected['offset']+selected['length']]
            assert len(chunk)==selected['length'];parts.append((e['minutes'],chunk))
        profiles[sid]=parts
    return profiles
def pack(profiles):
    directory={};chunks=[];offset=0
    for sid,parts in profiles.items():
        directory[sid]=[]
        for minute,chunk in parts:
            directory[sid].append(dict(minutes=minute,offset=offset,length=len(chunk)));chunks.append(chunk);offset+=len(chunk)
    text=json.dumps(directory,separators=(',',':'),ensure_ascii=False).encode();header=struct.pack('<2I',0x534c4131,len(text))+text
    return gzip.compress(header+b'\0'*(-len(header)%8)+b''.join(chunks),compresslevel=6,mtime=0)

variants={}
for name,target,preview in [('full128',128,False),('full256',256,False),('full512',512,False),('preview256',256,True)]:
    folder=root/name;folder.mkdir(exist_ok=True)
    variants[name]={'folder':folder,'target':target*1024,'preview':preview,'files':[],'index':{},'sourceFiles':[],'oversized':0,'choices':{}}
started=time.perf_counter();verified=0
def flush(v,items):
    if not items:return
    profiles={}
    for old,p in items:
        assert not profiles.keys()&p.keys();profiles.update(p)
    raw=pack(profiles)
    if len(raw)>v['target'] and len(items)>1:
        split=len(items)//2;flush(v,items[:split]);flush(v,items[split:]);return
    number=len(v['files']);name=f'areas-{number:04d}.bin';(v['folder']/name).write_bytes(raw)
    # The geometry bytes are copied verbatim; prove every minute/byte survives.
    assert unpack(raw)==profiles
    v['files'].append(dict(url='/data/'+v['folder'].name+'/'+name,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()))
    for sid in profiles:
        if sid in areas['index']:v['index'][sid]=number
        if v['preview']:v['choices'][sid]=sorted(minute for minute,chunk in profiles[sid])
    v['sourceFiles'].append([old for old,p in items]);v['oversized']+=len(raw)>v['target']
for count,indices in enumerate(groups.values()):
    items=[]
    for i in indices:
        raw=load(areas['files'][i]);items.append((i,unpack(raw),unpack(raw,True),len(raw)));verified+=1
    for v in variants.values():
        pending=[];estimate=0
        for i,full,preview,size in items:
            estimated=size if not v['preview'] else len(pack(preview))
            if pending and estimate+estimated>v['target']:flush(v,pending);pending=[];estimate=0
            pending.append((i,preview if v['preview'] else full));estimate+=estimated
        flush(v,pending)
    if count%200==0:print('Spatial cells',count,'verified source files',verified,flush=True)
manifests={'baseline':m};report={'dataset':m['version'],'sourceFiles':len(areas['files']),'sourceBytes':sum(r['bytes'] for r in areas['files']),'sourceArchivesVerified':verified,'cellDegrees':[.009,.018],'variants':{}}
for name,v in variants.items():
    assert set(v['index'])==set(areas['index'])
    next_m=copy.deepcopy(m);next_m['walkingAreas'].update(index=v['index'],files=v['files']);manifests[name]=next_m
    next_m['walkingAreas']['sources']=areas['index']
    if v['preview']:next_m['walkingAreas']['previewKnots']=v['choices']
    report['variants'][name]={'files':len(v['files']),'bytes':sum(r['bytes'] for r in v['files']),'largestBytes':max(r['bytes'] for r in v['files']),'oversizedSingleSourceFiles':v['oversized'],'sourceFiles':v['sourceFiles']}
report['buildSeconds']=time.perf_counter()-started
(out/'manifests.json').write_text(json.dumps(manifests,separators=(',',':')))
(out/'layout.json').write_text(json.dumps(report,separators=(',',':')))
fixture_path=out/'fixture.json'
if fixture_path.exists():
    fixture=json.loads(fixture_path.read_bytes());assert fixture['stops']==stops
    if 'dataset' in fixture:assert fixture['dataset']==m['version']
else:
    # Compatibility with the recorded fixtures used in the original experiment.
    fixture=json.loads(Path('.data-build/profiling/fixture.json').read_bytes())
    prior=json.loads(Path('.data-build/fixed-release/data/manifest.json').read_bytes())
    assert fixture['dataset']==prior['version']
    for key in ('stops','routes','walks','transfers','trips'):assert m[key]['sha256']==prior[key]['sha256']
    assert [[r['sha256'],r['from'],r['until']] for r in sum(m['days'].values(),[])]==[[r['sha256'],r['from'],r['until']] for r in sum(prior['days'].values(),[])]
    fixture_path.write_text(json.dumps({'settings':fixture['settings'],'result':fixture['result'],'stops':stops},separators=(',',':')))
print(json.dumps({k:v for k,v in report.items() if k!='variants'},indent=2));print({n:{k:v for k,v in r.items() if k!='sourceFiles'} for n,r in report['variants'].items()})
