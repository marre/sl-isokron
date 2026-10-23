import {test} from 'node:test';
import assert from 'node:assert/strict';
import {search} from '../src/core/router';
import {search as reference} from '../experiments/walking-state/reference';
import {defaults} from '../src/core/settings';
import {stockholmInstant} from '../src/core/time';
import type {Network,SearchResult,Reach} from '../src/core/types';

const sources=(r:SearchResult)=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
test('cached walking contexts preserve complete witnesses, fractional walks, scoped rules and progress',()=>{
 let seed=19731;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const t0=stockholmInstant('2026-10-22','08:00');
 for(let sample=0;sample<80;sample++){
  const n:Network={stops:Array.from({length:6},(_,i)=>({id:String(i),name:'Stop '+i,lat:59,lon:18,station:String(i),platform:String(i),walkingArea:true})),routes:[{id:'bus|1',name:'Bus',mode:'bus'},{id:'metro',name:'Metro',mode:'metro'}],walks:[],connections:[],transfers:[]};
  for(let from=0;from<6;from++)for(let to=0;to<6;to++)if(from!==to&&random()<.25)n.walks.push({from,to,seconds:15.5+Math.floor(random()*120),metres:100,source:sample%2?'mapped':'Assumed test access'});
  for(let trip=0;trip<8;trip++){
   const path=trip%2?[0,2,4,5]:[1,3,4,5];let time=t0+Math.floor(random()*900);
   for(let p=0;p<3;p++){const departure=time,arrival=time+30+Math.floor(random()*180);n.connections.push({from:path[p],to:path[p+1],departure,arrival,trip:'2026-10-22:trip|'+trip,route:trip%2,sequence:p,pickup:random()>.15,dropoff:random()>.15,pickupRequest:random()<.1});time=arrival+30;}
  }
  for(let rule=0;rule<8;rule++){
   const from=1+Math.floor(random()*4),to=1+Math.floor(random()*4);
   n.transfers.push({from,to,type:random()<.2?3:2,seconds:Math.floor(random()*300),...(random()<.4?{fromTrip:'trip|'+Math.floor(random()*8)}:{}),...(random()<.3?{toTrip:'trip|'+Math.floor(random()*8)}:{}),...(random()<.4?{fromRoute:'bus|1'}:{}),...(random()<.3?{toRoute:'metro'}:{})});
  }
  const settings={...defaults(n.stops[0]),date:'2026-10-22',time:'08:00',maxMinutes:30,walkMinutes:5,maxTransfers:sample%5};
  const updates=new Map<number,Reach>();let rounds=0;
  const next=search(n,settings,{onProgress:p=>{rounds=p.completedRounds;for(const c of p.changes)updates.set(c.stop,c.value);}}),old=reference(n,settings);
  assert.deepEqual(next.values,old.values,'values '+sample);assert.deepEqual(next.journeys,old.journeys,'witnesses '+sample);assert.deepEqual(sources(next),sources(old),'walking frontier '+sample);assert.equal(next.labels,old.labels,'accepted labels '+sample);
  assert.equal(rounds,settings.maxTransfers+2);
  for(let stop=0;stop<next.values.length;stop++)assert.deepEqual(updates.get(stop)??null,next.values[stop]?{...next.values[stop],journey:null}:null);
 }
});
