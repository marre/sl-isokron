import {test} from 'node:test';import assert from 'node:assert/strict';
import {search as production} from '../src/core/router';
import {search as reference} from '../experiments/routing-lab/reference';import {search as candidate,searchHeap} from '../experiments/routing-lab/raptor';
import {defaults} from '../src/core/settings';import {stockholmInstant} from '../src/core/time';import type {Network,SearchResult} from '../src/core/types';
const objectives=(r:SearchResult)=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival}:null);
const sources=(r:SearchResult)=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
test('route-pattern scanner matches exact labels on 150 seeded overtaking and constrained-transfer networks',()=>{
 let seed=84021;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),base=stockholmInstant('2026-10-22','08:00');
 for(let sample=0;sample<150;sample++){
  const n:Network={stops:Array.from({length:10},(_,i)=>({id:String(i),name:'Stop '+i,lat:59,lon:18,station:String(i),platform:String(i),walkingArea:true})),routes:[{id:'b',name:'B',mode:'bus'},{id:'m',name:'M',mode:'metro'}],connections:[],walks:[],transfers:[]};
  for(let pattern=0;pattern<3;pattern++)for(let trip=0;trip<5;trip++){
   const path=pattern===0?[0,2,4,7]:pattern===1?[1,2,5,8]:[3,5,7,9];let time=base+Math.floor(rand()*30)*60;
   for(let p=0;p<path.length-1;p++){const departure=time,arrival=time+(1+Math.floor(rand()*10))*60;time=arrival+Math.floor(rand()*3)*60;n.connections.push({from:path[p],to:path[p+1],departure,arrival,trip:pattern+'-'+trip,route:pattern%2,sequence:p,pickup:rand()>.15,dropoff:rand()>.15,pickupRequest:rand()<.1,dropoffRequest:rand()<.1})}
  }
  for(let from=0;from<9;from++)if(rand()<.8)n.walks.push({from,to:from+1,seconds:(1+Math.floor(rand()*5))*60,metres:100,source:'mapped test'});
  for(let rule=0;rule<5;rule++){const from=Math.floor(rand()*9),to=from+Math.floor(rand()*Math.min(3,10-from));n.transfers.push({from,to,type:rand()<.3?3:2,seconds:Math.floor(rand()*8)*60,...(rand()<.5?{fromTrip:Math.floor(rand()*3)+'-'+Math.floor(rand()*5)}:{})})}
  const s={...defaults(n.stops[0]),date:'2026-10-22',time:'08:00',maxMinutes:60,walkMinutes:[5,15,30][sample%3],maxTransfers:sample%5};
  const old=reference(n,s),next=production(n,s),heap=searchHeap(n,s);assert.deepEqual(objectives(heap),objectives(old),'heap objectives '+sample);for(let i=0;i<old.values.length;i++)if(old.values[i])assert.ok(heap.values[i]!.boardings<=old.values[i]!.boardings,'heap transfer tie '+sample);assert.deepEqual(sources(heap),sources(old),'heap walking frontiers '+sample);assert.deepEqual(objectives(next),objectives(old),'objectives '+sample);assert.deepEqual(sources(next),sources(old),'walking frontiers '+sample);
  for(const node of next.journeys){if(node.kind==='walk'){assert.ok(n.walks.some(w=>w.from===node.from&&w.to===node.to&&w.seconds===node.arrival-node.departure))}else{assert.ok(n.connections.some(c=>c.from===node.from&&c.departure===node.departure&&c.pickup));assert.ok(n.connections.some(c=>c.to===node.to&&c.arrival===node.arrival&&c.dropoff))}}
 }
});
