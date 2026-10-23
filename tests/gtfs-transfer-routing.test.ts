import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {search} from '../src/core/router';import {journeyFor} from '../src/core/journey';import {defaults} from '../src/core/settings';import {stockholmInstant} from '../src/core/time';import type {Network} from '../src/core/types';
test('published station access keeps boarding minima, one walking budget and scoped prohibitions',()=>{
 const stops=Array.from({length:5},(_,i)=>({id:String(i),name:'Station '+i,lat:59+i*.0001,lon:18,station:String(i),platform:'A',walkingArea:true}));
 const n:Network={stops,routes:[{id:'metro',name:'Metro',mode:'metro'},{id:'rail',name:'Rail',mode:'rail'}],walks:[{from:2,to:3,seconds:120,metres:160,source:'mapped'}],transfers:[{from:1,to:2,type:2,seconds:240}],connections:[]};
 const run=spawnSync('python',['-c',"import sys,json;sys.path.insert(0,'scripts');from transfer_walks import add_transfer_walks;n=json.load(sys.stdin);print(json.dumps(add_transfer_walks(n['stops'],n['walks'],n['transfers'],30)[0]))"],{input:JSON.stringify(n),encoding:'utf8'});assert.equal(run.status,0,run.stderr);n.walks=JSON.parse(run.stdout);
 const s={...defaults(stops[0]),date:'2026-10-23',time:'08:00',walkMinutes:5},base=stockholmInstant(s.date,s.time);
 n.connections.push({from:0,to:1,departure:base,arrival:base+300,trip:'metro-trip',route:0,sequence:0,pickup:true,dropoff:true},{from:2,to:4,departure:base+480,arrival:base+600,trip:'too-early',route:1,sequence:0,pickup:true,dropoff:true},{from:2,to:4,departure:base+540,arrival:base+720,trip:'legal',route:1,sequence:0,pickup:true,dropoff:true});
 const r=search(n,s);assert.equal(r.values[2]?.seconds,540);assert.equal(r.values[4]?.seconds,720,'walk and minimum transfer time overlap rather than add twice');assert.equal(r.values[3],null,'station passage uses four minutes of the five-minute walking budget');
 const walks=journeyFor(r,4).filter(l=>l.kind==='walk');assert.equal(walks.length,1);assert.equal(walks[0].estimated,true);assert.equal(walks[0].metres,undefined);
 n.transfers.push({from:1,to:2,type:3,seconds:0,fromTrip:'metro-trip',toTrip:'legal'});assert.equal(search(n,s).values[4],null,'specific transfer prohibitions still apply across the added walking edge');
});
