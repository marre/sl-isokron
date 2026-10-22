import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {search} from '../../src/core/router';import {decodeConnections,decodeWalks} from '../../src/core/data';import {stockholmInstant} from '../../src/core/time';import {walkingMinutes} from '../../src/core/walking';
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
// Snapshots were captured from the frozen pre-scanner engine on this dataset.
assert.equal(m.version,JSON.parse(readFileSync('docs/algorithm-lab-results.json','utf8')).dataset);
const report:any={dataset:m.version,measuredAt:new Date().toISOString(),cases:[]};
for(const s of settings){
 const old:SearchResult=JSON.parse(readFileSync(dir+'/reference-'+s.stop+'.json','utf8')),next=search(network,s);
 assert.deepEqual(objectives(next),objectives(old));assert.deepEqual(sources(next),sources(old));
 for(let i=0;i<old.values.length;i++)if(old.values[i])assert.ok(next.values[i]!.boardings<=old.values[i]!.boardings);
 for(const minutes of [1,10,30,60,91,120])assert.deepEqual([...walkingMinutes(next.walkSources,minutes*60,s.walkMinutes*60)].sort((a,b)=>a[0]-b[0]),[...walkingMinutes(old.walkSources,minutes*60,s.walkMinutes*60)].sort((a,b)=>a[0]-b[0]));
 report.cases.push({origin:s.name,ms:next.elapsed,reachable:next.values.filter(Boolean).length,allStopObjectivesEqual:true,allWalkingFrontiersEqual:true});console.log(report.cases.at(-1));
 writeFileSync(dir+'/production.json',JSON.stringify(report,null,2));
}
