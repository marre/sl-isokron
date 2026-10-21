import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from stop_matching import match_bus_stops, junction_edge
from walking_audit import audit


def stop(id,lat,lon):return dict(id=id,name='Västerledstorget',platform='',busOnly=True,lat=lat,lon=lon)
def feature(id,lat,lon):return dict(id=id,lat=lat,lon=lon,tags={'highway':'bus_stop','name':'Västerledstorget'})
def segment(way,shape,a,b,length=10,percent=.5,lon=18):
    def edge(node,p,forward):return {'edge_info':{'way_id':way,'shape':shape},'percent_along':p,'correlated_lat':59,'correlated_lon':lon,
        'edge':{'forward':forward,'end_node':{'value':node},'geo_attributes':{'length':length},'access':{'pedestrian':True}}}
    return [edge(b,percent,True),edge(a,1-percent,False)]


class MatchingTests(unittest.TestCase):
    def test_global_assignment_resolves_two_nearby_directions(self):
        stops=[stop('a',59.328818,17.968421),stop('b',59.328797,17.968814)]
        features=[feature('A',59.3287589,17.9684279),feature('B',59.3288581,17.9685785)]
        expected={'a':'A','b':'B'}
        self.assertEqual({k:v['id'] for k,v in match_bus_stops(stops,features).items()},expected)
        self.assertEqual({k:v['id'] for k,v in match_bus_stops(stops[::-1],features[::-1]).items()},expected)
    def test_symmetric_or_duplicate_platforms_are_not_guessed(self):
        stops=[stop('a',59,18),stop('b',59,18)]
        features=[feature('A',59,18.0001),feature('B',59,17.9999)]
        self.assertEqual(match_bus_stops(stops,features),{})
        self.assertEqual(match_bus_stops(stops,features[:1]),{})
    def test_identity_restrictions_and_platform_code_are_respected(self):
        s=stop('a',59,18);f=feature('A',59,18)
        self.assertEqual(match_bus_stops([s],[{**f,'tags':{**f['tags'],'foot':'no'}}]),{})
        self.assertEqual(match_bus_stops([{**s,'platform':'B'}],[f]),{})
        self.assertEqual(match_bus_stops([{**s,'busOnly':False}],[f]),{})
    def test_real_shared_graph_nodes_allow_a_short_junction(self):
        s={'lat':59,'lon':18}
        edges=segment(1,'a',10,20,10,.8)+segment(2,'b',20,30,8,0,18.00002)
        self.assertIsNotNone(junction_edge(s,{'edges':edges}))
        # Same coordinates at a different bridge level do not join node IDs.
        disconnected=segment(1,'a',10,20,10,.8)+segment(2,'b',40,50,8,0,18.00002)
        self.assertIsNone(junction_edge(s,{'edges':disconnected}))
    def test_a_clearly_closer_mapped_walkway_is_not_confused_with_adjacent_road(self):
        edges=segment(1,'walkway',10,20,10,.8,18.000026)+segment(2,'road',40,50,8,0,18.000085)
        chosen=junction_edge({'lat':59,'lon':18},{'edges':edges})
        self.assertEqual(chosen['edge_info']['way_id'],1)

    def test_long_network_detours_and_one_way_edges_are_not_local_junctions(self):
        s={'lat':59,'lon':18}
        edges=segment(1,'a',10,20,100,.5)+segment(2,'b',20,30,8,0,18.00002)
        self.assertIsNone(junction_edge(s,{'edges':edges}))
        edges=segment(1,'a',10,20,10,.8)+segment(2,'b',20,30,8,0,18.00002)
        edges[-1]['edge']['access']['pedestrian']=False
        self.assertIsNone(junction_edge(s,{'edges':edges}))
    def test_audit_flags_missing_and_excessive_network_links_without_filling_them(self):
        stops=[stop('a',59,18),stop('b',59,18.0002)]
        edges=[{'from':'a','to':'b','seconds':900,'metres':1200}]
        result=audit(stops,stops,edges,[{'name':'regression','stops':['a','b'],'maxSeconds':300}])
        self.assertEqual(result['nearbyStopPairFindings'],1)
        self.assertEqual(len(result['referenceFailures']),2)
        self.assertEqual(len(edges),1)

    def test_matching_ignores_punctuation_but_keeps_assignment_and_distance_limits(self):
        s={**stop('a',59,18),'name':'Folkets hus, Ölsta'}
        f={**feature('A',59,18),'tags':{'highway':'bus_stop','name':'Folkets hus Ölsta'}}
        self.assertEqual(match_bus_stops([s],[f])['a']['id'],'A')
        self.assertEqual(match_bus_stops([s],[{**f,'lat':59.01}]),{})

    def test_spatial_audit_checks_different_names_and_unbound_neighbors(self):
        stops=[stop('a',59,18),{**stop('b',59.0001,18),'name':'Another stop'},stop('far',60,18)]
        result=audit(stops,stops[:1],[])
        self.assertEqual(result['checkedNearbyPairs'],1)
        self.assertEqual(result['differentNameFindings'],1)
        self.assertEqual(result['findings'][0]['unboundStops'],['b'])
        self.assertEqual(result['findings'][0]['reason'],'unbound-endpoint')

    def test_expanded_junction_uses_real_connecting_edges_beyond_endpoint_radius(self):
        s={'lat':59,'lon':18}
        edges=segment(1,'a',10,20,10,.8)+segment(2,'b',30,40,8,.5,18.00002)
        # Connector is outside the 5 m candidate radius but part of the local graph.
        connector=segment(3,'crossing',20,30,8,.5,18.0002)
        self.assertIsNone(junction_edge(s,{'edges':edges},graph_tolerance=50,max_metres=50))
        self.assertIsNotNone(junction_edge(s,{'edges':edges+connector},graph_tolerance=50,max_metres=50))
