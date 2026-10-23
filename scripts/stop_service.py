"""Build a tiny presentation index from all published timetable shards.

No routing nodes/edges are removed. This runs at deployment, never in a browser.
"""
import argparse
import base64
import hashlib
import json
import struct
from pathlib import Path


def build(root):
    root = Path(root)
    manifest = json.loads((root / 'manifest.json').read_text())

    def read(ref):
        relative = ref['url'].removeprefix('/data/')
        if ref['url'] != '/data/' + relative or '..' in Path(relative).parts:
            raise ValueError('Invalid published data path')
        data = (root / relative).read_bytes()
        if len(data) != ref['bytes'] or hashlib.sha256(data).hexdigest() != ref['sha256']:
            raise ValueError('Timetable checksum mismatch: ' + relative)
        return data

    stops = json.loads(read(manifest['stops']))
    bits = bytearray((len(stops) + 7) // 8)
    refs = {ref['url']: ref for rows in manifest['days'].values() for ref in rows}
    for ref in refs.values():
        data = read(ref)
        if len(data) % 36:
            raise ValueError('Truncated timetable shard')
        for start, end, _, _, _, _, _, pickup, dropoff in struct.iter_unpack('<9I', data):
            if max(start, end) >= len(stops):
                raise ValueError('Timetable stop index out of range')
            if pickup & 1:
                bits[start >> 3] |= 1 << (start & 7)
            if dropoff & 1:
                bits[end >> 3] |= 1 << (end & 7)
    index = dict(schema=1, dataset=manifest['version'], stopsSHA256=manifest['stops']['sha256'],
                 count=len(stops), serviceBits=base64.b64encode(bits).decode())
    target = root / manifest['version'] / 'stop-service.json'
    target.write_text(json.dumps(index, separators=(',', ':')))
    served = sum(byte.bit_count() for byte in bits)
    print(json.dumps(dict(scheduledStops=served, stopsWithoutService=len(stops)-served,
                          bytes=target.stat().st_size, timetableShards=len(refs))))
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='public/data')
    build(parser.parse_args().root)
