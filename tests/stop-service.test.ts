import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyStopService} from '../src/core/stop-service';import {isPublicStop,isMapStop,searchStations} from '../src/core/stops';
import {search} from '../src/core/router';import {defaults} from '../src/core/settings';import {stockholmInstant} from '../src/core/time';
import type {Manifest,Network,Stop} from '../src/core/types';
const stops=():Stop[]=>Array.from({length:4},(_,i)=>({id:String(i),name:'Stop '+i,station:'Stop '+i,platform:'A',lat:59,lon:18}));
const m={version:'test',stops:{sha256:'abc'}} as Manifest;
test('service index is bound to the full dataset and stop order; missing evidence preserves stops',()=>{
 const list=stops(),valid={schema:1,dataset:'test',stopsSHA256:'abc',count:4,serviceBits:btoa(String.fromCharCode(13))};
 for(const invalid of [null,{...valid,dataset:'old'},{...valid,stopsSHA256:'wrong'},{...valid,count:3},{...valid,serviceBits:''}]){assert.equal(applyStopService(list,m,invalid),false);assert.ok(list.every(s=>s.scheduled===undefined));}
 assert.ok(applyStopService(list,m,valid));assert.deepEqual(list.map(isMapStop),[true,false,true,true]);assert.equal(list.length,4);assert.deepEqual(searchStations(list,'Stop 1'),[]);
});
test('an unserved stop remains a walking bridge to transit despite its marker being hidden',()=>{
 const s={...defaults(stops()[0]),date:'2026-10-23',time:'08:00'},t0=stockholmInstant(s.date,s.time);
 const n:Network={stops:stops(),routes:[{id:'bus',name:'1',mode:'bus'}],transfers:[],walks:[{from:0,to:1,seconds:60,source:'mapped'},{from:1,to:2,seconds:60,source:'mapped'}],connections:[{from:2,to:3,departure:t0+300,arrival:t0+900,route:0,trip:'trip',sequence:0,pickup:true,dropoff:true}]};
 const before=search(n,s);n.stops[1].scheduled=false;const after=search(n,s);
 assert.equal(isMapStop(n.stops[1]),false);assert.equal(isPublicStop(n.stops[1]),true);assert.deepEqual(after.walkSources,before.walkSources);assert.equal(after.values[3]?.seconds,before.values[3]?.seconds);assert.equal(after.values[3]?.arrival,before.values[3]?.arrival);assert.equal(after.values[3]?.boardings,1);assert.equal(n.walks.length,2);assert.equal(n.stops.length,4);
});
