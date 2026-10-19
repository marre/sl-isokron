import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { decodeConnections } from '../src/core/data';
import { defaults } from '../src/core/settings';
import { search } from '../src/core/router';
import { stockholmInstant } from '../src/core/time';
import type { FileRef, Manifest, Network, Mode } from '../src/core/types';
const root=process.env.SLISO_DATA_ROOT||'public/data';
const m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
const bytes=(ref:FileRef)=>readFileSync(root+'/'+ref.url.replace(/^\/data\//,''));
const json=<T>(ref:FileRef):T=>JSON.parse(bytes(ref).toString());
const trips=json<string[]>(m.trips);
const core:Omit<Network,'connections'>={stops:json(m.stops),routes:json(m.routes),walks:json(m.walks),transfers:json(m.transfers)};
const cases:{start:string;startId:string;platform:string;max:number;window:number;elapsedMs:number;labels:number;reachable:number}[]=[];
let maxInput=0,maxGzip=0;
const names=['T-Centralen','Slussen','Odenplan','Danderyds sjukhus','Mörby','Alvik','Liljeholmen','Norrtälje busstation','Nynäshamn','Bålsta','Gnesta','Uppsala Centralstation','Vaxholm','Nybroplan','Handen','Täby centrum','Kårsta','Österskär','Tumba','Stavsnäs'];
const preferred:Record<string,Mode>={'T-Centralen':'metro','Slussen':'metro','Odenplan':'rail','Danderyds sjukhus':'metro','Mörby':'tram','Alvik':'tram','Liljeholmen':'tram','Norrtälje busstation':'bus','Nynäshamn':'rail','Bålsta':'rail','Gnesta':'rail','Uppsala Centralstation':'rail','Vaxholm':'boat','Nybroplan':'boat','Handen':'rail','Täby centrum':'tram','Kårsta':'tram','Österskär':'tram','Tumba':'rail','Stavsnäs':'boat'};
const reference=stockholmInstant(m.validFrom,'08:00');
const day=new Date(reference*1000).toISOString().slice(0,10);
const weights=new Map<string,number>();
for(const ref of m.days[day]??[]){
 if(ref.from>reference+7200||ref.until<=reference)continue;
 const raw=bytes(ref);
 for(const c of decodeConnections(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),trips)){
  if(!c.pickup||c.departure<reference||c.departure>reference+7200)continue;
  const key=`${c.from}|${core.routes[c.route].mode}`;
  weights.set(key,(weights.get(key)??0)+(c.departure<=reference+1800?100:1));
 }
}
const indexById=new Map(core.stops.map((s,i)=>[s.id,i]));
const score=(s:Network['stops'][number],mode?:Mode)=>{
 const i=indexById.get(s.id)!;
 return mode?(weights.get(`${i}|${mode}`)??0):core.routes.reduce((sum,r)=>sum+(weights.get(`${i}|${r.mode}`)??0),0);
};
const representative=names.map(name=>{
 const candidates=core.stops.filter(s=>s.name.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv')||s.station.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv'));
 return candidates.sort((a,b)=>score(b,preferred[name])-score(a,preferred[name])||score(b)-score(a))[0];
}).filter((s):s is typeof core.stops[number]=>!!s);
const unique=new Map(representative.map(s=>[s.station,s]));
for(const s of core.stops)if(!unique.has(s.station)&&score(s)>0)unique.set(s.station,s);
const selectedStops=[...unique.values()].slice(0,Number(process.env.SLISO_BENCH_LIMIT||20));
const allStart=performance.now();
for(const start of selectedStops)for(const windowMinutes of (process.env.SLISO_BENCH_QUICK ? [30] : [30,120]))for(const maxMinutes of (process.env.SLISO_BENCH_QUICK ? [60] : [30,60,120])){
 const s={...defaults(start),date:m.validFrom,time:'08:00',maxMinutes,windowMinutes};
 const t0=stockholmInstant(s.date,s.time),end=t0+(windowMinutes+maxMinutes)*60;
 const first=new Date(t0*1000).toISOString().slice(0,10),last=new Date(end*1000).toISOString().slice(0,10);
 const refs=Object.entries(m.days).filter(([d])=>d>=first&&d<=last).flatMap(([,refs])=>refs.filter(ref=>ref.from<=end&&ref.until>t0));
 const connections=refs.flatMap(ref=>{const b=bytes(ref);return decodeConnections(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),trips);}).filter(c=>c.departure>=t0&&c.departure<=end);
 const selected=[m.stops,m.routes,m.walks,m.transfers,m.trips,...refs];
 maxInput=Math.max(maxInput,selected.reduce((sum,r)=>sum+r.bytes,0));
 maxGzip=Math.max(maxGzip,selected.reduce((sum,r)=>sum+gzipSync(bytes(r)).byteLength,0));
 const r=search({...core,connections},s);
 cases.push({start:start.name,startId:start.id,platform:start.platform,max:maxMinutes,window:windowMinutes,elapsedMs:Math.round(r.elapsed*100)/100,labels:r.labels,reachable:r.values.filter(Boolean).length});
 if(cases.length%10===0)console.log(`Completed ${cases.length} benchmark cases`);
}
const ordered=cases.map(c=>c.elapsedMs).sort((a,b)=>a-b);
const report={measuredAt:new Date().toISOString(),dataset:m.version,synthetic:m.demo,walkingCoverage:m.walkingCoverage??null,runtime:process.version,system:`${platform()} ${arch()} ${cpus()[0]?.model}`,note:'Container measurement. Not a physical laptop/mobile or browser memory/transfer benchmark. Gzip computed offline; actual HTTP encoding depends on hosting.',stops:core.stops.length,cases:cases.length,medianMs:ordered[Math.floor(ordered.length*.5)],p95Ms:ordered[Math.floor(ordered.length*.95)],maxMs:ordered.at(-1),within3Seconds:cases.filter(c=>c.elapsedMs<=3000).length,within30Seconds:cases.filter(c=>c.elapsedMs<=30000).length,maxSelectedUncompressedBytes:maxInput,maxSelectedGzipBytes:maxGzip,nodeProcessMemory:process.memoryUsage(),totalMs:Math.round(performance.now()-allStart),results:cases};
writeFileSync(process.env.SLISO_BENCH_OUTPUT||'docs/benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined},null,2));
