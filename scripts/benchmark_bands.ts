/** Rendering-only benchmark: native contours, progressive file arrivals, no route calculation.
 * Usage: npx tsx scripts/benchmark_bands.ts /path/to/data [file-count]
 * Missing local shards are skipped; nothing is downloaded. */
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {BandRaster,rasterBands,type AreaBand,type AreaGeometry,type RasterGrid} from '../src/core/bands';
import type {Manifest,Stop} from '../src/core/types';
const root=resolve(process.argv[2]??'public/data'),limit=Number(process.argv[3]??120);
const manifest:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
const batches:AreaBand[][]=[];
const stops:Stop[]=JSON.parse(readFileSync(root+'/'+manifest.stops.url.replace(/^\/data\//,''),'utf8'));
const distances=new Map<number,number>();
for(const stop of stops){
 const index=manifest.walkingAreas?.index[stop.id];if(index===undefined)continue;
 const distance=(stop.lat-59.335)**2+((stop.lon-18.06)*.51)**2;
 distances.set(index,Math.min(distance,distances.get(index)??Infinity));
}
const files=(manifest.walkingAreas?.files??[]).map((ref,index)=>({ref,distance:distances.get(index)??Infinity})).sort((a,b)=>a.distance-b.distance);
for(const {ref} of files){
 const file=root+'/'+ref.url.replace(/^\/data\//,'');if(!existsSync(file))continue;
 const profiles=JSON.parse(readFileSync(file,'utf8')) as Record<string,{minutes:number;geometry:AreaGeometry}[]>;
 const bands=[10,20,30].map(minutes=>({minutes,geometries:Object.values(profiles).flatMap(contours=>contours.filter(c=>c.minutes===minutes).map(c=>c.geometry))}));
 if(bands.every(b=>!b.geometries.length))continue;
 batches.push(bands);if(batches.length>=limit)break;
}
if(!batches.length)throw new Error('No local native walking contours');
const all=batches.flat().flatMap(b=>b.geometries);
// Use a fixed Stockholm viewport to measure real clipping as well as visible contours.
const grid:RasterGrid={width:600,height:900,bounds:[17.98,59.30,18.14,59.37]};
let baseline=new Uint8Array(),before=performance.now(),oldCloned=0;
for(let n=6;n<batches.length+6;n+=6){
 const bands=structuredClone(batches.slice(0,Math.min(n,batches.length)).flat());oldCloned+=bands.reduce((sum,b)=>sum+b.geometries.length,0);
 baseline=rasterBands(bands,grid);
}
const rebuildMs=performance.now()-before,raster=new BandRaster(grid);before=performance.now();
for(let n=0;n<batches.length;n+=6)raster.add(structuredClone(batches.slice(n,n+6).flat()));
const incrementalMs=performance.now()-before;assert.deepEqual(raster.field,baseline);
console.log(JSON.stringify({dataset:manifest.version,files:batches.length,contours:all.length,fullRebuildMs:Math.round(rebuildMs),incrementalMs:Math.round(incrementalMs),speedup:Number((rebuildMs/incrementalMs).toFixed(2)),geometryCopiesBefore:oldCloned,geometryCopiesAfter:all.length,identicalPixels:true},null,2));
