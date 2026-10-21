import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/core/router';
import { defaults, bandIndex, parseHash, shareHash, validateSettings } from '../src/core/settings';
import { addDays, stockholmInstant, stockholmNow, validateDate } from '../src/core/time';
import type { Connection, Network, Settings } from '../src/core/types';
const base=stockholmInstant('2026-10-19','08:00');
function net(n=7): Network {return {stops:Array.from({length:n},(_,i)=>({id:String(i),name:'Hållplats '+i,lat:59+i/100,lon:18,station:'Station '+i,platform:'Läge '+i})),routes:[{id:'bus',name:'1',mode:'bus'},{id:'metro',name:'2',mode:'metro'}],connections:[],walks:[],transfers:[]};}
function settings(n:Network,overrides:Partial<Settings>={}):Settings{return {...defaults(n.stops[0]),date:'2026-10-19',time:'08:00',...overrides};}
function leg(n:Network,from:number,to:number,dep:number,arr:number,trip:string,route=0,sequence=0, pickup=true,dropoff=true){n.connections.push({from,to,departure:base+dep*60,arrival:base+arr*60,trip,route,sequence,pickup,dropoff});}
function walk(n:Network,from:number,to:number,minutes:number){n.walks.push({from,to,seconds:minutes*60,source:'test fixture'});}
const result=(n:Network,o:Partial<Settings>={})=>search(n,settings(n,o)).values;

test('A02: 42 minutes, not 52; final walk to another stop gives 50',()=>{const n=net();walk(n,0,1,5);leg(n,1,2,15,35,'a');walk(n,2,3,4);leg(n,3,4,42,52,'b');walk(n,4,5,8);const r=result(n);assert.equal(r[4]?.seconds,42*60);assert.equal(r[5]?.seconds,50*60);assert.equal(r[4]?.arrival,base+52*60);});
test('A03: five more minutes at a transfer adds five to cost',()=>{const n=net();leg(n,0,1,10,20,'a');leg(n,1,2,25,35,'b');assert.equal(result(n)[2]?.seconds,25*60);n.connections[1].departure+=300;n.connections[1].arrival+=300;assert.equal(result(n)[2]?.seconds,30*60);});
test('A04: walking limit resets on boarding, not total walking',()=>{const n=net();walk(n,0,1,12);leg(n,1,2,15,20,'a');walk(n,2,3,12);assert.equal(result(n)[3]?.seconds,29*60);});
test('A05/A06: split walking segments never reset the walking budget',()=>{const n=net();walk(n,0,1,8);walk(n,1,2,8);leg(n,2,3,20,25,'a');assert.equal(result(n)[2],null);assert.equal(result(n)[3],null);assert.equal(result(n,{walkMinutes:20})[2]?.seconds,16*60);});
test('A07: filter modes and restrict transfers to zero',()=>{const n=net();leg(n,0,1,10,15,'a',1);leg(n,1,2,18,22,'b',0);assert.equal(result(n,{maxTransfers:0})[2],null);assert.equal(result(n,{modes:['metro']})[2],null);assert.equal(result(n)[2]?.seconds,12*60);});
test('A08: later arrival with shorter displayed time wins',()=>{const n=net();leg(n,0,1,0,25,'early');leg(n,0,1,25,30,'late');assert.equal(result(n)[1]?.seconds,5*60);assert.equal(result(n)[1]?.arrival,base+30*60);});
test('A08: preserve alternative anchors through later transfer',()=>{const n=net();leg(n,0,1,0,5,'early');leg(n,0,1,20,26,'late');leg(n,1,2,30,35,'next');assert.equal(result(n)[2]?.seconds,15*60);});
test('A09/A17: first boarding window and access feasibility, inclusive boundary',()=>{const n=net();walk(n,0,1,10);leg(n,1,2,5,10,'miss');leg(n,1,3,30,35,'boundary');leg(n,1,4,45,50,'late');assert.equal(result(n)[2],null);assert.equal(result(n)[3]?.seconds,15*60);assert.equal(result(n)[4],null);assert.equal(result(n,{windowMinutes:60})[4]?.seconds,15*60);});
test('A10: no invented connections across disconnected water barrier',()=>{const n=net();assert.equal(result(n)[1],null);});
test('A19: max of physical walk and min-transfer, not sum',()=>{const n=net();leg(n,0,1,0,10,'a');walk(n,1,2,4);n.transfers.push({from:1,to:2,type:2,seconds:420});leg(n,2,3,17,20,'b');leg(n,2,4,16,19,'c');const r=result(n,{walkMinutes:5});assert.equal(r[3]?.seconds,20*60);assert.equal(r[4],null);});
test('forbidden transfers survive intermediate walk nodes',()=>{const n=net();leg(n,0,1,0,10,'a');walk(n,1,2,2);walk(n,2,3,2);leg(n,3,4,20,25,'b');n.transfers.push({from:1,to:3,type:3,seconds:0});assert.equal(result(n)[4],null);assert.equal(result(n)[3]?.seconds,14*60);});
test('trip-specific rules supersede generic rules without affecting other trips',()=>{const n=net();leg(n,0,1,0,10,'a');leg(n,1,2,12,15,'b');leg(n,1,3,12,15,'c');n.transfers.push({from:1,to:1,type:3,seconds:0},{from:1,to:1,type:2,seconds:60,fromTrip:'a',toTrip:'b'});assert.equal(result(n)[2]?.seconds,15*60);assert.equal(result(n)[3],null);});
test('same trip remains seated through stop with forbidden boarding/alighting',()=>{const n=net();leg(n,0,1,0,5,'a',0,0,true,false);leg(n,1,2,6,10,'a',0,1,false,true);assert.equal(result(n,{maxTransfers:0})[2]?.seconds,10*60);assert.equal(result(n)[1],null);});
test('pickup forbidden cannot start a ride',()=>{const n=net();leg(n,0,1,0,5,'a',0,0,false,true);assert.equal(result(n)[1],null);});
test('all modes off means direct physical walking only',()=>{const n=net();walk(n,0,1,5);leg(n,0,2,0,2,'a');const r=result(n,{modes:[]});assert.equal(r[1]?.kind,'walk');assert.equal(r[2],null);});
test('F09 exact boundary belongs to the lower band',()=>{assert.equal(bandIndex(0),0);assert.equal(bandIndex(600),0);assert.equal(bandIndex(601),1);assert.equal(bandIndex(1200),1);});
test('A11: cross-midnight ride uses actual epoch time',()=>{const n=net();const t=stockholmInstant('2026-10-19','23:55');n.connections.push({from:0,to:1,departure:t+300,arrival:t+1200,trip:'night',route:0,sequence:0,pickup:true,dropoff:true});assert.equal(result(n,{time:'23:55'})[1]?.seconds,900);});
test('A11/A13: Stockholm timezone and DST are explicit',()=>{assert.equal(stockholmInstant('2026-07-01','08:00'),Date.parse('2026-07-01T06:00Z')/1000);assert.equal(stockholmInstant('2026-12-01','08:00'),Date.parse('2026-12-01T07:00Z')/1000);assert.throws(()=>stockholmInstant('2026-03-29','02:30'),/finns inte/);assert.throws(()=>stockholmInstant('2026-10-25','02:30'),/två gånger/);assert.throws(()=>stockholmInstant('2026-02-30','08:00'));assert.equal(stockholmNow(new Date('2026-10-19T23:00Z')).date,'2026-10-20');});
test('A24: seven local calendar days, not eight, within coverage',()=>{const now=new Date('2026-10-19T12:00Z');validateDate('2026-10-26','2026-10-01','2026-11-30',now);assert.throws(()=>validateDate('2026-10-27','2026-10-01','2026-11-30',now));assert.throws(()=>validateDate('2026-10-25','2026-10-01','2026-10-24',now));assert.equal(addDays('2026-10-24',2),'2026-10-26');});
test('A13/A17/A25: roundtrip all share values, reject unsupported transfer bounds',()=>{const n=net();const s=settings(n,{name:'Östermalm & <b>',maxTransfers:4,windowMinutes:60,modes:[]});assert.deepEqual(parseHash(shareHash(s)),s);assert.throws(()=>validateSettings({...s,maxTransfers:5}),/0–4/);assert.throws(()=>parseHash('#s=%broken'));assert.throws(()=>parseHash('#s='+encodeURIComponent(JSON.stringify({...s,v:2}))));});

// Independent exhaustive event-graph oracle: no dominance, no router helpers.
// Onboard states advance one connection at a time; stop states may board or walk.
function oracle(n:Network,s:Settings):(number|null)[]{
 const best:(number|null)[]=n.stops.map(()=>null),t0=stockholmInstant(s.date,s.time);
 type State={stop:number,time:number,anchor:number|null,walk:number,boards:number,on:string|null,seq:number};
 const visit=(q:State):void=>{
  const cost=q.time-(q.anchor??t0);if(cost>s.maxMinutes*60||q.walk>s.walkMinutes*60||q.boards>s.maxTransfers+1)return;
  if(best[q.stop]===null||cost<best[q.stop]!)best[q.stop]=cost;
  for(const w of n.walks.filter(w=>w.from===q.stop))visit({...q,stop:w.to,time:q.time+w.seconds,walk:q.walk+w.seconds,on:null});
  for(const c of n.connections.filter(c=>c.from===q.stop&&c.departure>=q.time&&s.modes.includes(n.routes[c.route].mode))){
   const stay=q.on===c.trip&&c.sequence===q.seq+1;
   if(!stay&&(!c.pickup||q.boards===s.maxTransfers+1))continue;
   if(q.boards===0&&c.departure>t0+s.windowMinutes*60)continue;
   // Random fixtures have legal dropoff at each stop. Seated continuation is a distinct state.
   visit({stop:c.to,time:c.arrival,anchor:q.anchor??c.departure-q.walk,walk:0,boards:q.boards+(stay?0:1),on:c.trip,seq:c.sequence});
  }
 };
 visit({stop:0,time:t0,anchor:null,walk:0,boards:0,on:null,seq:-1});return best;
}
test('optimized labels match independent exhaustive oracle on 60 seeded networks',()=>{let seed=1701;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};for(let round=0;round<60;round++){const n=net(5);for(let i=0;i<10;i++){const from=Math.floor(random()*4),to=from+1+Math.floor(random()*(4-from));const dep=Math.floor(random()*40),duration=1+Math.floor(random()*12);leg(n,from,to,dep,dep+duration,'t'+i);}for(let from=0;from<4;from++)if(random()<.5)walk(n,from,from+1,3+Math.floor(random()*7));const s=settings(n,{maxTransfers:2});assert.deepEqual(search(n,s).values.map(v=>v?.seconds??null),oracle(n,s),`seeded network ${round}`);}});
test('base GTFS trip constraints apply to dated instances across midnight',()=>{
 for(const prefix of ['', '2026-10-18:']){
  const n=net();leg(n,0,1,0,10,'2026-10-18:first');leg(n,1,2,12,15,'2026-10-19:second');
  n.transfers.push({from:1,to:1,type:3,seconds:0,fromTrip:prefix+'first',toTrip:'second'});
  assert.equal(result(n)[2],null);
  leg(n,0,1,0,10,'2026-10-18:other');
  assert.equal(result(n)[2]?.seconds,15*60,'unrestricted trip must survive dominance');
 }
});
test('merging generic transfer contexts preserves the earlier alighting margin',()=>{
 const n=net();leg(n,0,1,0,10,'a');leg(n,0,1,5,12,'b');leg(n,1,2,17,20,'c');
 n.transfers.push({from:1,to:1,type:2,seconds:420});
 // Late first boarding has a smaller display cost but misses the 7-minute transfer margin.
 assert.equal(result(n)[2]?.seconds,20*60);
});
test('optimized transfer contexts match unpruned search with scoped and minimum-time rules',()=>{
 let seed=9022;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let round=0;round<100;round++){
  const n=net(5);
  for(let i=0;i<12;i++){const from=Math.floor(random()*4),to=from+1+Math.floor(random()*(4-from)),dep=Math.floor(random()*40);leg(n,from,to,dep,dep+2+Math.floor(random()*10),'t'+i,i%2);}
  for(let i=0;i<3;i++){const from=Math.floor(random()*4),to=Math.floor(random()*4);n.transfers.push({from,to,type:random()<.3?3:2,seconds:Math.floor(random()*8)*60,...(random()<.5?{fromTrip:'t'+Math.floor(random()*12)}:{}),...(random()<.3?{fromRoute:'bus'}:{})});}
  for(let i=0;i<4;i++)if(random()<.4)walk(n,i,i+1,3+Math.floor(random()*8));
  const s=settings(n,{maxTransfers:2});
  assert.deepEqual(search(n,s).values.map(v=>v?.seconds??null),search(n,s,{prune:false}).values.map(v=>v?.seconds??null),`network ${round}`);
 }
});
test('request-stop pickup/dropoff remains usable and carries a rider notice',()=>{
 const n=net();leg(n,0,1,10,20,'bus');n.connections[0].pickupRequest=true;n.connections[0].dropoffRequest=true;
 const r=result(n);assert.equal(r[1]?.seconds,600);assert.equal(r[1]?.requestStop,true);
});

test('station progress is provisional, monotone and ends with the exact final values',()=>{
 const n=net(5);leg(n,0,1,0,10,'a');leg(n,1,2,12,15,'b');walk(n,2,3,3);
 const seen=new Map<number,number>(),rounds:number[]=[];
 const r=search(n,settings(n),{onProgress:p=>{
  rounds.push(p.completedRounds);
  for(const {stop,value} of p.changes){
   assert.equal(value.journey,null);
   assert.ok(value.seconds<=(seen.get(stop)??Infinity));seen.set(stop,value.seconds);
  }
 }});
 assert.ok(rounds.length>2);
 assert.deepEqual(rounds,[...rounds].sort((a,b)=>a-b));
 assert.equal(rounds.at(-1),settings(n).maxTransfers+2);
 assert.deepEqual(n.stops.map((_,i)=>seen.get(i)??null),r.values.map(v=>v?.seconds??null));
 assert.deepEqual(r.values.map(v=>v?.seconds??null),search(n,settings(n),{prune:false}).values.map(v=>v?.seconds??null));
});
