import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from platform_access import platform_positions, platform_allowed

class PlatformAccessTests(unittest.TestCase):
    def test_only_the_identified_numbered_platform_can_bind(self):
        stop=dict(id='a',name='Station',platform='2',lat=59.,lon=18.)
        binding={**stop,'osmWay':42}
        way={'tags':{'railway':'platform','ref':'2;3'},'points':[{'lat':59.00002,'lon':17.9999},{'lat':59.00002,'lon':18.0001}]}
        result=platform_positions([binding],[stop],{42:way})[0]
        self.assertEqual(result['platformWay'],42)
        self.assertGreater(result['offsetMetres'],2)
        self.assertLess(result['offsetMetres'],3)
        with self.assertRaisesRegex(ValueError,'number changed'):
            platform_positions([binding],[stop],{42:{**way,'tags':{'railway':'platform','ref':'1'}}})
        with self.assertRaisesRegex(ValueError,'Stale'):
            platform_positions([binding],[{**stop,'lon':18.0001}],{42:way})
        with self.assertRaisesRegex(ValueError,'geometry moved'):
            platform_positions([binding],[stop],{42:{**way,'points':[{'lat':59.01,'lon':18.},{'lat':59.02,'lon':18.}]}})
        self.assertEqual(platform_positions([binding],[],{42:way}),[])
    def test_platforms_do_not_override_access_restrictions(self):
        for restriction in ({'foot':'no'},{'access':'private'},{'foot':'use_sidepath'},{'opening_hours':'06:00-22:00'},{'foot:conditional':'no @ night'}):
            self.assertFalse(platform_allowed({'railway':'platform',**restriction}))
        self.assertFalse(platform_allowed({'railway':'rail'}))
        self.assertTrue(platform_allowed({'railway':'platform','level':'-2'}))

    def test_bus_coordinates_cannot_snap_onto_an_unrelated_rail_platform(self):
        from valhalla_walks import select_anchor
        stop={'lat':59.,'lon':18.}
        edge={'way_id':42,'correlated_lat':59.,'correlated_lon':18.,'edge_info':{'names':['sliso:platform:42']}}
        self.assertIsNone(select_anchor(stop,{'edges':[edge]}))
        self.assertIsNotNone(select_anchor(stop,{'edges':[edge]},platform=True))

    def test_bus_junction_fallback_cannot_reintroduce_platform_edges(self):
        from valhalla_walks import identified_anchor
        stop={'id':'bus','lat':59.,'lon':18.}
        edges=[]
        for forward,node in [(True,1),(False,2)]:
            edges.append({'edge_info':{'way_id':42,'shape':'platform','names':['sliso:platform:42']},'correlated_lat':59.,'correlated_lon':18.,'percent_along':.5,
                          'edge':{'forward':forward,'end_node':{'value':node},'geo_attributes':{'length':10},'access':{'pedestrian':True}}})
        self.assertIsNone(identified_anchor(stop,{'id':'osm','lat':59.,'lon':18.},{'edges':edges}))

    def test_identified_roadside_stop_can_reach_the_same_wide_road_only(self):
        from valhalla_walks import identified_anchor
        stop={'id':'bus','lat':59.,'lon':18.}
        feature={'id':'osm','lat':59.,'lon':18.}
        road={'way_id':42,'correlated_lat':59.00006,'correlated_lon':18.,'edge_info':{'names':['sliso:default-road']}}
        anchor=identified_anchor(stop,feature,{'edges':[road]})
        self.assertGreater(anchor['offsetMetres'],6)
        self.assertIsNone(identified_anchor(stop,feature,{'edges':[{**road,'way_id':43,'edge_info':{}}]}))
        self.assertIsNone(identified_anchor(stop,feature,{'edges':[road,{**road,'way_id':43}]}))
        self.assertIsNone(identified_anchor(stop,feature,{'edges':[{**road,'correlated_lat':59.0001}]}))

    def test_station_access_time_is_paid_in_both_directions(self):
        from valhalla_walks import walking_pair
        platform={'id':'platform','offsetMetres':4,'accessSeconds':120}
        street={'id':'street','offsetMetres':4}
        for a,b in [(platform,street),(street,platform)]:
            pair=walking_pair(a,b,60,.08,'mapped station path',30)
            self.assertEqual(pair['seconds'],186)
            self.assertEqual(pair['metres'],88)
        self.assertIsNone(walking_pair(platform,street,1800,.08,'mapped station path',30))
