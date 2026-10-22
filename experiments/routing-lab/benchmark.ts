import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {search as reference} from './reference';import {search as raptor,searchHeap} from './raptor';import {decodeConnections,decodeWalks} from '../../src/core/data';import {stockholmInstant} from '../../src/core/time';import {walkingMinutes} from '../../src/core/walking';
import type {FileRef,Manifest,Network,Settings,SearchResult} from '../../src/core/types';
const root=process.argv[2]??'.data-build/diagnosis/data',dir='.data-build/routing-lab';mkdirSync(dir,{recursive:true});
const m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
function bytes(ref:FileRef){const b=readFileSync(root+'/'+ref.url.replace(/^\/data\//,''));assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256);return b}
function json<T>(ref:FileRef):T{return JSON.parse(bytes(ref).toString())}
const core:Omit<Network,'connections'>={stops:json(m.stops),walks:decodeWalks(json(m.walks)),routes:json(m.routes),transfers:json(m.transfers)},trips=json<string[]>(m.trips);
const template:Settings=JSON.parse(readFileSync('.data-build/walking-lab/arlanda.json','utf8')).settings;
const settings=['9022001057310001','9022001007361002','9022001015503003'].map(id=>{const s=core.stops.find(s=>s.id===id)!;return {...template,stop:id,name:s.name,lat:s.lat,lon:s.lon}});
const t0=stockholmInstant(template.date,template.time),end=t0+(template.maxMinutes+template.windowMinutes)*60;
const refs=Object.values(m.days).flat().filter(ref=>ref.from<=end&&ref.until>t0),network:Network={...core,connections:refs.flatMap(ref=>{const b=bytes(ref);return decodeConnections(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),trips)}).filter(c=>c.departure>=t0&&c.departure<=end)};
const objectives=(r:SearchResult)=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival}:null);
const sources=(r:SearchResult)=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
const report:any={dataset:m.version,measuredAt:new Date().toISOString(),runtime:process.version,notes:['One unthrottled Node run per engine and query; includes query-side indexing.','Experimental route-pattern scan retains every trip instance, including overtaking trips.','Production router is unchanged. Timings are not physical mobile measurements.'],cases:[]};
for(const s of settings){
 const snapshot=dir+'/reference-'+s.stop+'.json';
 console.log('Starting experimental',s.name);const next=raptor(network,s);console.log('Experimental',s.name,Math.round(next.elapsed),'ms',next.labels,'labels');
 console.log('Starting reference',s.name);const old:SearchResult=reference(network,s);writeFileSync(snapshot,JSON.stringify(old));console.log('Reference',s.name,Math.round(old.elapsed),'ms',old.labels,'labels');
 const heap=searchHeap(network,s);console.log('Priority closure',s.name,Math.round(heap.elapsed),'ms',heap.labels,'labels');
 let error:string|undefined;try{assert.deepEqual(objectives(next),objectives(old));assert.deepEqual(objectives(heap),objectives(old));assert.deepEqual(sources(heap),sources(old));for(let i=0;i<old.values.length;i++)if(old.values[i]){assert.ok(next.values[i]!.boardings<=old.values[i]!.boardings);assert.ok(heap.values[i]!.boardings<=old.values[i]!.boardings)}assert.deepEqual(sources(next),sources(old));for(const minutes of [1,10,30,60,91,120])assert.deepEqual([...walkingMinutes(next.walkSources,minutes*60,s.walkMinutes*60)].sort((a,b)=>a[0]-b[0]),[...walkingMinutes(old.walkSources,minutes*60,s.walkMinutes*60)].sort((a,b)=>a[0]-b[0]))}catch(e){error=String(e)}
 const record={settings:s,referenceMs:old.elapsed,experimentalMs:next.elapsed,heapMs:heap.elapsed,heapLabels:heap.labels,improvedTransferTies:old.values.filter((v,i)=>v&&heap.values[i]!.boardings<v.boardings).length,speedup:old.elapsed/next.elapsed,referenceLabels:old.labels,experimentalLabels:next.labels,reachable:old.values.filter(Boolean).length,allStopObjectivesEqual:!error,allWalkingFrontiersEqual:!error,error};report.cases.push(record);writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));console.log(record);if(error)throw new Error('Exactness gate failed for '+s.name+'; see results.json');
}
