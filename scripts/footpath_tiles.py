"""Publish the filtered physical OSM graph for bounded, client-side origin access.

Input is prepare_pedestrian_tiles.py's pedestrian PBF, not the unfiltered extract.
No spatial connectors between graph components are invented. Stop positions use
already verified Valhalla anchors on their identified original OSM way.
"""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path

FORMAT='sliso-footpaths-v1'
TILE=.05

def compact(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()

def project(point,a,b):
    scale=math.cos(math.radians(point[0]));x=(b[1]-a[1])*scale;y=b[0]-a[0]
    t=max(0,min(1,((point[1]-a[1])*scale*x+(point[0]-a[0])*y)/(x*x+y*y))) if x*x+y*y else 0
    p=(a[0]+t*y,a[1]+t*(b[1]-a[1]))
    return t,p,math.hypot((p[1]-point[1])*scale,p[0]-point[0])*111195

def tile_keys(a,b):
    for y in range(math.floor(min(a[0],b[0])/TILE),math.floor(max(a[0],b[0])/TILE)+1):
        for x in range(math.floor(min(a[1],b[1])/TILE),math.floor(max(a[1],b[1])/TILE)+1):yield f'{y}_{x}'

def write_tiles(nodes,edges,bindings,output,version):
    """edges: (from,to,metres,seconds,oneway); bindings: node -> stop records."""
    tiles=defaultdict(lambda:{'nodes':{},'edges':[],'stops':{}})
    for a,b,metres,seconds,oneway in edges:
        for key in tile_keys(nodes[a],nodes[b]):
            tile=tiles[key]
            for n in (a,b):
                lat,lon=nodes[n];tile['nodes'][n]=[n,round(lat*1e7),round(lon*1e7)]
                for binding in bindings.get(n,[]):tile['stops'][binding[0]]=[n,*binding]
            tile['edges'].append([a,b,round(metres,3),round(seconds,3),int(oneway)])
    output=Path(output);output.mkdir(parents=True,exist_ok=True);index={}
    for key,tile in sorted(tiles.items()):
        raw=gzip.compress(compact({'schema':1,'nodes':list(tile['nodes'].values()),'edges':tile['edges'],'stops':list(tile['stops'].values())}),mtime=0)
        name='footpaths-'+key+'.bin';(output/name).write_bytes(raw)
        index[key]=dict(url=name,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
    meta=dict(format=FORMAT,tileDegrees=TILE,sourceVersion=version,index=index)
    (output/'index.json').write_bytes(compact(meta))
    print(json.dumps(dict(tiles=len(index),bytes=sum(r['bytes'] for r in index.values()),boundStops=sum(map(len,bindings.values())))),flush=True)
    return meta

def build(pbf,anchors,output,surface_pbf=None):
    import osmium
    from osm_walks import distance
    anchors=json.loads(Path(anchors).read_text());by_way=defaultdict(list)
    way_sources=[]
    for source_pbf in (surface_pbf or pbf,pbf):
        way_sources.append({w.id:int(w.tags['source:geometry'].split('/')[1].split()[0]) for w in osmium.FileProcessor(str(source_pbf)).with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))})
    for s in anchors:
        original=way_sources[1 if s.get('accessSeconds') else 0].get(int(s['way']))
        if original is not None:by_way[original].append(s)
    del way_sources
    nodes={};edges=[];bindings=defaultdict(list)
    for n in osmium.FileProcessor(str(pbf)).with_filter(osmium.filter.EntityFilter(osmium.osm.NODE)):
        nodes[n.id]=(n.location.lat,n.location.lon)
    next_id=max(nodes)+1;bound=set()
    for way in osmium.FileProcessor(str(pbf)).with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)):
        source=way.tags.get('source:geometry','')
        if not source.startswith('OSM way/'):raise ValueError('Unfiltered input: missing OSM walking provenance')
        original=int(source.split('/')[1].split()[0]);refs=[n.ref for n in way.nodes]
        segments=list(zip(refs,refs[1:]));splits=defaultdict(list)
        for s in by_way.get(original,[]):
            if s['id'] in bound:continue
            candidates=[(*project((s['anchorLat'],s['anchorLon']),nodes[a],nodes[b]),i) for i,(a,b) in enumerate(segments)]
            t,p,gap,i=min(candidates,key=lambda c:c[2])
            if gap>1:continue
            # Anchors carry the established endpoint access cost, including any
            # identified station-platform allowance. No link to a different way.
            a,b=segments[i]
            if t<1e-8:node=a
            elif t>1-1e-8:node=b
            else:
                node=next_id;next_id+=1;nodes[node]=p;splits[i].append((t,node))
            bindings[node].append([s['id'],math.ceil(s.get('offsetMetres',0)/ (80/60)+s.get('accessSeconds',0)),round(s.get('offsetMetres',0),3),s['lat'],s['lon']])
            bound.add(s['id'])
        for i,(a,b) in enumerate(segments):
            chain=[a,*[n for _,n in sorted(splits[i])],b]
            for u,v in zip(chain,chain[1:]):
                metres=distance(nodes[u],nodes[v]);seconds=metres/(80/60)
                if way.tags.get('highway')=='elevator':seconds+=120
                edges.append((u,v,metres,max(.001,seconds),way.tags.get('oneway:foot')=='yes'))
    if len(bound)!=len(anchors):raise ValueError(f'Walking graph/anchor mismatch: bound {len(bound)} of {len(anchors)}; refusing to publish partial or incorrectly indexed access data')
    return write_tiles(nodes,edges,bindings,output,'filtered-osm-pedestrian-v1')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pbf',required=True);p.add_argument('--anchors',required=True);p.add_argument('--output',required=True);p.add_argument('--surface-pbf');a=p.parse_args();build(a.pbf,a.anchors,a.output,a.surface_pbf)
