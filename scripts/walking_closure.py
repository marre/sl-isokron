"""Lossless bounded stop-to-stop walking closure; original edges remain witnesses."""
import argparse
import copy
import gzip
import hashlib
import heapq
import json
import os
import struct
import tempfile
from pathlib import Path

FORMAT = 'sliso-walk-closure-v1'
MAGIC = 0x31435753  # SWC1, little endian
HEADER = 96


def decode_walks(payload):
    if isinstance(payload, list):
        return payload
    return [{'from':r[0], 'to':r[1], 'seconds':r[2], 'metres':r[3], 'source':payload['sources'][r[4]]}
            for r in payload['edges']]


def origin(edge):
    return edge['from']


def supported(stops, walks, max_minutes):
    # Do not quantize fractions or truncate larger indices. The graph router is
    # retained for inputs that this compact integer format cannot represent.
    return (0 < len(stops) <= 65535 and isinstance(max_minutes, int) and 5 <= max_minutes <= 30
            and all(isinstance(w['seconds'], (int, float)) and w['seconds'] > 0
                    and float(w['seconds']).is_integer() for w in walks))


def build(stops, walks, max_minutes, walks_hash, stops_hash):
    if not supported(stops, walks, max_minutes):
        raise ValueError('Walking closure requires <=65535 stops and positive integer-second walks')
    n, limit = len(stops), max_minutes * 60
    adjacency = [[] for _ in stops]
    for index, w in enumerate(walks):
        if not 0 <= origin(w) < n or not 0 <= w['to'] < n:
            raise ValueError('Walking endpoint outside stop index')
        adjacency[origin(w)].append((w['to'], int(w['seconds']), index))
    rows, entries = [0], bytearray()
    for root in range(n):
        distances, first, heap = {root: 0}, {}, [(0, root)]
        while heap:
            distance, u = heapq.heappop(heap)
            if distances[u] != distance:
                continue
            for v, seconds, edge in adjacency[u]:
                candidate = distance + seconds
                if candidate <= limit and candidate < distances.get(v, float('inf')):
                    distances[v] = candidate
                    first[v] = edge if u == root else first[u]
                    heapq.heappush(heap, (candidate, v))
        for destination in sorted(first):
            entries.extend(struct.pack('<HHI', destination, distances[destination], first[destination]))
        rows.append(len(entries) // 8)
    raw = (struct.pack('<8I', MAGIC, 1, n, len(walks), limit, rows[-1], HEADER, 0)
           + bytes.fromhex(walks_hash) + bytes.fromhex(stops_hash)
           + struct.pack('<' + str(len(rows)) + 'I', *rows) + entries)
    validate(raw, stops, walks, walks_hash, stops_hash, limit)
    return gzip.compress(raw, compresslevel=6, mtime=0), rows[-1]


def validate(payload, stops, walks, walks_hash, stops_hash, max_seconds):
    raw = gzip.decompress(payload) if payload[:2] == b'\x1f\x8b' else payload
    if len(raw) < HEADER:
        raise ValueError('Truncated walking closure')
    magic, schema, n, edges, limit, pairs, header, reserved = struct.unpack_from('<8I', raw)
    if ((magic, schema, n, edges, limit, header, reserved)
            != (MAGIC, 1, len(stops), len(walks), max_seconds, HEADER, 0)
            or raw[32:64].hex() != walks_hash or raw[64:96].hex() != stops_hash
            or len(raw) != HEADER + (n + 1) * 4 + pairs * 8):
        raise ValueError('Walking closure source or dimensions mismatch')
    rows = struct.unpack_from('<' + str(n + 1) + 'I', raw, HEADER)
    if rows[0] != 0 or rows[-1] != pairs or any(a > b for a, b in zip(rows, rows[1:])):
        raise ValueError('Invalid walking closure offsets')
    base = HEADER + (n + 1) * 4
    # Every encoded distance must have a decreasing, exact original-edge path.
    tables = []
    for u in range(n):
        table, previous = {}, -1
        for i in range(rows[u], rows[u + 1]):
            to, seconds, edge = struct.unpack_from('<HHI', raw, base + i * 8)
            if not previous < to < n or to == u or not 0 < seconds <= limit or edge >= len(walks):
                raise ValueError('Invalid walking closure entry')
            w = walks[edge]
            if origin(w) != u or not 0 < w['seconds'] <= seconds:
                raise ValueError('Invalid walking closure first edge')
            table[to] = seconds, edge
            previous = to
        tables.append(table)
    for u, table in enumerate(tables):
        for to, (seconds, edge) in table.items():
            w = walks[edge]
            suffix = 0 if w['to'] == to else tables[w['to']].get(to, (float('inf'),))[0]
            if seconds != w['seconds'] + suffix:
                raise ValueError('Inconsistent walking closure witness suffix')
    # Suffix distances strictly decrease because edge times are positive. The
    # equality above therefore proves every full path, without copying paths.
    return pairs


def migrate(root):
    """Add closure to a verified immutable release without GTFS/OSM requests."""
    from release_data import validate as validate_release
    root = Path(root)
    manifest = validate_release(root)
    if manifest.get('walkingClosure'):
        return manifest
    previous = manifest['version']
    stops = json.loads((root / manifest['stops']['url'].removeprefix('/data/')).read_bytes())
    walks = decode_walks(json.loads((root / manifest['walks']['url'].removeprefix('/data/')).read_bytes()))
    packed, pairs = build(stops, walks, manifest['walkingMaxMinutes'], manifest['walks']['sha256'], manifest['stops']['sha256'])
    version = 'sl-' + hashlib.sha256((previous + FORMAT).encode() + packed).hexdigest()[:20]
    migrated = copy.deepcopy(manifest)
    migrated['version'] = version
    with tempfile.TemporaryDirectory(prefix='.walking-closure-', dir=root) as temp:
        staging = Path(temp)
        refs = [migrated[k] for k in ('stops', 'walks', 'routes', 'transfers', 'trips')]
        refs += [r for entries in migrated['days'].values() for r in entries]
        refs += migrated.get('walkingAreas', {}).get('files', [])
        for ref in refs:
            source = root / ref['url'].removeprefix('/data/')
            if not (staging / source.name).exists():
                os.link(source, staging / source.name)
            ref['url'] = '/data/' + version + '/' + source.name
        (staging / 'walking-closure.bin').write_bytes(packed)
        migrated['walkingClosure'] = dict(format=FORMAT, maxMinutes=manifest['walkingMaxMinutes'],
                                        url='/data/' + version + '/walking-closure.bin', bytes=len(packed),
                                        sha256=hashlib.sha256(packed).hexdigest())
        report = json.loads((root / previous / 'report.json').read_bytes())
        report.update(version=version, walkingClosure=dict(sourceVersion=previous, pairs=pairs, bytes=len(packed), witnessesVerified=True))
        report['packageBytes'] = sum(p.stat().st_size for p in staging.iterdir())
        (staging / 'report.json').write_text(json.dumps(report, separators=(',', ':')))
        if (root / version).exists():
            raise ValueError('Walking closure destination already exists')
        staging.rename(root / version)
        pending = root / '.manifest.tmp'
        pending.write_text(json.dumps(migrated, ensure_ascii=False, separators=(',', ':')))
        os.replace(pending, root / 'manifest.json')
    validate_release(root)
    print(json.dumps(report['walkingClosure'], indent=2), flush=True)
    return migrated


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    args = parser.parse_args()
    migrate(args.root)
