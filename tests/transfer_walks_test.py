import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from transfer_walks import add_transfer_walks,PREFIX,update_walking_status
from migrate_transfer_walks import migrate
from release_data import validate,pack,install
from footpath_tiles import write_tiles
from attach_footpaths import attach
import hashlib

class TransferWalkTests(unittest.TestCase):
    def setUp(self):
        self.stops=[dict(id=str(i),name=n,lat=59+i*.0001,lon=18,platform='A',walkingArea=False) for i,n in enumerate(['Metro','Rail','Street','Dock','Other'])]
    def rule(self,a,b,seconds=240,**extra):return dict(**{'from':a,'to':b},seconds=seconds,type=2,**extra)
    def test_declared_direction_and_time_bridge_different_names_without_fake_distance(self):
        walks,stats=add_transfer_walks(self.stops,[],[self.rule(0,1)],30)
        self.assertEqual([(w['from'],w['to'],w['seconds']) for w in walks],[(0,1,240)])
        self.assertNotIn('metres',walks[0]);self.assertTrue(walks[0]['source'].startswith(PREFIX))
        self.assertEqual(stats['addedLinks'],1)
        self.assertEqual(add_transfer_walks(self.stops,walks,[self.rule(0,1)],30),(walks,stats))
    def test_existing_components_and_one_way_restrictions_are_not_short_circuited(self):
        physical=[dict(**{'from':0,'to':2},seconds=600,metres=800,source='mapped'),dict(**{'from':2,'to':1},seconds=600,metres=800,source='mapped')]
        result,stats=add_transfer_walks(self.stops,physical,[self.rule(0,1,60),self.rule(1,0,60)],30)
        self.assertEqual(result,physical);self.assertEqual(stats['existingComponent'],2)
    def test_every_added_pair_requires_its_own_declaration(self):
        rules=[self.rule(0,1),self.rule(1,2),self.rule(0,2,300)]
        walks,_=add_transfer_walks(self.stops,[],rules,30)
        self.assertEqual({(w['from'],w['to']) for w in walks},{(0,1),(1,2),(0,2)})
    def test_scoped_zero_forbidden_retired_and_over_budget_rows_add_no_links(self):
        stops=copy.deepcopy(self.stops);stops[4]['retired']=True
        rules=[self.rule(0,1,0),self.rule(0,1,90,fromTrip='specific'),self.rule(0,1,90,toRoute='route'),self.rule(0,1,1801),self.rule(0,4),dict(**{'from':1,'to':2},seconds=240,type=0),self.rule(2,3),dict(**{'from':2,'to':3},seconds=0,type=3)]
        self.assertEqual(add_transfer_walks(stops,[],rules,30)[0],[])
    def test_legacy_old_platforms_are_filtered_but_explicit_service_metadata_wins(self):
        stops=copy.deepcopy(self.stops);stops[1]['platform']='Läge OLD1 · Buss'
        self.assertEqual(add_transfer_walks(stops,[],[self.rule(0,1)],30)[0],[])
        stops[1]['retired']=False
        self.assertEqual(len(add_transfer_walks(stops,[],[self.rule(0,1)],30)[0]),1)

    def test_geometric_lower_bound_is_only_a_cost_guard_and_duplicate_times_use_the_maximum(self):
        stops=copy.deepcopy(self.stops);stops[1]['lat']=59.01
        walks,_=add_transfer_walks(stops,[],[self.rule(0,1,30)],30)
        self.assertGreaterEqual(walks[0]['seconds'],834);self.assertNotIn('metres',walks[0])
        walks,_=add_transfer_walks(self.stops,[],[self.rule(0,1,240),self.rule(0,1,300)],30)
        self.assertEqual(walks[0]['seconds'],300)
    def test_immutable_migration_retains_contours_footpaths_and_checked_closure(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'data';old='sl-'+'a'*20;directory=root/old;directory.mkdir(parents=True)
            def ref(name,value):
                raw=json.dumps(value).encode();(directory/name).write_bytes(raw)
                return dict(url=f'/data/{old}/{name}',bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
            m=dict(schema=2,version=old,demo=False,walkingMaxMinutes=30,walkingVersion='osm-native',walkingCoverage=dict(pairs=0),validFrom='2026-10-23',validTo='2026-10-28',warnings=[],stops=ref('stops.json',self.stops),walks=ref('walks.json',[]),transfers=ref('transfers.json',[self.rule(0,1)]),trips=ref('trips.json',[]),routes=ref('routes.json',[]),days={})
            m['walkingAreas']=dict(stepMinutes=1,index={'0':0},files=[ref('areas-test.json',{})])
            (root/'manifest.json').write_text(json.dumps(m));(directory/'report.json').write_text(json.dumps(dict(generator='sliso-data-v2',version=old)))
            tiles=Path(temp)/'tiles';write_tiles({0:(59,18),1:(59.001,18)},[(0,1,111,84,False)],{},tiles,'mapped')
            before=attach(root,tiles);after=migrate(root)
            self.assertEqual(after['walkingAreas']['files'][0]['sha256'],before['walkingAreas']['files'][0]['sha256'])
            self.assertEqual([r['sha256'] for r in after['footpaths']['index'].values()],[r['sha256'] for r in before['footpaths']['index'].values()])
            for key in ('routes','transfers','trips'):self.assertEqual(after[key]['sha256'],before[key]['sha256'])
            self.assertEqual(after['transferWalking']['addedLinks'],1);self.assertTrue((root/before['version']/'walks.json').exists());validate(root)
            descriptor=pack(root,Path(temp)/'release.zip',Path(temp)/'release.json','marre/sl-isokron');installed=Path(temp)/'installed';install(Path(temp)/'release.zip',descriptor,installed);self.assertEqual(validate(installed),after)
