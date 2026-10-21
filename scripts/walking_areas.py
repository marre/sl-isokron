"""Offline pedestrian isochrones from conservative physical OSM tiles.

One-minute contours are approximate interpolated areas, not a guarantee that
every enclosed point is accessible. No circles or unbound platform access.
"""
import argparse
import json
import math
import time
from pathlib import Path


def build(config, anchors, walks, output, station_config=None):
    import valhalla
    started = time.monotonic()
    config = json.loads(Path(config).read_text())
    config['service_limits']['isochrone']['max_contours'] = 30
    actor = valhalla.Actor(config)
    station_settings=json.loads(Path(station_config).read_text()) if station_config else config
    station_settings['service_limits']['isochrone']['max_contours']=30
    station_actor=valhalla.Actor(station_settings) if station_config else actor
    anchors = json.loads(Path(anchors).read_text())
    metadata = json.loads(Path(walks).read_text())
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    index = dict(version=metadata['version'], stepMinutes=1, stops=[], files=[])
    chunk, size, number = {}, 0, 0

    def flush():
        nonlocal chunk, size, number
        if not chunk: return
        name = f'areas-{number:04d}.json'
        (output / name).write_text(json.dumps(chunk, separators=(',', ':')))
        index['files'].append(name)
        for stop in anchors:
            if stop['id'] in chunk:
                index['stops'].append({k: stop[k] for k in ('id', 'lat', 'lon')} | {'file': name})
        chunk, size, number = {}, 0, number + 1

    # Nearby endpoints share a bounded shard to keep regional releases below
    # the static asset count limit without fetching distant profiles together.
    cell=lambda s:(math.floor(s['lat']*1000),math.floor(s['lon']*500))
    anchors.sort(key=lambda s:(cell(s),s['id']))
    previous_cell=None
    for at, stop in enumerate(anchors):
        # Reserve endpoint access time before expanding on the physical network.
        offset_minutes = stop.get('offsetMetres', 0) / 80 + stop.get('accessSeconds', 0) / 60
        routing_actor=station_actor if stop.get('accessSeconds') else actor
        response = routing_actor.isochrone(dict(locations=[dict(lat=stop['anchorLat'], lon=stop['anchorLon'], radius=1, search_cutoff=1, node_snap_tolerance=0, minimum_reachability=0)],
            costing='pedestrian', costing_options={'pedestrian': {'walking_speed': 4.8, 'step_penalty': 0, 'elevator_penalty': 120}},
            contours=[{'time': minute - offset_minutes} for minute in range(1, 31) if minute > offset_minutes], polygons=True, denoise=0, generalize=10))
        contours = [{'minutes': round(f['properties']['contour'] + offset_minutes), 'geometry': f['geometry']} for f in response['features']]
        if any(c['geometry']['type'] not in ('Polygon', 'MultiPolygon') for c in contours):
            raise ValueError('Expected pedestrian area polygons')
        encoded = json.dumps(contours, separators=(',', ':'))
        if chunk and (len(chunk)>=4 or previous_cell!=cell(stop)): flush()
        previous_cell=cell(stop)
        chunk[stop['id']] = contours; size += len(encoded)
        if (at + 1) % 100 == 0: print('Walking area contours:', at + 1, '/', len(anchors), flush=True)
    flush()
    (output / 'index.json').write_text(json.dumps(index, separators=(',', ':')))
    # Remove only obsolete shards owned by this generator after successful
    # publication of the new index; preserve unrelated files in cached output.
    for old in output.glob('areas-[0-9][0-9][0-9][0-9].json'):
        if old.name not in index['files']:old.unlink()
    report = dict(stops=len(index['stops']), files=len(index['files']), bytes=sum(p.stat().st_size for p in output.glob('*.json')), elapsedSeconds=round(time.monotonic()-started, 2),
        source=metadata['version'], stepMinutes=1, generalizeMetres=10, reviewed=False,
        note='Approximate network isochrones. Raster interpolation can cover inaccessible ground. No automatic rail-platform binding.')
    (output / 'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for key in ('config', 'anchors', 'walks', 'output'): p.add_argument('--'+key, required=True)
    p.add_argument('--station-config')
    a = p.parse_args(); build(a.config, a.anchors, a.walks, a.output,a.station_config)
