import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {WalkingClosure,decodeWalkingClosure} from '../src/core/walking-closure';import {search} from '../src/core/router';
import {search as reference} from '../experiments/walking-state/reference';import {defaults} from '../src/core/settings';import {stockholmInstant} from '../src/core/time';import type {Network,SearchResult} from '../src/core/types';
const source={walksSHA256:'a'.repeat(64),stopsSHA256:'b'.repeat(64),maxSeconds:1800};
const base=stockholmInstant('2026-10-22','08:00');
function tables(networks:Network[]){
 const py=spawnSync('python',['-c',"import sys,json,base64;sys.path.insert(0,'scripts');from walking_closure import build;print(json.dumps([base64.b64encode(build(n['stops'],n['walks'],30,'a'*64,'b'*64)[0]).decode() for n in json.load(sys.stdin)]))"],{input:JSON.stringify(networks),encoding:'utf8',maxBuffer:16*1024*1024});
 assert.equal(py.status,0,py.stderr);return (JSON.parse(py.stdout) as string[]).map(s=>{const b=Buffer.from(s,'base64');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
}
const objectives=(r:SearchResult)=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival,boardings:v.boardings}:null);
const sources=(r:SearchResult)=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
test('production precompute matches reference objectives and walking frontiers on 100 constrained networks',async()=>{
 let seed=719302;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),networks:Network[]=[];
 for(let sample=0;sample<100;sample++){
  const n:Network={stops:Array.from({length:8},(_,i)=>({id:String(i),name:'Stop '+i,lat:59,lon:18,station:String(i),platform:String(i),walkingArea:true})),routes:[{id:'bus',name:'Bus',mode:'bus'},{id:'metro',name:'Metro',mode:'metro'}],walks:[],connections:[],transfers:[]};
  for(let from=0;from<8;from++)for(let to=0;to<8;to++)if(from!==to&&random()<.18)n.walks.push({from,to,seconds:30+Math.floor(random()*300),metres:100,source:random()<.2?'Assumed access':'mapped'});
  for(let trip=0;trip<10;trip++){
   const path=trip%2?[0,2,4,7]:[1,3,5,7];let departure=base+Math.floor(random()*1200);
   for(let p=0;p<3;p++){const arrival=departure+30+Math.floor(random()*300);n.connections.push({from:path[p],to:path[p+1],departure,arrival,route:trip%2,trip:'2026-10-22:trip'+trip,sequence:p,pickup:random()>.1,dropoff:random()>.1});departure=arrival+30;}
  }
  for(let r=0;r<5;r++)n.transfers.push({from:Math.floor(random()*8),to:Math.floor(random()*8),type:random()<.2?3:2,seconds:Math.floor(random()*300),...(random()<.3?{fromTrip:'trip'+Math.floor(random()*10)}:{}),...(random()<.3?{fromRoute:'bus'}:{})});
  networks.push(n);
 }
 const bytes=tables(networks);
 for(let sample=0;sample<networks.length;sample++){
  const n=networks[sample],s={...defaults(n.stops[0]),date:'2026-10-22',time:'08:00',maxMinutes:60,walkMinutes:[5,15,30][sample%3],maxTransfers:sample%5};
  const old=reference(n,s);n.walkingClosure=await decodeWalkingClosure(bytes[sample],n,source);const next=search(n,s);
  assert.deepEqual(objectives(next),objectives(old),'objectives '+sample);assert.deepEqual(sources(next),sources(old),'walking frontiers '+sample);
  for(let i=0;i<next.journeys.length;i++){
   const node=next.journeys[i];if(node.previous!==null){assert.ok(node.previous<i);assert.equal(next.journeys[node.previous].to,node.from);assert.ok(next.journeys[node.previous].arrival<=node.departure);}
   if(node.kind==='walk')assert.ok(n.walks.some(w=>w.from===node.from&&w.to===node.to&&w.seconds===node.arrival-node.departure&&w.metres===node.metres&&(w.source.startsWith('Assumed ')||undefined)===node.estimated));
  }
 }
});
test('closure rejects source mismatches, truncated tables and invalid suffix paths',async()=>{
 const n:Network={stops:[0,1,2].map(i=>({id:String(i),name:String(i),lat:59,lon:18,station:String(i),platform:String(i)})),routes:[],connections:[],transfers:[],walks:[{from:0,to:1,seconds:30,source:'mapped'},{from:1,to:2,seconds:40,source:'mapped'}]};
 const [packed]=tables([n]);const raw=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 assert.throws(()=>new WalkingClosure(raw,n,{...source,walksSHA256:'c'.repeat(64)}),/annan dataversion/);
 assert.throws(()=>new WalkingClosure(raw.slice(0,-1),n,source),/skadat/);
 const bad=raw.slice(0);new DataView(bad).setUint16(96+4*4+2,31,true);assert.throws(()=>new WalkingClosure(bad,n,source),/skadat/);
 n.walkingClosure=await decodeWalkingClosure(packed,n,source);
 const s={...defaults(n.stops[0]),date:'2026-10-22',time:'08:00',walkMinutes:30};assert.deepEqual(objectives(search(n,s)),objectives(reference(n,s)));
 // A table covering less than the requested budget cannot replace graph closure.
 n.walkingClosure={...n.walkingClosure,maxSeconds:1} as typeof n.walkingClosure;
 assert.deepEqual(objectives(search(n,s)),objectives(reference(n,s)));
});
