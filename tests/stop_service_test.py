import base64
import hashlib
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from stop_service import build

class StopServiceTests(unittest.TestCase):
    def fixture(self,root):
        folder=root/'test';folder.mkdir()
        def ref(name,data):
            (folder/name).write_bytes(data)
            return dict(url='/data/test/'+name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        stops=ref('stops.json',json.dumps([{'id':str(i)} for i in range(4)]).encode())
        # Stop 1 is passed without pickup/dropoff. Stop 2 is served only tomorrow;
        # stop 3 is entirely absent. Repeated shards must not change the bitset.
        a=ref('a.bin',struct.pack('<9I',0,1,100,200,0,0,1,3,0))
        b=ref('b.bin',struct.pack('<9I',1,2,300,400,1,0,2,0,3))
        m=dict(version='test',stops=stops,days={'2026-10-23':[a],'2026-10-24':[a,b]})
        (root/'manifest.json').write_text(json.dumps(m));return m
    def test_all_days_and_boarding_flags_without_changing_any_routing_file(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);self.fixture(root);before={str(p):p.read_bytes() for p in root.rglob('*') if p.is_file()}
            result=build(root)
            self.assertEqual(base64.b64decode(result['serviceBits']),bytes([5]))
            self.assertEqual(result['count'],4)
            for p,data in before.items():self.assertEqual(Path(p).read_bytes(),data)
    def test_corrupt_or_truncated_timetable_is_not_published_as_a_service_mask(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);self.fixture(root);(root/'test'/'b.bin').write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError,'checksum'):build(root)
            self.assertFalse((root/'test'/'stop-service.json').exists())
