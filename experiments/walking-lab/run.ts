import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import assert from 'node:assert/strict';
import {walkingMinutes} from '../../src/core/walking';
import {bandLimits,type RasterGrid} from '../../src/core/bands';
import {tileGrid,precompute,tiles,nested,firstMinute,sample,encodeRuns,type Contour,type Tile} from './algorithms';
import {encodePacked,decodePacked,encodeGrid,decodeGrid,nativeRender,packedRender,gridRender,type Native,type Budgets,type GridProfiles} from './runtime';
import type {Manifest,Stop} from '../../src/core/types';
const dir='.data-build/walking-lab',input=JSON.parse(readFileSync(dir+'/cases.json','utf8')),root=input.root;
const m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8')),file=(url:string)=>root+'/'+url.replace(/^\/data\//,''),stops:Stop[]=JSON.parse(readFileSync(file(m.stops.url),'utf8'));
const report:any={dataset:m.version,measuredAt:new Date().toISOString(),system:cpus()[0]?.model,runtime:process.version,notes:['Offline build and Node CPU measurements; browser results recorded separately.','Existing native contours are the reference, not ground-truth pedestrian access.','Only selected viewports were built; no regional storage extrapolation.','Gzip sizes measured offline, not observed HTTP transfers.','Grid resolution is ground metres at latitude 59.335; airport/rural cells differ slightly.'],cases:[]};
function stats(fn:()=>unknown,n=5){const times=[];for(let i=0;i<n;i++){const t=performance.now();fn();times.push(performance.now()-t)}times.sort((a,b)=>a-b);return {medianMs:+times[Math.floor(n/2)].toFixed(2),minMs:+times[0].toFixed(2),maxMs:+times.at(-1)!.toFixed(2),runs:n}}
function metrics(reference:Uint8Array,actual:Uint8Array){let changed=0,gained=0,lost=0,bandChanged=0,union=0,intersection=0;for(let i=0;i<reference.length;i++){const a=reference[i],b=actual[i];if(a||b)union++;if(a&&b)intersection++;if(a!==b){changed++;if(!a)gained++;else if(!b)lost++;else bandChanged++}}return {changed,gained,lost,bandChanged,union,changedPctOfCoveredUnion:union?+(changed/union*100).toFixed(3):0,coverageIoU:union?+(intersection/union).toFixed(5):1}}
function earliestTiles(parts:Tile[]):Tile[]{return parts.map(p=>{const values=new Uint32Array(4096);for(let i=0;i<p.runs.length;i+=3)values.fill((0x3fffffff<<(firstMinute(p.runs[i+2])-1))&0x3fffffff,p.runs[i],p.runs[i]+p.runs[i+1]);return {...p,runs:encodeRuns(values)}})}
for(const c of input.cases){
 const q=JSON.parse(readFileSync(dir+'/'+c.query+'.json','utf8')),profiles:Native={},rawFiles:Buffer[]=[];
 for(const i of c.files){const ref=m.walkingAreas!.files[i],b=readFileSync(file(ref.url));assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256);rawFiles.push(b);Object.assign(profiles,JSON.parse(b.toString()))}
 const [w,s,e,n]=c.bounds,ratio=(e-w)*Math.cos((s+n)/2*Math.PI/180)/(n-s),screen:RasterGrid={width:640,height:Math.round(640/ratio),bounds:c.bounds};
 const budgets:Budgets={},cutoffBudgets:Record<string,Budgets>={};
 for(const cutoff of [60,91,120]){const byId:Budgets={};for(const minutes of bandLimits(120,cutoff))for(const [i,walking] of walkingMinutes(q.walkSources,minutes*60,q.settings.walkMinutes*60)){const id=stops[i].id;if(profiles[id])(byId[id]??=[]).push({minutes,walking})}cutoffBudgets[cutoff]=byId}
 Object.assign(budgets,cutoffBudgets[120]);
 const reference=nativeRender(profiles,budgets,screen),baselineJSON=Buffer.from(JSON.stringify(profiles)),packed=encodePacked(profiles),packedProfiles=decodePacked(packed);
 assert.deepEqual(packedRender(packedProfiles,budgets,screen),reference);
 const caseDir=dir+'/'+c.id;mkdirSync(caseDir,{recursive:true});writeFileSync(caseDir+'/native.json',baselineJSON);writeFileSync(caseDir+'/packed.bin',new Uint8Array(packed));
 const record:any={id:c.id,name:c.name,query:q.settings,routingMs:q.routingMs,profileFiles:c.files.length,profiles:Object.keys(profiles).length,referencePixels:reference.length,screen,currentShards:{rawBytes:rawFiles.reduce((n,b)=>n+b.length,0),gzipBytes:rawFiles.reduce((n,b)=>n+gzipSync(b).length,0)},variants:[],cutoffs:{},stops:stops.flatMap((stop,i)=>q.seconds[i]!==null&&stop.lon>=w&&stop.lon<=e&&stop.lat>=s&&stop.lat<=n?[{id:stop.id,name:stop.name,lon:stop.lon,lat:stop.lat,seconds:q.seconds[i]}]:[])};
 const native={id:'native',name:'Current contours',rawBytes:baselineJSON.length,gzipBytes:gzipSync(baselineJSON).length,decode:stats(()=>JSON.parse(baselineJSON.toString())),compose:stats(()=>nativeRender(profiles,budgets,screen)),accuracy:metrics(reference,reference)};
 const binary={id:'packed',name:'Packed Float64 contours',rawBytes:packed.byteLength,gzipBytes:gzipSync(new Uint8Array(packed)).length,decode:stats(()=>decodePacked(packed)),compose:stats(()=>packedRender(packedProfiles,budgets,screen)),accuracy:metrics(reference,reference)};
 record.variants.push(native,binary);
 const displays:Record<string,Record<string,Uint32Array>>={};
 for(const cutoff of [60,91,120]){const baseline=nativeRender(profiles,cutoffBudgets[cutoff],screen);displays[cutoff]={native:encodeRuns(new Uint32Array(baseline)),packed:encodeRuns(new Uint32Array(baseline))}}
 for(const metres of [10,20,40]){
  const begin=performance.now(),aligned=tileGrid(c.bounds,metres),data:GridProfiles={grid:aligned.grid,profiles:{}},earliest:GridProfiles={grid:aligned.grid,profiles:{}},nonNested={cells:0,coveredCells:0,profiles:0};
  for(const [id,contours] of Object.entries(profiles)){
   const masks=precompute(contours,aligned.grid);let bad=0;for(const value of masks)if(value){nonNested.coveredCells++;if(!nested(value)){nonNested.cells++;bad++}}if(bad)nonNested.profiles++;
   const parts=tiles(masks,aligned.grid);if(parts.length){data.profiles[id]=parts;if(metres===20)earliest.profiles[id]=earliestTiles(parts)}
  }
  const offlineMs=performance.now()-begin,encoded=encodeGrid(data),decoded=decodeGrid(encoded);writeFileSync(caseDir+'/grid-'+metres+'.bin',new Uint8Array(encoded));
  const field=gridRender(decoded,budgets),sameGridReference=nativeRender(profiles,budgets,aligned.grid);assert.deepEqual(field,sameGridReference);
  const variant:any={id:'grid-'+metres,name:metres+' m membership tiles',resolution:metres,rawBytes:encoded.byteLength,gzipBytes:gzipSync(new Uint8Array(encoded)).length,offlineMs:Math.round(offlineMs),decodedRunBytes:Object.values(decoded.profiles).flat().reduce((n,p)=>n+p.runs.byteLength,0),nonNested,decode:stats(()=>decodeGrid(encoded)),compose:stats(()=>sample(gridRender(decoded,budgets),aligned.grid,screen)),accuracy:metrics(reference,sample(field,aligned.grid,screen)),sameGridExact:true,grid:aligned.grid};record.variants.push(variant);
  for(const cutoff of [60,91,120]){const baseline=nativeRender(profiles,cutoffBudgets[cutoff],screen),actual=sample(gridRender(decoded,cutoffBudgets[cutoff]),aligned.grid,screen);displays[cutoff][variant.id]=encodeRuns(new Uint32Array(actual));(record.cutoffs[cutoff]??={})[variant.id]=metrics(baseline,actual)}
  if(metres===20){
   const early=encodeGrid(earliest);writeFileSync(caseDir+'/earliest-20.bin',new Uint8Array(early));const earlyDecoded=decodeGrid(early),earlyField=gridRender(earlyDecoded,budgets,true),exactGrid=gridRender(decoded,budgets);
   const lossy={id:'earliest-20',name:'20 m earliest-minute tiles',rawBytes:early.byteLength,gzipBytes:gzipSync(new Uint8Array(early)).length,decode:stats(()=>decodeGrid(early)),compose:stats(()=>sample(gridRender(earlyDecoded,budgets,true),aligned.grid,screen)),accuracy:metrics(reference,sample(earlyField,aligned.grid,screen)),membershipLoss:metrics(exactGrid,earlyField),grid:aligned.grid};record.variants.push(lossy);
   for(const cutoff of [60,91,120])displays[cutoff][lossy.id]=encodeRuns(new Uint32Array(sample(gridRender(earlyDecoded,cutoffBudgets[cutoff],true),aligned.grid,screen)));
   // Group complete spatial tiles; sizes are gzip estimates of independent archives.
   const byTile=new Map<string,GridProfiles['profiles']>();
   for(const [id,parts] of Object.entries(data.profiles))for(const p of parts){const key=p.y+':'+p.x,group=byTile.get(key)??{};group[id]=[p];byTile.set(key,group)}
   const tileChunks=[...byTile.values()].map(profiles=>new Uint8Array(encodeGrid({grid:aligned.grid,profiles}))),bundles=[];
   for(const target of [64,128,256]){let current:Uint8Array[]=[],size=0;const sizes:number[]=[];for(const chunk of tileChunks){const compressed=gzipSync(chunk).length;if(size&&size+compressed>target*1024){sizes.push(gzipSync(Buffer.concat(current)).length);current=[];size=0}current.push(chunk);size+=compressed}if(current.length)sizes.push(gzipSync(Buffer.concat(current)).length);bundles.push({targetKiB:target,files:sizes.length,gzipBytes:sizes.reduce((n,v)=>n+v,0),largestGzipBytes:Math.max(...sizes)})}
   record.bundles=bundles;record.spatialTiles=byTile.size;
  }
  console.log(c.id,metres+'m',variant.compose.medianMs+'ms',Math.round(variant.gzipBytes/1024)+'KiB','non-nested cells',nonNested.cells);
 }
 writeFileSync(caseDir+'/scenario.json',JSON.stringify({screen,budgets,cutoffBudgets}));
 writeFileSync(caseDir+'/display.json',JSON.stringify(Object.fromEntries(Object.entries(displays).map(([cutoff,variants])=>[cutoff,Object.fromEntries(Object.entries(variants).map(([id,runs])=>[id,Array.from(runs)]))]))));
 report.cases.push(record);writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));console.log(c.id,'complete',record.variants.map((v:any)=>[v.id,v.compose.medianMs,v.accuracy.changedPctOfCoveredUnion]));
}
