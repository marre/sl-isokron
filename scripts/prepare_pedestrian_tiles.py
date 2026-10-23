"""Build local Valhalla tiles from the already-filtered physical OSM walking graph.
No off-network connectors are introduced. Dense IDs only reduce builder memory.
"""
import argparse
import gzip
import json
import subprocess
import time
from itertools import groupby
from pathlib import Path


def prepare(graph_path, original_pbf, directory, station_access=False, pbf_only=False):
    import osmium
    import valhalla
    from valhalla import PYVALHALLA_DIR
    started=time.monotonic();directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    with gzip.open(graph_path,'rt',encoding='utf-8') as f:graph=json.load(f)
    if not station_access:graph['edges']=[e for e in graph['edges'] if e.get('kind')!='elevator']
    ids={n:i+1 for i,n in enumerate(sorted(map(int,graph['nodes'])))}
    pbf=directory/'pedestrian.osm.pbf'
    # Idempotent replacement is confined to this generated output.
    if pbf.exists():pbf.unlink()
    writer=osmium.SimpleWriter(str(pbf))
    try:
        processor=osmium.FileProcessor(str(original_pbf)).with_filter(osmium.filter.EntityFilter(osmium.osm.NODE)).with_filter(osmium.filter.IdFilter(list(ids)))
        count=0
        for n in processor:
            writer.add_node(osmium.osm.mutable.Node(id=ids[n.id],version=1,location=(n.location.lon,n.location.lat)))
            count+=1
        print(f'Physical walking nodes written: {count}',flush=True)
        # Mark only newly admitted default-access streets. Existing mapped
        # pedestrian geometry keeps priority when stop coordinates fit both.
        default_sources=set()
        from osm_walks import walkable
        roads=osmium.FileProcessor(str(original_pbf)).with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(osmium.filter.TagFilter(*[('highway',h) for h in ('primary','primary_link','secondary','secondary_link','tertiary','tertiary_link')]))
        for road in roads:
            tags=dict(road.tags)
            explicit=tags.get('foot') in ('yes','designated','permissive') or tags.get('sidewalk') in ('yes','both','left','right')
            if walkable(tags) and not explicit:default_sources.add(f'OSM way/{road.id} version/{road.version}')
        way_id=0
        def flush(run,oneway,source,kind,level):
            nonlocal way_id
            if len(run)<2:return
            way_id+=1
            tags={'highway':'footway','foot':'designated','source:geometry':source}
            if source in default_sources:tags['name']='sliso:default-road'
            original_way=int(source.split('/')[1].split()[0])
            if original_way in graph.get('platformWays',[]):tags['name']=f'sliso:platform:{original_way}'
            if kind=='elevator':tags.update(highway='elevator',level=level)
            if oneway:tags['oneway:foot']='yes'
            writer.add_way(osmium.osm.mutable.Way(id=way_id,version=1,nodes=run,tags=tags))
        for key,entries in groupby(graph['edges'],key=lambda e:(e['source'],e.get('oneWay',False),e.get('kind',''),e.get('level',''))):
            run=[]
            for e in entries:
                a,b=ids[int(e['from'])],ids[int(e['to'])]
                if run and run[-1]!=a:flush(run,key[1],key[0],key[2],key[3]);run=[]
                if not run:run=[a]
                run.append(b)
            flush(run,key[1],key[0],key[2],key[3])
    finally:writer.close()
    if pbf_only:return pbf
    tiles=directory/'tiles';tiles.mkdir(exist_ok=True)
    config=valhalla.get_config(tile_extract='',tile_dir=str(tiles))
    config['mjolnir'].update(hierarchy=False,shortcuts=False,include_driving=False,include_bicycle=False,include_pedestrian=True,id_table_size=max(len(ids),way_id)+1000)
    config['mjolnir']['data_processing'].update(apply_country_overrides=False,use_admin_db=False)
    config['service_limits']['pedestrian'].update(max_matrix_distance=10000,max_matrix_location_pairs=10000,max_locations=200)
    config['service_limits']['max_radius']=100
    config['loki']['service_defaults'].update(search_cutoff=30,minimum_reachability=0,radius=10)
    path=directory/'config.json';path.write_text(json.dumps(config))
    command=[str(PYVALHALLA_DIR/'bin'/'valhalla_build_tiles'),'-c',str(path),'-j','4',str(pbf)]
    with (directory/'build.log').open('w') as log:subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
    report={'sourceGraph':graph['version'],'nodes':count,'ways':way_id,'elapsedSeconds':round(time.monotonic()-started,2),'valhallaVersion':valhalla.__version__,'pbfBytes':pbf.stat().st_size,'tileBytes':sum(p.stat().st_size for p in tiles.rglob('*') if p.is_file())}
    (directory/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--graph',required=True);p.add_argument('--pbf',required=True);p.add_argument('--directory',required=True);p.add_argument('--station-access',action='store_true');p.add_argument('--pbf-only',action='store_true');a=p.parse_args();prepare(a.graph,a.pbf,a.directory,a.station_access,a.pbf_only)
