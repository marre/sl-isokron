"""Lossless little-endian contour archive. Fixed 1e6 coordinates or float64 fallback.

No simplification: preserve polygon/ring order, holes and every minute contour.
The native OSM generation cache remains JSON; only delivery shards change.
"""
import gzip
import json
import math
import struct

FORMAT = 'sliso-contours-v1'


def compact(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def pack_geometry(geometry):
    if geometry['type'] not in ('Polygon', 'MultiPolygon'):
        raise ValueError('Invalid contour geometry')
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    rings = [r for p in polygons for r in p]
    points = [v for r in rings for p in r for v in p]
    if any(len(r) < 4 or r[0] != r[-1] for r in rings):
        raise ValueError('Invalid contour rings')
    if any(len(p) != 2 for r in rings for p in r) or any(not math.isfinite(v) or abs(v) > (90 if i % 2 else 180) for i, v in enumerate(points)):
        raise ValueError('Invalid coordinates')
    fixed = all(v == round(v * 1e6) / 1e6 for v in points)
    header = bytearray(struct.pack('<4I', 0x534c5131 if fixed else 0x534c5031, len(points)//2, len(rings), len(polygons)))
    for lengths in ([len(r) for r in rings], [len(p) for p in polygons]):
        offsets, n = [0], 0
        for length in lengths:
            n += length
            offsets.append(n)
        header.extend(struct.pack('<' + 'I'*len(offsets), *offsets))
    header.extend(b'\0' * (-len(header) % 8))
    return bytes(header) + struct.pack('<' + ('i' if fixed else 'd')*len(points), *([round(v*1e6) for v in points] if fixed else points))


def encode_profiles(profiles):
    directory, chunks, offset = {}, [], 0
    for sid, contours in profiles.items():
        entries, seen = [], set()
        for contour in contours:
            minute = contour['minutes']
            if type(minute) is not int or not 1 <= minute <= 30 or minute in seen:
                raise ValueError('Invalid contour minute')
            seen.add(minute)
            chunk = pack_geometry(contour['geometry'])
            entries.append(dict(minutes=minute, offset=offset, length=len(chunk)))
            chunks.append(chunk)
            offset += len(chunk)
        directory[sid] = entries
    text = compact(directory)
    header = struct.pack('<2I', 0x534c4131, len(text)) + text
    return header + b'\0' * (-len(header) % 8) + b''.join(chunks)


def delivery_profiles(profiles):
    return gzip.compress(encode_profiles(profiles), compresslevel=6, mtime=0)


def decode_profiles(raw):
    """Reference decoder used to verify migration against the original coordinates."""
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    magic, size = struct.unpack_from('<2I', raw)
    if magic != 0x534c4131:
        raise ValueError('Invalid archive')
    directory = json.loads(raw[8:8+size])
    base = (8+size+7)//8*8
    result = {}
    for sid, entries in directory.items():
        contours = []
        for entry in entries:
            at = base + entry['offset']
            magic, vertices, nr, np = struct.unpack_from('<4I', raw, at)
            fixed = magic == 0x534c5131
            if magic not in (0x534c5131, 0x534c5031):
                raise ValueError('Invalid geometry')
            rings = struct.unpack_from('<'+'I'*(nr+1), raw, at+16)
            polygons = struct.unpack_from('<'+'I'*(np+1), raw, at+16+(nr+1)*4)
            offset = (16+(nr+np+2)*4+7)//8*8
            values = struct.unpack_from('<'+('i' if fixed else 'd')*(vertices*2), raw, at+offset)
            scale = 1e6 if fixed else 1
            points = [[values[i]/scale, values[i+1]/scale] for i in range(0, len(values), 2)]
            rr = [points[rings[i]:rings[i+1]] for i in range(nr)]
            pp = [rr[polygons[i]:polygons[i+1]] for i in range(np)]
            # Polygon vs one-part MultiPolygon has identical raster semantics.
            geometry = dict(type='MultiPolygon', coordinates=pp)
            contours.append(dict(minutes=entry['minutes'], geometry=geometry))
        result[sid] = contours
    return result


def equivalent(native, decoded):
    normal = {sid: [dict(minutes=c['minutes'], geometry=dict(type='MultiPolygon', coordinates=[c['geometry']['coordinates']] if c['geometry']['type']=='Polygon' else c['geometry']['coordinates'])) for c in contours] for sid, contours in native.items()}
    return normal == decoded
