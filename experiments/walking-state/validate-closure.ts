/** Untimed validation: all real paths plus independent Floyd–Warshall small tables. */
import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {WalkingClosure} from './table';import {search as candidate} from '../../.data-build/walking-state/closure-router';import {search as reference} from './reference';
import {defaults} from '../../src/core/settings';import {stockholmInstant} from '../../src/core/time';import type {Network,SearchResult} from '../../src/core/types';
const dir='.data-build/walking-state',fixture=JSON.parse(readFileSync(dir+'/network.json','utf8'));
const buffer=readFileSync(dir+'/closure.bin'),table=new WalkingClosure(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),fixture.network);
let checked=0;
for(let from=0;from<fixture.network.stops.length;from++)for(let entry=table.begin(from);entry<table.end(from);entry++){
 const path=table.path(from,table.destination(entry));assert.equal(path[0].from,from);assert.equal(path.at(-1)!.to,table.destination(entry));assert.equal(path.reduce((sum,w)=>sum+w.seconds,0),table.seconds(entry));checked++;
}
console.log('Validated every real closure witness:',checked);
function smallTable(n:Network){
 const count=n.stops.length,dist=Array.from({length:count},(_,i)=>Array.from({length:count},(_,j)=>i===j?0:Infinity)),first=dist.map(row=>row.map(()=>-1));
 n.walks.forEach((w,index)=>{if(w.seconds<dist[w.from][w.to]){dist[w.from][w.to]=w.seconds;first[w.from][w.to]=index;}});
 for(let k=0;k<count;k++)for(let i=0;i<count;i++)for(let j=0;j<count;j++)if(dist[i][k]+dist[k][j]<dist[i][j]){dist[i][j]=dist[i][k]+dist[k][j];first[i][j]=first[i][k];}
 const rows=[0],entries:number[][]=[];
 for(let i=0;i<count;i++){for(let j=0;j<count;j++)if(i!==j&&dist[i][j]<=1800)entries.push([j,dist[i][j],first[i][j]]);rows.push(entries.length);}
 const bytes=new ArrayBuffer(32+4*(count+1)+8*entries.length),v=new DataView(bytes);
 [0x43574c53,1,count,n.walks.length,1800,entries.length,0,0].forEach((x,i)=>v.setUint32(i*4,x,true));rows.forEach((x,i)=>v.setUint32(32+i*4,x,true));
 entries.forEach(([to,seconds,edge],i)=>{const offset=32+4*(count+1)+i*8;v.setUint16(offset,to,true);v.setUint16(offset+2,seconds,true);v.setUint32(offset+4,edge,true);});
 return new WalkingClosure(bytes,n);
}
const objectives=(r:SearchResult)=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival,boardings:v.boardings}:null);
const sources=(r:SearchResult)=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
let seed=719302;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),time=stockholmInstant('2026-10-22','08:00');
for(let sample=0;sample<100;sample++){
 const n:Network={stops:Array.from({length:8},(_,i)=>({id:String(i),name:'Stop '+i,lat:59,lon:18,station:String(i),platform:String(i),walkingArea:true})),routes:[{id:'bus',name:'Bus',mode:'bus'},{id:'metro',name:'Metro',mode:'metro'}],walks:[],connections:[],transfers:[]};
 for(let from=0;from<8;from++)for(let to=0;to<8;to++)if(from!==to&&random()<.18)n.walks.push({from,to,seconds:30+Math.floor(random()*300),metres:100,source:random()<.2?'Assumed access':'mapped'});
 for(let trip=0;trip<10;trip++){
  const path=trip%2?[0,2,4,7]:[1,3,5,7];let departure=time+Math.floor(random()*1200);
  for(let p=0;p<3;p++){const arrival=departure+30+Math.floor(random()*300);n.connections.push({from:path[p],to:path[p+1],departure,arrival,route:trip%2,trip:'2026-10-22:trip'+trip,sequence:p,pickup:random()>.1,dropoff:random()>.1});departure=arrival+30;}
 }
 for(let r=0;r<5;r++)n.transfers.push({from:Math.floor(random()*8),to:Math.floor(random()*8),type:random()<.2?3:2,seconds:Math.floor(random()*300),...(random()<.3?{fromTrip:'trip'+Math.floor(random()*10)}:{}),...(random()<.3?{fromRoute:'bus'}:{})});
 const s={...defaults(n.stops[0]),date:'2026-10-22',time:'08:00',maxMinutes:60,walkMinutes:[5,15,30][sample%3],maxTransfers:sample%5};
 const old=reference(n,s),next=candidate(n,s,{walkingClosure:smallTable(n)});
 assert.deepEqual(objectives(next),objectives(old),'seeded objectives '+sample);assert.deepEqual(sources(next),sources(old),'seeded walking frontier '+sample);
 for(const node of next.journeys)if(node.kind==='walk')assert.ok(n.walks.some(w=>w.from===node.from&&w.to===node.to&&w.seconds===node.arrival-node.departure));
}
const report={dataset:fixture.dataset,allRealWitnessPathsChecked:checked,independentFloydWarshallSeededNetworks:100,allObjectivesAndWalkingFrontiersEqual:true};writeFileSync(dir+'/closure-validation.json',JSON.stringify(report,null,2));console.log(report);
