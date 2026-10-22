import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';import assert from 'node:assert/strict';
import {encodePacked,decodePacked,nativeRender,packedRender,type Native} from './runtime';
const dir='.data-build/walking-lab',report=JSON.parse(readFileSync(dir+'/results.json','utf8'));
function time(fn:()=>unknown){const ts=[];for(let i=0;i<5;i++){const t=performance.now();fn();ts.push(performance.now()-t)}ts.sort((a,b)=>a-b);return {medianMs:+ts[2].toFixed(2),minMs:+ts[0].toFixed(2),maxMs:+ts[4].toFixed(2),runs:5}}
for(const c of report.cases){
 const profiles:Native=JSON.parse(readFileSync(dir+'/'+c.id+'/native.json','utf8')),scenario=JSON.parse(readFileSync(dir+'/'+c.id+'/scenario.json','utf8')),encoded=encodePacked(profiles,true),decoded=decodePacked(encoded);
 assert.deepEqual(packedRender(decoded,scenario.budgets,scenario.screen),nativeRender(profiles,scenario.budgets,scenario.screen));writeFileSync(dir+'/'+c.id+'/fixed.bin',new Uint8Array(encoded));
 const variant={id:'fixed',name:'Lossless fixed-point contours',rawBytes:encoded.byteLength,gzipBytes:gzipSync(new Uint8Array(encoded)).length,decode:time(()=>decodePacked(encoded)),compose:time(()=>packedRender(decoded,scenario.budgets,scenario.screen)),accuracy:c.variants[0].accuracy,float64FallbackContours:Object.values(decoded).flat().filter(c=>c.geometry.scale===1).length};c.variants.push(variant);console.log(c.id,variant);
 const display=JSON.parse(readFileSync(dir+'/'+c.id+'/display.json','utf8'));for(const variants of Object.values(display) as any[])variants.fixed=variants.native;writeFileSync(dir+'/'+c.id+'/display.json',JSON.stringify(display));
}
writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));
