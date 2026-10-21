import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from feed_scope import select_routes
from osm_walks import bindings,blocked_node,walkable

class ScopeTests(unittest.TestCase):
    def test_mixed_feed_requires_policy_and_all_feed_keeps_every_actor(self):
        agencies=[{'agency_id':a} for a in ['sl','ul','wax']]
        routes=[{'agency_id':a,'route_id':a+'route'} for a in ['sl','ul','wax']]
        with self.assertRaisesRegex(ValueError,'explicit --scope'):select_routes(routes,agencies)
        selected,report=select_routes(routes,agencies,{'version':'v1','includeAll':True,'description':'User chose all routes'})
        self.assertEqual(selected,routes);self.assertEqual(report['excludedRoutes'],[])
        self.assertEqual(report['includedAgencies'],['sl','ul','wax'])
    def test_operator_subset_is_explicit_and_unknown_actor_stops_build(self):
        agencies=[{'agency_id':a} for a in ['sl','ul','wax']]
        routes=[{'agency_id':a,'route_id':a+'route'} for a in ['sl','ul','wax']]
        policy={'version':'v1','description':'SL only','includeAgencies':['sl'],'excludeAgencies':['ul','wax']}
        selected,report=select_routes(routes,agencies,policy)
        self.assertEqual([r['route_id'] for r in selected],['slroute'])
        self.assertEqual(len(report['excludedRoutes']),2)
        with self.assertRaisesRegex(ValueError,'unclassified'):
            select_routes(routes+[{'agency_id':'new','route_id':'newroute'}],agencies+[{'agency_id':'new'}],policy)

class OSMTests(unittest.TestCase):
    def test_walking_profile_excludes_closed_or_prohibited_and_motorway(self):
        self.assertTrue(walkable({'highway':'footway','bridge':'yes'}))
        self.assertFalse(walkable({'highway':'footway','opening_hours':'06:00-23:00'}))
        self.assertFalse(walkable({'highway':'footway','foot':'no'}))
        self.assertFalse(walkable({'highway':'motorway','foot':'yes'}))
        self.assertTrue(walkable({'highway':'primary'}))
        self.assertTrue(walkable({'highway':'secondary','maxspeed':'50'}))
        self.assertFalse(walkable({'highway':'primary','motorroad':'yes'}))
        self.assertFalse(walkable({'highway':'secondary','foot':'no'}))
        self.assertFalse(walkable({'highway':'secondary','access':'private'}))
        self.assertFalse(walkable({'highway':'trunk'}))
        self.assertTrue(walkable({'highway':'tertiary','maxspeed':'40'}))
        self.assertTrue(walkable({'highway':'tertiary','maxspeed':'70'}))
        self.assertTrue(walkable({'highway':'tertiary'}))
        self.assertFalse(walkable({'highway':'tertiary','motorroad':'yes'}))
        self.assertFalse(walkable({'highway':'tertiary','maxspeed':'70','foot':'no'}))
        self.assertFalse(walkable({'highway':'tertiary','maxspeed':'40','foot':'no'}))
        self.assertFalse(walkable({'highway':'tertiary','maxspeed':'40','foot':'use_sidepath'}))
        self.assertFalse(walkable({'highway':'tertiary','maxspeed':'40','access':'private'}))
        self.assertFalse(walkable({'highway':'tertiary','maxspeed':'40','foot:conditional':'no @ night'}))
        self.assertTrue(walkable({'highway':'primary','foot':'designated'}))
        self.assertTrue(blocked_node({'barrier':'gate'}))
        self.assertFalse(blocked_node({'barrier':'entrance','opening_hours':'24/7'}))
    def test_bus_binding_needs_identity_proximity_and_graph_membership(self):
        stop={'id':'a','name':'Åsen','platform':'A','lat':59.,'lon':18.}
        node={'id':'n','lat':59.,'lon':18.,'tags':{'highway':'bus_stop','name':'Åsen','local_ref':'A'}}
        self.assertEqual(len(bindings([stop],[node],{'n'})),1)
        self.assertEqual(bindings([stop],[node],set()),[])
        self.assertEqual(bindings([stop],[{**node,'lat':59.0001}],{'n'}),[])
        self.assertEqual(bindings([stop],[{**node,'tags':{**node['tags'],'local_ref':'B'}}],{'n'}),[])
        self.assertEqual(bindings([stop,{**stop,'id':'other-platform'}],[node],{'n'}),[])


class EndpointTests(unittest.TestCase):
    def test_projected_endpoint_requires_one_pedestrian_way_within_coordinate_precision(self):
        from valhalla_walks import select_anchor
        stop={'id':'a','lat':59.,'lon':18.}
        edge={'way_id':1,'correlated_lat':59.,'correlated_lon':18.000001}
        self.assertIsNotNone(select_anchor(stop,{'edges':[edge,{**edge,'percent_along':1}]}))
        self.assertIsNone(select_anchor(stop,{'edges':[edge,{**edge,'way_id':2}]}))
        self.assertIsNone(select_anchor(stop,{'edges':[{**edge,'correlated_lon':18.001}]}))
        urban={**edge,'way_id':2,'correlated_lon':18.0000001,'edge_info':{'names':['sliso:default-road']}}
        self.assertEqual(select_anchor(stop,{'edges':[edge,urban]})['way'],1)
        self.assertEqual(select_anchor(stop,{'edges':[urban]})['way'],2)

    def test_bus_coordinate_tolerance_needs_unique_osm_identity(self):
        from valhalla_walks import endpoint_tolerance, select_anchor
        stop={'id':'a','name':'Skorpvägen','platform':'','busOnly':True,'lat':59.365035,'lon':17.932531}
        feature={'lat':59.3650725,'lon':17.9325467,'tags':{'highway':'bus_stop','name':'Skorpvägen'}}
        edge={'way_id':57869,'correlated_lat':59.365018,'correlated_lon':17.932498}
        self.assertIsNone(select_anchor(stop, {'edges':[edge]}))
        tolerance=endpoint_tolerance(stop,[feature])
        self.assertEqual(tolerance,5)
        self.assertIsNotNone(select_anchor(stop, {'edges':[edge]},tolerance))
        for features in ([],[feature,feature],[{**feature,'tags':{'highway':'bus_stop','name':'Other'}}],[{**feature,'lat':59.366}]):
            self.assertEqual(endpoint_tolerance(stop,features),1)
        self.assertEqual(endpoint_tolerance({**stop,'busOnly':False},[feature]),1)
        self.assertEqual(endpoint_tolerance({**stop,'platform':'B'},[feature]),1)
        self.assertIsNone(select_anchor(stop,{'edges':[edge,{**edge,'way_id':123}]},5))
        self.assertIsNone(select_anchor(stop,{'edges':[{**edge,'correlated_lon':17.933}]},5))

    def test_osm_bus_position_resolves_run_sides_without_guessing_nearest_path(self):
        from valhalla_walks import identified_anchor, select_anchor
        from stop_matching import match_bus_stops
        stop={'id':'a','name':'Runstensplan','platform':'','busOnly':True,'lat':59.351047,'lon':17.900123}
        osm={'id':'1823992068','lat':59.3511061,'lon':17.9000386,'tags':{'highway':'bus_stop','name':'Runstensplan'}}
        # GTFS lies roughly midway between two paths; broad road snapping is ambiguous.
        paths=[{'way_id':85093,'correlated_lat':59.351088,'correlated_lon':17.90004},
               {'way_id':84620,'correlated_lat':59.351003,'correlated_lon':17.900205}]
        self.assertIsNone(select_anchor(stop,{'edges':paths},10))
        self.assertEqual(match_bus_stops([stop],[osm]).get(stop['id']),osm)
        actual={'edges':[{'way_id':85093,'correlated_lat':59.351096,'correlated_lon':17.900056}]}
        bound=identified_anchor(stop,osm,actual)
        self.assertEqual(bound['way'],85093)
        self.assertEqual(bound['osmNode'],osm['id'])
        self.assertEqual(bound['lat'],stop['lat'])
        self.assertGreater(bound['offsetMetres'],bound['coordinateShiftMetres'])
        self.assertIsNone(identified_anchor(stop,osm,{'edges':paths+[{'way_id':2,'correlated_lat':osm['lat'],'correlated_lon':osm['lon']}]}))

    def test_osm_identity_match_rejects_ambiguity_restrictions_and_wrong_platforms(self):
        from stop_matching import match_bus_stops
        stop={'id':'a','name':'Runstensplan','platform':'','busOnly':True,'lat':59.351595,'lon':17.901282}
        osm={'id':'1823992041','lat':59.3515189,'lon':17.9011792,'tags':{'highway':'bus_stop','name':'Runstensplan'}}
        self.assertEqual(match_bus_stops([stop],[osm]).get(stop['id']),osm)
        for features in ([osm,{**osm,'id':'other-node'}],[{**osm,'lat':59.352}],[{**osm,'tags':{**osm['tags'],'foot':'no'}}],[{**osm,'tags':{**osm['tags'],'name':'Elsewhere'}}]):
            self.assertNotIn(stop['id'],match_bus_stops([stop],features))
        self.assertEqual(match_bus_stops([{**stop,'busOnly':False}],[osm]),{})
        self.assertEqual(match_bus_stops([{**stop,'platform':'B'}],[osm]),{})

    def test_network_walk_includes_both_endpoint_offsets_and_limit(self):
        from valhalla_walks import walking_pair
        a={'id':'a','offsetMetres':4}; b={'id':'b','offsetMetres':4}
        pair=walking_pair(a,b,146,.195,'OSM',30)
        self.assertEqual(pair['seconds'],152)
        self.assertEqual(pair['metres'],203)
        self.assertIsNone(walking_pair(a,b,1795,2.39,'OSM',30))
        self.assertIsNone(walking_pair(a,b,None,None,'OSM',30))

if __name__=='__main__':unittest.main()
