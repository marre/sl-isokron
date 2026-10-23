"""Lossless spatial delivery bundles and optional sparse overview contours.

Logical source groups remain independent of physical delivery files. Geometry
chunks are copied verbatim, including all native minutes in the detailed layer.
"""
import gzip
import math
import struct
from collections import defaultdict
from contour_format import FORMAT, compact
import json

TARGET = 256 * 1024


def unpack(raw):
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    magic, size = struct.unpack_from('<2I', raw)
    if magic != 0x534c4131 or size > len(raw)-8:
        raise ValueError('Invalid contour archive')
    directory = json.loads(raw[8:8+size])
    base, offset, profiles = (8+size+7)//8*8, 0, {}
    for sid, entries in directory.items():
        parts, seen = [], set()
        for e in entries:
            minute, length = e['minutes'], e['length']
            if type(minute) is not int or not 1 <= minute <= 30 or minute in seen or e['offset'] != offset or length <= 0:
                raise ValueError('Invalid contour directory')
            seen.add(minute)
            chunk = raw[base+offset:base+offset+length]
            if len(chunk) != length:
                raise ValueError('Truncated contour archive')
            parts.append((minute, chunk))
            offset += length
        profiles[sid] = parts
    if base+offset != len(raw):
        raise ValueError('Trailing contour bytes')
    return profiles


def pack(profiles):
    directory, chunks, offset = {}, [], 0
    for sid, parts in profiles.items():
        directory[sid] = []
        for minute, chunk in parts:
            directory[sid].append(dict(minutes=minute, offset=offset, length=len(chunk)))
            chunks.append(chunk)
            offset += len(chunk)
    text = compact(directory)
    header = struct.pack('<2I', 0x534c4131, len(text)) + text
    return gzip.compress(header + b'\0'*(-len(header)%8) + b''.join(chunks), compresslevel=6, mtime=0)


def bundle(areas, stops, target=TARGET):
    if areas.get('format') != FORMAT:
        return areas  # Legacy/synthetic JSON remains supported.
    if areas.get('sources') is not None:
        raise ValueError('Contours are already bundled')
    names = list(areas['files'])
    sources = areas['index']
    locations = defaultdict(list)
    for s in stops:
        if s['id'] in sources:
            locations[sources[s['id']]].append(s)
    files, layers = {}, {}
    # Keeping whole logical groups inside a single physical file is an invariant.
    for layer, lat_step, lon_step in [('detail', .009, .018), ('overview', .036, .072)]:
        cells = defaultdict(list)
        for i in range(len(names)):
            positions = locations[i]
            key = (math.floor(sum(s['lat'] for s in positions)/len(positions)/lat_step),
                   math.floor(sum(s['lon'] for s in positions)/len(positions)/lon_step)) if positions else ('unbound', i)
            cells[key].append(i)
        index, layer_files, covered = {}, [], set()

        def flush(items):
            if not items:
                return
            profiles = {}
            for old, p in items:
                if profiles.keys() & p.keys():
                    raise ValueError('Duplicate contour stop')
                profiles.update(p)
            raw = pack(profiles)
            if len(raw) > target and len(items) > 1:
                split = len(items)//2
                flush(items[:split]); flush(items[split:]); return
            if unpack(raw) != profiles:
                raise ValueError('Contour bundle verification failed')
            number = len(layer_files)
            name = f'areas-{layer}-{number:04d}.bin'
            files[name] = raw
            layer_files.append(name)
            for old, p in items:
                expected = {sid for sid in p if sid in sources}
                if any(sources[sid] != old for sid in expected) or covered & expected:
                    raise ValueError('Logical contour source mismatch')
                covered.update(expected)
                for sid in expected:
                    index[sid] = number
        for group in cells.values():
            pending, estimate = [], 0
            for i in group:
                raw = areas['files'][names[i]]
                profiles = unpack(raw)
                if layer == 'overview':
                    profiles = {sid: [(m,c) for m,c in parts if m == min((n for n,c in parts), default=0) or m%5 == 0] for sid,parts in profiles.items()}
                size = len(raw) if layer == 'detail' else len(pack(profiles))
                if pending and estimate+size > target:
                    flush(pending); pending, estimate = [], 0
                pending.append((i, profiles)); estimate += size
            flush(pending)
        if covered != set(sources):
            raise ValueError('Missing contour sources')
        layers[layer] = dict(format=FORMAT, index=index, files=layer_files)
    return dict(format=FORMAT, index=layers['detail']['index'], sources=sources,
                files=files, detailFiles=layers['detail']['files'], overview=layers['overview'])


def manifest_fields(areas, refs):
    result = dict(**({'format':areas['format']} if 'format' in areas else {}), stepMinutes=1,
                  index=areas['index'], files=[refs[n] for n in areas.get('detailFiles', areas['files'])], reviewed=False)
    if 'sources' in areas:
        result['sources'] = areas['sources']
    if 'overview' in areas:
        overview = areas['overview']
        result['overview'] = dict(format=overview['format'], index=overview['index'], files=[refs[n] for n in overview['files']], stepMinutes=5)
    return result
