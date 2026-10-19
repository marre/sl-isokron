"""Compile a GTFS ZIP + audited walking index into immutable sliso packages.
No inferred walking edges. Standard library only. See docs/data.md.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import shutil
import struct
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Stockholm')
MODE_TYPES = {0: 'tram', 1: 'metro', 2: 'rail', 3: 'bus', 4: 'boat', 100: 'rail', 109: 'rail', 400: 'metro', 700: 'bus', 900: 'tram', 1000: 'boat'}

def parse_date(s):
    return datetime.strptime(s.replace('-', ''), '%Y%m%d').date()

def gtfs_seconds(s):
    parts = s.split(':')
    if len(parts) != 3:
        raise ValueError('Invalid GTFS time')
    h, m, sec = map(int, parts)
    if h < 0 or not 0 <= m < 60 or not 0 <= sec < 60:
        raise ValueError('Invalid GTFS time')
    return h * 3600 + m * 60 + sec

def gtfs_epoch(day, seconds):
    # GTFS time is elapsed time from local noon minus 12 h, including DST days.
    noon = datetime.combine(day, datetime.min.time().replace(hour=12), TZ)
    return int(noon.timestamp()) - 43200 + seconds

def rows(z, name, required=False):
    if name not in z.namelist():
        if required:
            raise ValueError('Missing ' + name)
        return []
    return list(csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', newline='')))

def active_services(calendar, exceptions):
    services = defaultdict(set)
    for c in calendar:
        day, end = parse_date(c['start_date']), parse_date(c['end_date'])
        while day <= end:
            if c[['monday','tuesday','wednesday','thursday','friday','saturday','sunday'][day.weekday()]] == '1':
                services[day].add(c['service_id'])
            day += timedelta(days=1)
    for c in exceptions:
        day = parse_date(c['date'])
        if c['exception_type'] == '1':
            services[day].add(c['service_id'])
        elif c['exception_type'] == '2':
            services[day].discard(c['service_id'])
        else:
            raise ValueError('Invalid calendar exception')
    return services

def validate_walks(data, stops):
    if not data.get('version') or not 5 <= data.get('maxMinutes', 0) <= 30 or data.get('speedKmh') != 4.8:
        raise ValueError('Walking metadata must include version, maxMinutes 5–30 and speedKmh 4.8')
    bindings = {s['id']: s for s in data['stops']}
    ids = {s['id']: i for i, s in enumerate(stops)}
    edges, excluded = [], 0
    for e in data['edges']:
        if e.get('restricted'):
            excluded += 1
            continue
        if not e.get('source') or not isinstance(e['seconds'], (int, float)) or e['seconds'] <= 0 or e['seconds'] > data['maxMinutes'] * 60:
            raise ValueError('Walking edge lacks source or valid physical duration')
        for sid in (e['from'], e['to']):
            if sid not in ids or sid not in bindings:
                raise ValueError('Walking index references missing stop: ' + sid)
            stop, bound = stops[ids[sid]], bindings[sid]
            if abs(stop['lat'] - bound['lat']) > 0.000001 or abs(stop['lon'] - bound['lon']) > 0.000001:
                raise ValueError('Walking index has stale coordinates: ' + sid)
        edges.append(dict(from_=ids[e['from']], to=ids[e['to']], seconds=e['seconds'], source=e['source']))
    return [{'from': e.pop('from_'), **e} for e in edges], excluded

def publish(output, stops, routes, walks, transfers, trips, days, meta, report):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.sliso-', dir=output))
    compact = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':')).encode()
    try:
        files = {'trips.json': compact(trips), 'stops.json': compact(stops), 'routes.json': compact(routes), 'walks.json': compact(walks), 'transfers.json': compact(transfers)}
        files.update({day + '.bin': b''.join(struct.pack('<9I', *r) for r in sorted(records, key=lambda r: r[2])) for day, records in days.items()})
        fingerprint = hashlib.sha256(compact(meta) + b''.join(files[n] for n in sorted(files))).hexdigest()[:20]
        version = ('demo-' if meta['demo'] else 'sl-') + fingerprint
        refs = {}
        for name, raw in files.items():
            if len(raw) >= 25 * 1024 * 1024:
                raise ValueError(name + ' exceeds Cloudflare Pages 25 MiB file limit; partition before publishing')
            (staging / name).write_bytes(raw)
            refs[name] = {'url': '/data/' + version + '/' + name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
        report['packageBytes'] = sum(len(x) for x in files.values())
        report['connections'] = sum(len(x) for x in days.values())
        report['version'] = version
        (staging / 'report.json').write_bytes(compact(report))
        dest = output / version
        if not dest.exists():
            staging.rename(dest)
        manifest = dict(schema=1, version=version, **meta, trips=refs['trips.json'], days={d: refs[d + '.bin'] for d in days}, **{k: refs[k + '.json'] for k in ('stops','routes','walks','transfers')})
        pending = output / '.manifest.tmp'
        pending.write_bytes(compact(manifest))
        os.replace(pending, output / 'manifest.json')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        if staging.exists():
            shutil.rmtree(staging)

def compile_feed(feed, walking, output, start=None):
    with zipfile.ZipFile(feed) as z:
        raw_stops = rows(z, 'stops.txt', True)
        routes_raw = rows(z, 'routes.txt', True)
        trips_raw = rows(z, 'trips.txt', True)
        times = rows(z, 'stop_times.txt', True)
        rules = rows(z, 'transfers.txt')
        calendar, exceptions = rows(z, 'calendar.txt'), rows(z, 'calendar_dates.txt')
        agencies = rows(z, 'agency.txt', True)
        if any(a['agency_timezone'] != 'Europe/Stockholm' for a in agencies):
            raise ValueError('Only Europe/Stockholm GTFS supported')
        if rows(z, 'frequencies.txt'):
            raise ValueError('Frequency-based trips require expansion before import')
        if not calendar and not exceptions:
            raise ValueError('No actual service dates')
    parents = {s['stop_id']: s for s in raw_stops}
    stops = []
    for s in raw_stops:
        if s.get('location_type', '0') not in ('', '0'):
            continue
        parent = parents.get(s.get('parent_station'), s)
        stops.append(dict(id=s['stop_id'], name=s['stop_name'], station=parent['stop_name'], platform=s.get('platform_code') or s['stop_name'] + ' · ' + s['stop_id'], lat=float(s['stop_lat']), lon=float(s['stop_lon'])))
    if not stops or any(not -90 <= s['lat'] <= 90 or not -180 <= s['lon'] <= 180 for s in stops):
        raise ValueError('Missing or invalid boarding stops')
    stop_ids = {s['id']: i for i, s in enumerate(stops)}
    if len(stop_ids) != len(stops):
        raise ValueError('Duplicate stop IDs')
    routes = []
    for r in routes_raw:
        rt = int(r['route_type'])
        if rt not in MODE_TYPES:
            raise ValueError('Unmapped route_type ' + str(rt) + '; audit before import')
        routes.append(dict(id=r['route_id'], name=r.get('route_short_name') or r.get('route_long_name') or r['route_id'], mode=MODE_TYPES[rt]))
    route_ids = {r['id']: i for i, r in enumerate(routes)}
    trip_meta = {t['trip_id']: t for t in trips_raw}
    if any(t.get('service_id') is None or t['route_id'] not in route_ids for t in trips_raw):
        raise ValueError('Invalid trip metadata')
    trip_times = defaultdict(list)
    for st in times:
        if st['trip_id'] not in trip_meta or st['stop_id'] not in stop_ids:
            raise ValueError('stop_times references unknown trip or stop')
        if not st.get('arrival_time') or not st.get('departure_time'):
            raise ValueError('Untimed stop requires explicit interpolation policy')
        trip_times[st['trip_id']].append(st)
    for tid, tt in trip_times.items():
        tt.sort(key=lambda s: int(s['stop_sequence']))
        if len({int(s['stop_sequence']) for s in tt}) != len(tt):
            raise ValueError('Duplicate stop_sequence')
        prev = -1
        for s in tt:
            arr, dep = gtfs_seconds(s['arrival_time']), gtfs_seconds(s['departure_time'])
            if arr < prev or dep < arr:
                raise ValueError('Non-monotonic trip ' + tid)
            prev = dep
    with open(walking) as f:
        walk_meta = json.load(f)
    walks, excluded = validate_walks(walk_meta, stops)
    expanded = []
    def children(sid):
        if sid in stop_ids:
            return [stop_ids[sid]]
        if sid not in parents:
            raise ValueError('Unknown transfer stop')
        return [stop_ids[s['stop_id']] for s in raw_stops if s.get('parent_station') == sid and s['stop_id'] in stop_ids]
    for r in rules:
        typ = int(r.get('transfer_type') or 0)
        if typ not in (0, 1, 2, 3):
            raise ValueError('In-seat transfer types 4/5 require explicit vehicle-continuity support')
        for a in children(r['from_stop_id']):
            for b in children(r['to_stop_id']):
                rule = {'from': a, 'to': b, 'type': typ, 'seconds': int(r.get('min_transfer_time') or 0)}
                for src, dst in [('from_trip_id','fromTrip'),('to_trip_id','toTrip'),('from_route_id','fromRoute'),('to_route_id','toRoute')]:
                    if r.get(src):
                        if r[src] not in (trip_meta if 'trip' in src else route_ids):
                            raise ValueError('Unknown scoped transfer trip/route')
                        rule[dst] = r[src]
                expanded.append(rule)
    services = active_services(calendar, exceptions)
    active_days = [d for d, ids in services.items() if ids]
    if not active_days:
        raise ValueError('No active services')
    first, last = min(active_days), max(active_days)
    begin = max(first, start or datetime.now(TZ).date())
    end = min(last, begin + timedelta(days=8))
    if begin >= end:
        raise ValueError('Feed does not cover an upcoming search day plus following traffic day')
    # Retain up to 7 previous service days for GTFS hour values >24 (reject larger).
    max_secs = max(gtfs_seconds(s['departure_time']) for s in times)
    if max_secs > 7 * 86400:
        raise ValueError('Unsupported GTFS time beyond seven days')
    days = {}
    bucket = datetime.combine(begin, datetime.min.time(), TZ).astimezone(timezone.utc).date()
    bucket_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), TZ).astimezone(timezone.utc).date()
    while bucket <= bucket_end:
        days[bucket.isoformat()] = []
        bucket += timedelta(days=1)
    trip_keys, trip_indexes = [], {}
    for day, active in sorted(services.items()):
        if not begin - timedelta(days=7) <= day <= end:
            continue
        for tid, t in trip_meta.items():
            if t['service_id'] not in active:
                continue
            key = day.isoformat() + ':' + tid
            idx = len(trip_keys)
            trip_indexes[key] = idx
            trip_keys.append(key)
            tt = trip_times.get(tid, [])
            for a, b in zip(tt, tt[1:]):
                dep = gtfs_epoch(day, gtfs_seconds(a['departure_time']))
                arr = gtfs_epoch(day, gtfs_seconds(b['arrival_time']))
                bucket = datetime.fromtimestamp(dep, timezone.utc).date().isoformat()
                if bucket in days:
                    days[bucket].append((stop_ids[a['stop_id']], stop_ids[b['stop_id']], dep, arr, idx, route_ids[t['route_id']], int(a['stop_sequence']), int(a.get('pickup_type', '0') in ('', '0')), int(b.get('drop_off_type','0') in ('','0'))))
    # Scoped rules refer to trip instances, not repeated service-day trip IDs.
    instance_rules = []
    for rule in expanded:
        if 'fromTrip' not in rule and 'toTrip' not in rule:
            instance_rules.append(rule)
        else:
            # Both previous and next service-day variants, including cross-midnight transfers.
            from_keys = [k for k in trip_keys if k.endswith(':' + rule['fromTrip'])] if 'fromTrip' in rule else [None]
            to_keys = [k for k in trip_keys if k.endswith(':' + rule['toTrip'])] if 'toTrip' in rule else [None]
            for fk in from_keys:
                for tk in to_keys:
                    instance_rules.append({**rule, **({'fromTrip': fk} if fk else {}), **({'toTrip': tk} if tk else {})})
    gaps = len(stops) - len({w['from'] for w in walks})
    warnings = list(walk_meta.get('warnings', []))
    if gaps:
        warnings.append(f'{gaps} hållplatslägen saknar utgående fysisk gånganslutning. Inga genvägar har skapats.')
    warnings.append('Olika trip_id räknas konservativt som olika fordon. Beställningstrafik (pickup/drop_off 2–3) används inte.')
    meta = dict(demo=False, updated=datetime.now(timezone.utc).isoformat(), validFrom=begin.isoformat(), validTo=(end - timedelta(days=1)).isoformat(), walkingMaxMinutes=walk_meta['maxMinutes'], walkingSpeedKmh=4.8, walkingVersion=walk_meta['version'], warnings=warnings, attribution=['Planerad trafik: Trafiklab / Samtrafiken / SL'] + walk_meta.get('attribution', []))
    report = dict(stops=len(stops), routes=len(routes), routeInventory=routes, modes=dict(Counter(r['mode'] for r in routes)), transfersByType=dict(Counter(int(r.get('transfer_type') or 0) for r in rules)), transferRows=len(rules), expandedRules=len(instance_rules), walkingEdges=len(walks), excludedRestricted=excluded, stopsWithoutOutgoingWalk=gaps, review='Not manually verified. Complete docs/review-cases.csv before pilot.')
    publish(output, stops, routes, walks, instance_rules, trip_keys, days, meta, report)

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--gtfs', required=True)
    p.add_argument('--walks', required=True)
    p.add_argument('--output', default='public/data')
    p.add_argument('--from-date', type=parse_date)
    a = p.parse_args()
    compile_feed(a.gtfs, a.walks, a.output, a.from_date)
