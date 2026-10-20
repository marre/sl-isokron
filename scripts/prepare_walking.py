"""Reproducible, optional CI rebuild; cache only small outputs, not the OSM PBF."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


def prepare(gtfs, output):
    provenance = json.loads(Path('data/walking-index.source.json').read_text())['osm']
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sliso-walking-build-') as temp:
        root = Path(temp); pbf = root/'source.osm.pbf'
        with urllib.request.urlopen(urllib.request.Request(provenance['source'],headers={'User-Agent':'sliso-walking-build/1'}), timeout=120) as source, pbf.open('wb') as target:
            shutil.copyfileobj(source, target)
        with pbf.open('rb') as stream: checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        if checksum != provenance['sha256']: raise ValueError('OSM source checksum mismatch')
        def run(script, *args): subprocess.run([sys.executable, 'scripts/'+script, *map(str, args)], check=True)
        graph = root/'graph.json.gz'; tiles = root/'valhalla'; walks = output/'walks.json'
        run('osm_walks.py', '--pbf', pbf, '--gtfs', gtfs, '--output', graph)
        run('prepare_pedestrian_tiles.py', '--graph', graph, '--pbf', pbf, '--directory', tiles)
        run('valhalla_walks.py', '--config', tiles/'config.json', '--gtfs', gtfs, '--graph-report', str(graph)+'.report.json', '--stop-features', str(graph)+'.bus-stops.json', '--output', walks)
        run('walking_areas.py', '--config', tiles/'config.json', '--anchors', str(walks)+'.anchors.json', '--walks', walks, '--output', output/'areas')
        for name, path in [('osm-report.json', Path(str(graph)+'.report.json')), ('tiles-report.json', tiles/'report.json')]:
            shutil.copyfile(path, output/name)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('--gtfs', required=True); p.add_argument('--output', required=True)
    a = p.parse_args(); prepare(a.gtfs, a.output)
