import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import data_test
from inventory_gtfs import inventory

class InventoryTests(unittest.TestCase):
    def test_inventory_needs_no_walking_input_and_separates_transfer_minimums(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            feed,_=data_test.DataTests().fixture(root)
            output=root/'inventory'
            report=inventory(feed,output)
            self.assertEqual(report['counts']['boardingStops'],2)
            self.assertEqual(report['counts']['trips'],1)
            self.assertEqual(report['over24StopTimes'],2)
            self.assertEqual(report['validFrom'],'2026-10-19')
            self.assertEqual(report['validTo'],'2026-10-20')
            self.assertEqual(report['transferTypes'],{'2':1})
            self.assertIn('NOT_VERIFIED',report['walkingStatus'])
            self.assertEqual(json.loads((output/'stops.json').read_text())[1]['id'],'b')
            self.assertFalse((output/'manifest.json').exists())
            self.assertFalse((output/'walks.json').exists())

if __name__=='__main__':unittest.main()
