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
        self.assertFalse(walkable({'highway':'primary'}))
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

if __name__=='__main__':unittest.main()
