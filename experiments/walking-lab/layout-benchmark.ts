import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createRequire} from 'node:module';import {gzipSync} from 'node:zlib';import assert from 'node:assert/strict';
import {h3Mapping,squareMapping,applyMapping,difference} from './spatial-layouts';import {displayQuad,decodeQuad,quadTiles,composeQuad} from './quadtree';import {decodeGrid,encodeGrid,gridRender,type GridProfiles} from './runtime';import {sample} from './algorithms';
const require=createRequire(import.meta.url),h3=require('../../.data-build/research-deps/node_modules/h3-js'),dir='.data-build/walking-lab',out='.data-build/algorithm-lab';mkdirSync(out,{recursive:true});
const prior=JSON.parse(readFileSync(dir+'/results.json','utf8')),report:any={dataset:prior.dataset,measuredAt:new Date().toISOString(),h3Version:'4.3.0',notes:['Visual layout tests sample the same recorded native display raster. They are not per-stop precomputation benchmarks.','H3 centres outside the recorded image are clamped to its edge; counts are reported.','Square cells match each H3 resolution’s measured average cell area in this viewport.','Timing is Node CPU, five samples for composition, no network or physical-device timing.'],cases:[]};
const art:Record<string,unknown>={};
function stats(fn:()=>unknown){const values=[];for(let i=0;i<5;i++){const t=performance.now();fn();values.push(performance.now()-t)}values.sort((a,b)=>a-b);return {medianMs:values[2],minMs:values[0],maxMs:values[4]}}
for(const c of prior.cases){
 const display=JSON.parse(readFileSync(dir+'/'+c.id+'/display.json','utf8')),n=c.screen.width*c.screen.height,fields:Record<string,Uint8Array>={};for(const cutoff of [60,91,120]){const a=new Uint8Array(n),runs=display[cutoff].native;for(let i=0;i<runs.length;i+=3)a.fill(runs[i+2],runs[i],runs[i]+runs[i+1]);fields[cutoff]=a}
 const variants:any[]=[],rendered:Record<string,Record<string,string>>={};
 for(const cutoff of [60,91,120])rendered[cutoff]={native:Buffer.from(fields[cutoff]).toString('base64')};
 for(const resolution of [12,13]){
  const start=performance.now(),hex=h3Mapping(h3,c.screen,resolution),hexBuildMs=performance.now()-start,t=performance.now(),square=squareMapping(c.screen,hex.meanCellArea),squareBuildMs=performance.now()-t;
  for(const [id,mapping,buildMs] of [['h3-'+resolution,hex,hexBuildMs],['square-'+resolution,square,squareBuildMs]] as const){
   const record={id,name:id.startsWith('h3')?'H3 resolution '+resolution:'Square · matched H3 '+resolution,cells:mapping.cells,cellAreaM2:mapping.meanCellArea,clampedEdgeCells:mapping.clampedEdgeCells,mappingMs:buildMs,apply:stats(()=>applyMapping(fields[120],mapping)),accuracy:difference(fields[120],applyMapping(fields[120],mapping)),lookupBytes:mapping.owner.byteLength+mapping.samples.byteLength};variants.push(record);
   for(const cutoff of [60,91,120])rendered[cutoff][id]=Buffer.from(applyMapping(fields[cutoff],mapping)).toString('base64');
   console.log(c.id,record);
  }
 }
 const q=displayQuad(fields[120],c.screen.width,c.screen.height),reconstructed=decodeQuad(q.nodes,q.size);for(let y=0;y<c.screen.height;y++)assert.deepEqual(reconstructed.subarray(y*q.size,y*q.size+c.screen.width),new Uint32Array(fields[120].subarray(y*c.screen.width,(y+1)*c.screen.width)));
 variants.push({id:'display-quad',name:'Adaptive display quadtree',nodes:q.nodes.length,rawBytes:q.nodes.byteLength,gzipBytes:gzipSync(new Uint8Array(q.nodes.buffer)).length,accuracy:difference(fields[120],fields[120]),note:'Exact compression of the recorded display pixels, not a finer geographic model.'});
 for(const cutoff of [60,91,120])rendered[cutoff]['display-quad']=rendered[cutoff].native;
 const b=readFileSync(dir+'/'+c.id+'/grid-20.bin'),rle=decodeGrid(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),quad:GridProfiles={grid:rle.grid,profiles:Object.fromEntries(Object.entries(rle.profiles).map(([id,parts])=>[id,quadTiles(parts)]))},encoded=encodeGrid(quad),scenario=JSON.parse(readFileSync(dir+'/'+c.id+'/scenario.json','utf8'));
 function compose(){const field=new Uint8Array(quad.grid.width*quad.grid.height);for(const [id,parts] of Object.entries(quad.profiles))composeQuad(parts,scenario.budgets[id]??[],field,quad.grid.width);return field}
 assert.deepEqual(compose(),gridRender(rle,scenario.budgets));
 const dataCompression={resolution:20,rleRawBytes:b.byteLength,quadtreeRawBytes:encoded.byteLength,rleGzipBytes:gzipSync(b).length,quadtreeGzipBytes:gzipSync(new Uint8Array(encoded)).length,rleCompose:stats(()=>gridRender(rle,scenario.budgets)),quadtreeCompose:stats(compose),exactMembership:true};
 writeFileSync(out+'/'+c.id+'-quad.bin',new Uint8Array(encoded));report.cases.push({id:c.id,name:c.name,screen:c.screen,stops:c.stops,query:c.query,variants,dataCompression});art[c.id]=rendered;writeFileSync(out+'/layouts.json',JSON.stringify(report,null,2));writeFileSync(out+'/display.json',JSON.stringify(art));
}
