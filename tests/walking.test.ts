import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceText, walkingMinutes } from '../src/core/walking';
import { search } from '../src/core/router';
import { defaults } from '../src/core/settings';
import { stockholmInstant } from '../src/core/time';
import type { Network } from '../src/core/types';

test('area budget includes previous continuous walking and conservatively rounds down', () => {
  const sources=[{stop:0,seconds:5*60,walked:5*60},{stop:1,seconds:600,walked:0}];
  assert.equal(walkingMinutes(sources,20*60,15*60).get(0),10);
  assert.equal(walkingMinutes(sources,20*60,15*60).get(1),10);
  assert.equal(walkingMinutes(sources,659,15*60).has(1),false);
});

test('area candidates retain a slower arrival with a fresh walking budget', () => {
  const stops=Array.from({length:2},(_,i)=>({id:String(i),name:String(i),station:String(i),platform:'A',lat:59,lon:18,walkingArea:true}));
  const t=stockholmInstant('2026-10-19','08:00');
  const network:Network={stops,routes:[{id:'b',name:'1',mode:'bus'}],transfers:[],walks:[{from:0,to:1,seconds:600,metres:750,source:'fixture'}],connections:[{from:0,to:1,departure:t,arrival:t+720,trip:'bus',route:0,sequence:0,pickup:true,dropoff:true}]};
  const r=search(network,{...defaults(stops[0]),date:'2026-10-19',time:'08:00'});
  assert.equal(r.values[1]?.seconds,600);
  assert.deepEqual(r.walkSources.filter(s=>s.stop===1),[{stop:1,seconds:600,walked:600},{stop:1,seconds:720,walked:0}]);
  assert.equal(walkingMinutes(r.walkSources,1800,900).get(1),15);
  assert.equal(distanceText(undefined),'avstånd saknas');assert.equal(distanceText(750),'750 m');assert.equal(distanceText(1250),'1,3 km');
});
