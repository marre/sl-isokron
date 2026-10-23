import gzip
import hashlib
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from walking_closure import build, validate, migrate, supported, HEADER
from release_data import pack, install


class WalkingClosureTests(unittest.TestCase):
    def network(self):
        stops = [dict(id=str(i)) for i in range(4)]
        walks = [dict(zip(('from', 'to', 'seconds'), row)) for row in [(0, 1, 30), (1, 2, 40), (0, 2, 100), (2, 0, 200), (2, 3, 300)]]
        return stops, walks

    def test_exact_directed_bounded_distances_match_floyd_warshall(self):
        stops, walks = self.network()
        data, pairs = build(stops, walks, 5, 'a'*64, 'b'*64)
        self.assertEqual(data, build(stops, walks, 5, 'a'*64, 'b'*64)[0])
        raw = gzip.decompress(data)
        n = len(stops)
        rows = struct.unpack_from('<5I', raw, HEADER)
        distances = [[0 if i == j else float('inf') for j in range(n)] for i in range(n)]
        for w in walks: distances[w['from']][w['to']] = min(distances[w['from']][w['to']], w['seconds'])
        for k in range(n):
            for i in range(n):
                for j in range(n): distances[i][j] = min(distances[i][j], distances[i][k]+distances[k][j])
        for i in range(n):
            actual = {to: seconds for to, seconds, edge in [struct.unpack_from('<HHI', raw, HEADER+4*(n+1)+8*p) for p in range(rows[i], rows[i+1])]}
            self.assertEqual(actual, {j:d for j,d in enumerate(distances[i]) if i != j and d <= 300})
        self.assertEqual(validate(data, stops, walks, 'a'*64, 'b'*64, 300), pairs)

    def test_fractional_inputs_are_not_rounded(self):
        stops, walks = self.network()
        walks[0]['seconds'] = 30.5
        self.assertFalse(supported(stops, walks, 5))
        with self.assertRaises(ValueError): build(stops, walks, 5, 'a'*64, 'b'*64)
        self.assertFalse(supported([None]*65536, [], 30))

    def test_corruption_and_source_mismatches_are_rejected(self):
        stops, walks = self.network()
        packed, _ = build(stops, walks, 5, 'a'*64, 'b'*64)
        with self.assertRaises(ValueError): validate(packed, stops, walks, 'c'*64, 'b'*64, 300)
        raw = bytearray(gzip.decompress(packed))
        struct.pack_into('<H', raw, HEADER+5*4+2, 31)
        with self.assertRaises(ValueError): validate(raw, stops, walks, 'a'*64, 'b'*64, 300)
        with self.assertRaises(ValueError): validate(raw[:-1], stops, walks, 'a'*64, 'b'*64, 300)

    def test_migration_and_release_preserve_previous_clients(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)/'source';version = 'sl-'+'c'*20
            folder = root/version;folder.mkdir(parents=True)
            stops, walks = self.network();refs = {}
            for key, data in [('stops',stops),('walks',walks),('routes',[]),('transfers',[]),('trips',[])]:
                raw = json.dumps(data).encode();(folder/(key+'.json')).write_bytes(raw)
                refs[key] = dict(url='/data/'+version+'/'+key+'.json', bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
            manifest = dict(schema=2,version=version,demo=False,walkingMaxMinutes=5,days={},validFrom='2026-10-21',validTo='2026-10-28',**refs)
            (root/'manifest.json').write_text(json.dumps(manifest));(folder/'report.json').write_text(json.dumps(dict(generator='sliso-data-v2',version=version)))
            new = migrate(root)
            self.assertNotEqual(new['version'], version)
            self.assertEqual(new['walks']['sha256'], refs['walks']['sha256'])
            self.assertTrue((folder/'walks.json').is_file())
            self.assertEqual(migrate(root), new)
            archive, descriptor = Path(temp)/'data.zip', Path(temp)/'release.json'
            release = pack(root, archive, descriptor, 'marre/sliso')
            self.assertTrue(release['features']['walkingClosure'])
            self.assertEqual(install(archive, release, Path(temp)/'installed'), new)
