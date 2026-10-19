import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from fetch_gtfs import fetch

class QuotaTests(unittest.TestCase):
    def test_missing_ledger_and_quota_block_before_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ledger=root/'quota.json'
            with patch('urllib.request.urlopen') as req:
                with self.assertRaisesRegex(ValueError,'ledger missing'):fetch(root/'sl.zip',ledger)
                ledger.write_text(json.dumps({'month':datetime.now(timezone.utc).strftime('%Y-%m'),'attempts':45}))
                with self.assertRaisesRegex(ValueError,'limit 45'):fetch(root/'sl.zip',ledger)
                req.assert_not_called()
    def test_failed_request_counts_and_does_not_expose_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ledger=root/'quota.json'
            with patch.dict(os.environ,{'TRAFIKLAB_GTFS_KEY':'NOT-A-REAL-KEY'}),patch('urllib.request.urlopen',side_effect=urllib.error.URLError('secret URL')):
                with self.assertRaisesRegex(ValueError,'network/TLS failure') as error:fetch(root/'sl.zip',ledger,True)
                self.assertNotIn('secret URL',str(error.exception))
                self.assertEqual(json.loads(ledger.read_text())['attempts'],1)
    def test_same_day_reuses_verified_zip(self):
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w') as z:z.writestr('stops.txt','stop_id\na')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ledger=root/'quota.json';out=root/'sl.zip'
            with patch.dict(os.environ,{'TRAFIKLAB_GTFS_KEY':'NOT-A-REAL-KEY'}),patch('urllib.request.urlopen',return_value=io.BytesIO(raw.getvalue())) as req:
                fetch(out,ledger,True);fetch(out,ledger)
                self.assertEqual(req.call_count,1)
                self.assertEqual(json.loads(ledger.read_text())['attempts'],1)
