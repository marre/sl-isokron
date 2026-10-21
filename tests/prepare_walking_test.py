import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from prepare_walking import fetch_osm

class OsmDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.cache=Path(self.temp.name);self.content=b'pinned physical OSM source'
        self.provenance={'source':'https://example.test/sweden.osm.pbf','sha256':hashlib.sha256(self.content).hexdigest()}

    def test_valid_cache_avoids_download_and_corrupt_cache_is_replaced(self):
        target=self.cache/(self.provenance['sha256']+'.osm.pbf');target.write_bytes(self.content)
        with patch('prepare_walking.subprocess.run') as run:
            self.assertEqual(fetch_osm(self.provenance,self.cache),target);run.assert_not_called()
        target.write_bytes(b'corrupt')
        def download(args,**kwargs):Path(args[args.index('--output')+1]).write_bytes(self.content)
        with patch('prepare_walking.subprocess.run',side_effect=download):self.assertEqual(fetch_osm(self.provenance,self.cache).read_bytes(),self.content)

    def test_failed_partial_transfer_retries_with_deadline_and_never_publishes_partial_bytes(self):
        calls=[]
        def download(args,**kwargs):
            calls.append(args);part=Path(args[args.index('--output')+1]);part.write_bytes(b'partial' if len(calls)==1 else self.content)
            self.assertEqual(args[args.index('--max-time')+1],'180')
            self.assertFalse(list(self.cache.glob('*.osm.pbf')))
            if len(calls)==1:raise subprocess.CalledProcessError(28,args)
        with patch('prepare_walking.subprocess.run',side_effect=download):self.assertEqual(fetch_osm(self.provenance,self.cache).read_bytes(),self.content)
        self.assertEqual(len(calls),2);self.assertFalse(list(self.cache.glob('*.part')))

    def test_wrong_checksum_and_repeated_failures_leave_no_usable_source(self):
        def wrong(args,**kwargs):Path(args[args.index('--output')+1]).write_bytes(b'wrong source')
        with patch('prepare_walking.subprocess.run',side_effect=wrong):
            with self.assertRaisesRegex(ValueError,'checksum'):fetch_osm(self.provenance,self.cache)
        with patch('prepare_walking.subprocess.run',side_effect=subprocess.CalledProcessError(28,['curl'])) as run:
            with self.assertRaises(subprocess.CalledProcessError):fetch_osm(self.provenance,self.cache)
            self.assertEqual(run.call_count,3)
        self.assertFalse(list(self.cache.iterdir()))

    def test_interrupted_download_resumes_verified_immutable_source(self):
        calls=[]
        def download(args,**kwargs):
            calls.append(args);part=Path(args[args.index('--output')+1])
            self.assertEqual(args[args.index('--continue-at')+1],'-')
            if len(calls)==1:
                part.write_bytes(self.content[:8]);raise subprocess.CalledProcessError(28,args)
            self.assertEqual(part.read_bytes(),self.content[:8])
            part.write_bytes(part.read_bytes()+self.content[8:])
        with patch('prepare_walking.subprocess.run',side_effect=download):
            self.assertEqual(fetch_osm(self.provenance,self.cache).read_bytes(),self.content)
        self.assertEqual(len(calls),2)
