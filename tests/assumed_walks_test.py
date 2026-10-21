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

    def test_station_suffix_is_the_same_place_but_directional_names_remain_distinct(self):
        stops=[dict(id='rail',name='Upplands Väsby',lat=59.,lon=18.),dict(id='bus',name='Upplands Väsby station',lat=59.001,lon=18.),dict(id='west',name='Upplands Väsby station västra',lat=59.,lon=18.),dict(id='far',name='Upplands Väsby station',lat=59.01,lon=18.)]
        result=add_assumed_walks(stops,[])
        self.assertEqual({(e['from'],e['to']) for e in result},{('rail','bus'),('bus','rail')})

    def test_swedish_possessive_station_names_connect_to_existing_nearby_stems(self):
        stops=[dict(id='rail',name='Lindholmen',lat=59.,lon=18.),dict(id='bus',name='Lindholmens station',lat=59.0005,lon=18.),dict(id='old',name='Lindholmens station',lat=59.0006,lon=18.)]
        mapped=dict(from_='rail',to='bus',seconds=80,source='mapped');mapped['from']=mapped.pop('from_')
        result=add_assumed_walks(stops,[mapped])
        pairs=[(e['from'],e['to']) for e in result]
        self.assertEqual(len(pairs),6)
        self.assertEqual(len(set(pairs)),6)
        self.assertEqual(result[0],mapped)
        self.assertEqual(next(e for e in result if e['from']=='bus' and e['to']=='rail')['source'],SOURCE)
        self.assertEqual({(e['from'],e['to']) for e in add_assumed_walks(stops[::-1],[])},set(pairs))

    def test_natural_final_s_uses_the_exact_station_name_instead_of_a_shorter_neighbor(self):
        stops=[dict(id='rail',name='Hägernäs',lat=59.,lon=18.),dict(id='bus',name='Hägernäs station',lat=59.0005,lon=18.),dict(id='unrelated',name='Hägernä',lat=59.,lon=18.)]
        result=add_assumed_walks(stops,[])
        self.assertEqual({(e['from'],e['to']) for e in result},{('rail','bus'),('bus','rail')})

    def test_possessive_station_alias_keeps_radius_punctuation_and_direction_restrictions(self):
        stops=[dict(id='rail',name='Lindholmen',lat=59.,lon=18.),dict(id='far',name='Lindholmens station',lat=59.01,lon=18.),dict(id='west',name='Lindholmens station västra',lat=59.,lon=18.),dict(id='punctuation',name='Lindholmen-station',lat=59.,lon=18.)]
        self.assertEqual(add_assumed_walks(stops,[]),[])
