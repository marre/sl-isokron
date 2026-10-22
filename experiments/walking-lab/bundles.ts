import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';
import {decodeGrid,encodeGrid,type GridProfiles} from './runtime';
const dir='.data-build/walking-lab',report=JSON.parse(readFileSync(dir+'/results.json','utf8'));
for(const c of report.cases){
 const b=readFileSync(`${dir}/${c.id}/grid-20.bin`),data=decodeGrid(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),byTile=new Map<string,GridProfiles['profiles']>();
 for(const [id,parts] of Object.entries(data.profiles))for(const p of parts){const key=p.y+':'+p.x,group=byTile.get(key)??{};group[id]=[p];byTile.set(key,group)}
 c.bundles=[];
 for(const target of [64,128,256]){
  const sizes:number[]=[];let current:GridProfiles['profiles']={},estimate=0;
  const flush=()=>{if(Object.keys(current).length)sizes.push(gzipSync(new Uint8Array(encodeGrid({grid:data.grid,profiles:current}))).length);current={};estimate=0};
  for(const profiles of byTile.values()){
   flush();
   for(const [id,parts] of Object.entries(profiles)){
    const estimated=gzipSync(new Uint8Array(encodeGrid({grid:data.grid,profiles:{[id]:parts}}))).length;
    if(estimate&&estimate+estimated>target*1024)flush();current[id]=parts;estimate+=estimated;
   }
  }flush();
  c.bundles.push({targetKiB:target,files:sizes.length,gzipBytes:sizes.reduce((n,v)=>n+v,0),largestGzipBytes:Math.max(...sizes),oversizedFiles:sizes.filter(s=>s>target*1024).length});
 }
 console.log(c.id,c.bundles);
}
writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));
