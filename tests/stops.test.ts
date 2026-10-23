import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isPublicStop,searchStations} from '../src/core/stops';
import type {Stop} from '../src/core/types';
test('origin search ignores destination text and matches Swedish names',()=>{
 const s:Stop[]=[{id:'a',name:'Slussen',station:'Slussen',platform:'Buss mot T-Centralen',lat:59,lon:18},{id:'b',name:'T-Centralen',station:'T-Centralen',platform:'Läge 3',lat:59,lon:18},{id:'c',name:'Mörby',station:'Mörby',platform:'1',lat:59,lon:18}];
 assert.deepEqual(searchStations(s,'T-Centralen'),['T-Centralen']);assert.deepEqual(searchStations(s,'MO\u0308RBY'),['Mörby']);
});

test('retirement filters platform markers, preserves real names and honours explicit service metadata',()=>{
 const stop=(name:string,platform:string,retired?:boolean):Stop=>({id:name,name,station:name,platform,lat:59,lon:18,...(retired===undefined?{}:{retired})});
 const hidden=['Läge OLD','Läge OLD1','Läge OLDE','Läge OLD¨','Läge OLD · Buss mot Spånga'].map((platform,i)=>stop('Utgången '+i,platform));
 const visible=[stop('Koldalsvägen','Läge A'),stop('Old Town','Läge B'),stop('Levande OLD','Läge OLD',false),stop('Vanlig','Läge GOLD')];
 assert.ok(hidden.every(s=>!isPublicStop(s)));assert.ok(visible.every(isPublicStop));
 assert.equal(isPublicStop(stop('Retired with new label','Läge A',true)),false);
 assert.deepEqual(searchStations([...hidden,...visible],'Utgången'),[]);
 assert.deepEqual(searchStations([...hidden,...visible],'koldals'),['Koldalsvägen']);
 assert.deepEqual(searchStations([...hidden,...visible],'old'),['Koldalsvägen','Old Town','Levande OLD']);
});
