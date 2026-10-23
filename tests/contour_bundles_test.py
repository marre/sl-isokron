import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from contour_format import delivery_profiles, decode_profiles, FORMAT
from contour_bundles import bundle, unpack


class Bundles(unittest.TestCase):
    def fixture(self):
        # Same cell plus a remote cell; two stops share one logical source.
        stops = [dict(id=sid, lat=lat, lon=18.) for sid,lat in [('a',59.33),('b',59.3301),('c',59.3302),('d',60.)]]
        g = dict(type='Polygon', coordinates=[[[18.,59.],[18.1,59.],[18.1,59.1],[18.,59.]]])
        profiles = {sid:[dict(minutes=m, geometry=g) for m in range(1,31)] for sid in 'abcd'}
        files = {'areas-0.bin':delivery_profiles({sid:profiles[sid] for sid in 'ab'}),
                 'areas-1.bin':delivery_profiles({'c':profiles['c']}), 'areas-2.bin':delivery_profiles({'d':profiles['d']})}
        return stops, dict(format=FORMAT, files=files, index=dict(a=0,b=0,c=1,d=2))

    def test_lossless_detail_spatial_boundaries_and_sparse_overview(self):
        stops, source = self.fixture()
        result = bundle(source, stops)
        self.assertEqual(result, bundle(source, stops))
        self.assertEqual(result['sources'], source['index'])
        self.assertEqual(result['index']['a'], result['index']['c'])
        self.assertNotEqual(result['index']['a'], result['index']['d'])
        original = {sid:p for raw in source['files'].values() for sid,p in unpack(raw).items()}
        delivered = {sid:p for name in result['detailFiles'] for sid,p in unpack(result['files'][name]).items()}
        self.assertEqual(original, delivered)
        overview = {sid:p for name in result['overview']['files'] for sid,p in unpack(result['files'][name]).items()}
        self.assertEqual(set(overview), set(original))
        for sid, parts in overview.items():
            self.assertEqual([m for m,c in parts], [1,5,10,15,20,25,30])
            self.assertTrue(all(c == dict(original[sid])[m] for m,c in parts))
        # The native decoder also accepts the repacked archives.
        for raw in result['files'].values():
            decode_profiles(raw)

    def test_size_splitting_never_splits_a_logical_source(self):
        stops, source = self.fixture()
        result = bundle(source, stops, target=1)
        self.assertEqual(result['index']['a'], result['index']['b'])
        self.assertNotEqual(result['index']['a'], result['index']['c'])
        self.assertEqual(len(result['detailFiles']), 3)
        with self.assertRaisesRegex(ValueError, 'already bundled'):
            bundle(result, stops)

    def test_corrupt_archives_are_rejected(self):
        stops, source = self.fixture()
        source['files']['areas-0.bin'] = source['files']['areas-0.bin'][:-5]
        with self.assertRaises((ValueError, EOFError)):
            bundle(source, stops)
