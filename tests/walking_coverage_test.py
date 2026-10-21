import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from walking_coverage import coverage

class WalkingCoverageTests(unittest.TestCase):
    def test_outward_access_uses_direction_and_reserves_a_real_contour_minute(self):
        stops=[dict(id=s,name=s,stationId=s) for s in ('profile','access','chain','only-inbound','boundary','over-budget')]
        edges=[dict(from_=1,to=0,seconds=60),dict(from_=2,to=1,seconds=60),dict(from_=0,to=3,seconds=60),dict(from_=4,to=0,seconds=1740),dict(from_=5,to=0,seconds=1741)]
        for edge in edges:edge['from']=edge.pop('from_')
        report=coverage(stops,edges,{'profile':0})
        self.assertEqual(report['precomputedProfiles'],1)
        self.assertEqual(report['viaWalkingAccess'],3)
        self.assertEqual(report['withoutKnownProfileAccess'],2)
        self.assertEqual(report['byWalkingMinutes']['5'],3)
        self.assertEqual(report['byWalkingMinutes']['30'],4)
        self.assertEqual(report['stops'][2]['accessSeconds'],120)
        self.assertEqual(report['stops'][2]['profileStop'],'profile')
        self.assertIsNone(report['stops'][3]['profileStop'])
        self.assertEqual({s['id'] for s in report['uncoveredStations']},{'only-inbound','over-budget'})

    def test_station_group_is_not_reported_missing_when_a_sibling_has_access(self):
        stops=[dict(id='a',name='Station',stationId='same'),dict(id='b',name='Station',stationId='same')]
        report=coverage(stops,[],{'a':0})
        self.assertEqual(report['withoutOwnProfile'],1)
        self.assertEqual(report['withoutKnownProfileAccess'],1)
        self.assertEqual(report['uncoveredStations'],[])
        with self.assertRaisesRegex(ValueError,'unknown stop'):coverage(stops,[],{'removed':0})
        with self.assertRaisesRegex(ValueError,'Invalid directed'):coverage(stops,[{'from':0,'to':2,'seconds':1}],{'a':0})
