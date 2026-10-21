import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from assumed_walks import add_assumed_walks, extend_index, SOURCE

class AssumedWalkTests(unittest.TestCase):
    def test_missing_directions_only_and_exact_name_radius(self):
        stops=[dict(id='a',name='Å Station',lat=59.,lon=18.),dict(id='b',name=' å  station ',lat=59.001,lon=18.),dict(id='far',name='Å Station',lat=59.004,lon=18.),dict(id='other',name='Å-Station',lat=59.,lon=18.)]
        mapped=dict(from_='a',to='b',seconds=140,source='mapped')
        mapped['from']=mapped.pop('from_')
        result=add_assumed_walks(stops,[mapped])
        self.assertEqual(result[0],mapped)
        self.assertEqual(len(result),2)
        self.assertEqual((result[1]['from'],result[1]['to']),('b','a'))
        self.assertEqual(result[1]['source'],SOURCE)
        self.assertEqual(result[1]['metres'],139)
        self.assertEqual(result[1]['seconds'],105)
    def test_coincident_stops_pay_time_without_inventing_native_anchors(self):
        stops=[dict(id=i,name='Station',lat=59.,lon=18.) for i in ('a','b')]
        data=extend_index(dict(edges=[],stops=[],warnings=[]),stops)
        self.assertEqual(len(data['edges']),2)
        self.assertTrue(all(e['seconds']==60 for e in data['edges']))
        self.assertTrue(all(s['binding']=='assumed-same-name' for s in data['stops']))

    def test_feed_refresh_removes_stale_assumptions_and_rebuilds_for_new_stops(self):
        from assumed_walks import refresh_assumed_walks
        old=[dict(id=i,name='Station',lat=59.,lon=18.) for i in ('a','b')]
        data=extend_index(dict(edges=[],stops=[],warnings=[]),old)
        new=[old[0],{**old[1],'name':'Renamed','lat':59.01},{**old[1],'id':'c','lat':59.001}]
        refresh_assumed_walks(data,new)
        self.assertEqual({(e['from'],e['to']) for e in data['edges']},{('a','c'),('c','a')})
        self.assertEqual(len(data['warnings']),1)
        self.assertEqual({s['id'] for s in data['stops']},{'a','c'})
