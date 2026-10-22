import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from contour_format import encode_profiles, decode_profiles, equivalent

class Contours(unittest.TestCase):
    def test_lossless_source_precision(self):
        for x in (18.123456, 18.123456789012):
            g = dict(type='Polygon', coordinates=[[[18.,59.],[x,59.],[18.,59.1],[18.,59.]]])
            profiles = {'s': [dict(minutes=m, geometry=g) for m in range(1,31)]}
            self.assertTrue(equivalent(profiles, decode_profiles(encode_profiles(profiles))))
    def test_invalid(self):
        with self.assertRaises(ValueError):
            encode_profiles({'s':[dict(minutes=31,geometry={})]})
        with self.assertRaises(ValueError):
            encode_profiles({'s':[dict(minutes=1,geometry=dict(type='Polygon',coordinates=[[[0,0],[1,1]]]))]})
