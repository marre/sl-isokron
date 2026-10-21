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

    def test_same_station_binding_requires_local_topology_and_two_real_directions(self):
        from valhalla_walks import station_anchor
        stop={'id':'a','name':'Station','station':'area','busOnly':True,'lat':59.,'lon':18.}
        seed={'id':'b','name':'Station','station':'area','binding':'identified-osm-bus-stop','lat':59.0001,'lon':18.,'anchorLat':59.0001,'anchorLon':18.,'offsetMetres':2}
        edges=[]
        for forward,node in [(True,1),(False,2)]:
            edges.append({'edge_info':{'way_id':42,'shape':'walkway'},'correlated_lat':59.,'correlated_lon':18.,'percent_along':.5,
                          'edge':{'forward':forward,'end_node':{'value':node},'geo_attributes':{'length':10},'access':{'pedestrian':True}}})
        class Actor:
            def __init__(self,distances):self.distances=iter(distances);self.calls=0
            def matrix(self,request):
                self.calls+=1;km=next(self.distances)
                return {'sources_to_targets':{'distances':[[km]],'durations':[[None if km is None else 30]]}}
        actor=Actor([.03,.03]);anchor=station_anchor(stop,{'edges':edges},[seed],actor)
        self.assertEqual(anchor['verifiedSibling'],'b');self.assertEqual(actor.calls,2)
        self.assertEqual(anchor['lat'],stop['lat'])
        for distances in [[.03,None],[.03,.4]]:self.assertIsNone(station_anchor(stop,{'edges':edges},[seed],Actor(distances)))
        self.assertIsNone(station_anchor(stop,{'edges':edges},[{**seed,'station':'another-area'}],Actor([])))
        self.assertIsNone(station_anchor(stop,{'edges':edges},[{**seed,'binding':'unknown'}],Actor([])))
        disconnected=edges+[{**e,'edge_info':{'way_id':43,'shape':'bridge'},'edge':{**e['edge'],'end_node':{'value':e['edge']['end_node']['value']+10}}} for e in edges]
        self.assertIsNone(station_anchor(stop,{'edges':disconnected},[seed],Actor([])))

    def test_spatial_recovery_does_not_depend_on_station_or_name(self):
        from valhalla_walks import nearby_network_anchor
        from stop_matching_test import segment
        stop={'id':'a','name':'Care home','busOnly':True,'lat':59.,'lon':18.}
        seed={'id':'b','name':'Main street','busOnly':True,'lat':59.0001,'lon':18.,'anchorLat':59.0001,'anchorLon':18.,'offsetMetres':2}
        class Actor:
            def __init__(self,km):self.km=iter(km)
            def matrix(self,request):
                if request.get('expansion_max_distance')!=510:raise AssertionError('Local validation must bound native exploration')
                km=next(self.km)
                return {'sources_to_targets':{'distances':[[km]],'durations':[[30 if km is not None else None]]}}
        result={'edges':segment(1,'footway',10,20)}
        anchor=nearby_network_anchor(stop,result,[seed],Actor([.1,.1]))
        self.assertEqual(anchor['verifiedNearby'],'b')
        self.assertEqual(anchor['binding'],'nearby-pedestrian-network')
        for km in [[.1,None],[.1,.6]]:self.assertIsNone(nearby_network_anchor(stop,result,[seed],Actor(km)))
        self.assertIsNone(nearby_network_anchor({**stop,'busOnly':False},result,[seed],Actor([])))
        self.assertIsNone(nearby_network_anchor(stop,result,[{**seed,'lat':59.01}],Actor([])))
        self.assertIsNone(nearby_network_anchor(stop,{'edges':result['edges']+segment(2,'bridge',30,40)},[seed],Actor([])))

    def test_auto_identity_requires_station_membership_number_and_surface_geometry(self):
        from platform_access import discover_platforms
        s=dict(id='rail',name='Märsta',platform='7',lat=59.,lon=18.)
        way={'tags':{'railway':'platform','gtfs:platform_code:SE-003-UL':'7'},'points':[{'lat':59.,'lon':17.9999},{'lat':59.,'lon':18.0001}]}
        self.assertEqual(discover_platforms([s],{42:way},{42:['Märsta']})[0]['platformWay'],42)
        self.assertEqual(discover_platforms([s],{42:way},{42:['Another station']}),[])
        self.assertEqual(discover_platforms([{**s,'platform':'1'}],{42:way},{42:['Märsta']}),[])
        self.assertEqual(discover_platforms([s],{42:way,43:way},{42:['Märsta'],43:['Märsta']}),[])
        for restriction in ({'tunnel':'yes'},{'layer':'-2'},{'fixme':'estimated'},{'access':'private'}):
            self.assertEqual(discover_platforms([s],{42:{**way,'tags':{**way['tags'],**restriction}}},{42:['Märsta']}),[])

    def test_official_stop_area_ref_can_validate_a_renamed_pole_not_a_large_road_snap(self):
        from valhalla_walks import endpoint_tolerance
        s={'id':'sky','name':'Sky City','station':'9021001057342000','platform':'','lat':59.,'lon':18.,'busOnly':True}
        feature={'id':'osm','lat':59.0001,'lon':18.,'tags':{'highway':'bus_stop','name':'Sky City / Terminal 4 och 5','ref':'57342'}}
        self.assertEqual(endpoint_tolerance(s,[feature]),5)
        self.assertEqual(endpoint_tolerance(s,[{**feature,'lat':59.0003}]),1)
        self.assertEqual(endpoint_tolerance(s,[{**feature,'tags':{**feature['tags'],'ref':'57343'}}]),1)
        self.assertEqual(endpoint_tolerance(s,[feature,{**feature,'id':'other'}]),1)

    def test_nearby_rail_geometry_does_not_hide_a_verified_surface_junction(self):
        from valhalla_walks import nearby_network_anchor
        from stop_matching_test import segment
        stop={'id':'a','name':'Street','busOnly':True,'lat':59.,'lon':18.}
        seed={'id':'b','name':'Bus terminal','busOnly':True,'lat':59.0001,'lon':18.,'anchorLat':59.0001,'anchorLon':18.,'offsetMetres':2}
        rail=[{**e,'edge_info':{**e['edge_info'],'names':['sliso:platform:99']}} for e in segment(99,'rail',30,40,10,.5,18.0005)]
        class Actor:
            def matrix(self,request):return {'sources_to_targets':{'distances':[[.1]],'durations':[[75]]}}
        anchor=nearby_network_anchor(stop,{'edges':segment(1,'street',10,20)+rail},[seed],Actor())
        self.assertEqual(anchor['way'],1)
        self.assertEqual(anchor['verifiedNearby'],'b')
        self.assertIsNone(nearby_network_anchor(stop,{'edges':rail},[seed],Actor()))

    def test_identified_pole_can_validate_closer_gtfs_geometry_without_moving_the_stop(self):
        from valhalla_walks import identified_gtfs_anchor
        from stop_matching_test import segment
        stop={'id':'bus','busOnly':True,'lat':59.,'lon':18.}
        pole={'id':123,'lat':59.,'lon':18.00022}
        result={'edges':segment(1,'path',10,20,10,.5,18.00007)}
        anchor=identified_gtfs_anchor(stop,pole,result)
        self.assertEqual(anchor['osmNode'],123)
        self.assertEqual(anchor['lat'],stop['lat'])
        self.assertEqual(anchor['lon'],stop['lon'])
        self.assertGreater(anchor['offsetMetres'],3)
        self.assertLess(anchor['offsetMetres'],5)
        self.assertIsNone(identified_gtfs_anchor(stop,{**pole,'lon':18.001},result))
        self.assertIsNone(identified_gtfs_anchor({**stop,'busOnly':False},pole,result))
        self.assertIsNone(identified_gtfs_anchor(stop,pole,{'edges':segment(1,'far',10,20,10,.5,18.0001)}))
        self.assertIsNone(identified_gtfs_anchor(stop,pole,{'edges':result['edges']+segment(2,'unconnected',30,40,10,.5,18.00007)}))

    def test_recovered_neighbors_still_require_independent_physical_paths(self):
        from valhalla_walks import nearby_network_anchor
        from stop_matching_test import segment
        stop={'id':'next','busOnly':True,'lat':59.,'lon':18.}
        seed={'id':'recovered','binding':'nearby-pedestrian-network','verifiedNearby':'original',
              'busOnly':True,'lat':59.0001,'lon':18.,'anchorLat':59.0001,'anchorLon':18.,'offsetMetres':2}
        class Actor:
            def __init__(self,distances):self.distances=iter(distances)
            def matrix(self,request):
                km=next(self.distances)
                return {'sources_to_targets':{'distances':[[km]],'durations':[[75 if km is not None else None]]}}
        result={'edges':segment(1,'path',10,20)}
        self.assertEqual(nearby_network_anchor(stop,result,[seed],Actor([.1,.1]))['verifiedNearby'],'recovered')
        self.assertIsNone(nearby_network_anchor(stop,result,[seed],Actor([.1,None])))
        self.assertIsNone(nearby_network_anchor(stop,{'edges':result['edges']+segment(2,'bridge',30,40)},[seed],Actor([])))

    def test_endpoint_recovery_reaches_a_fixed_point_independent_of_input_order(self):
        from valhalla_walks import recover_nearby_anchors
        from stop_matching_test import segment
        seed={'id':'seed','busOnly':True,'lat':59.,'lon':18.,'anchorLat':59.,'anchorLon':18.,'offsetMetres':0}
        b={'id':'b','busOnly':True,'lat':59.,'lon':18.0035}
        c={'id':'c','busOnly':True,'lat':59.,'lon':18.007}
        def result(s):return {'edges':segment(1,'path',10,20,10,.5,s['lon'])}
        class Actor:
            def matrix(self,request):return {'sources_to_targets':{'distances':[[.2]],'durations':[[150]]}}
        pending=[(c,result(c)),(b,result(b))] # c needs b, which is not a seed yet.
        for ordered in (pending,pending[::-1]):
            recovered=recover_nearby_anchors(ordered,[seed],Actor())
            self.assertEqual({s['id']:s['verifiedNearby'] for s in recovered},{'b':'seed','c':'b'})
        disconnected={'edges':result(c)['edges']+segment(2,'bridge',30,40,10,.5,c['lon'])}
        self.assertEqual([s['id'] for s in recover_nearby_anchors([(c,disconnected),(b,result(b))],[seed],Actor())],['b'])
