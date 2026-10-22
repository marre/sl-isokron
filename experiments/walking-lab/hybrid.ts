import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {decodeGrid,gridRender,type GridProfiles} from './runtime';import {decodeQuad} from './quadtree';import {encodeRuns} from './algorithms';
const dir='.data-build/algorithm-lab',report=JSON.parse(readFileSync(dir+'/layouts.json','utf8'));
for(const c of report.cases){const b=readFileSync(dir+'/'+c.id+'-quad.bin'),quad=decodeGrid(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),start=performance.now();
 const decoded:GridProfiles={grid:quad.grid,profiles:Object.fromEntries(Object.entries(quad.profiles).map(([id,parts])=>[id,parts.map(p=>({...p,runs:encodeRuns(decodeQuad(p.runs))}))]))};
 const decodeToRunsMs=performance.now()-start,scenario=JSON.parse(readFileSync('.data-build/walking-lab/'+c.id+'/scenario.json','utf8')),original=readFileSync('.data-build/walking-lab/'+c.id+'/grid-20.bin'),rle=decodeGrid(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength));
 assert.deepEqual(gridRender(decoded,scenario.budgets),gridRender(rle,scenario.budgets));const times=[];for(let i=0;i<5;i++){const t=performance.now();gridRender(decoded,scenario.budgets);times.push(performance.now()-t)}times.sort((a,b)=>a-b);
 Object.assign(c.dataCompression,{decodeToRunsMs,cachedRleComposeMedianMs:times[2],cachedRleBytes:Object.values(decoded.profiles).flat().reduce((n,p)=>n+p.runs.byteLength,0),hybridExact:true});console.log(c.id,decodeToRunsMs,times[2]);
}writeFileSync(dir+'/layouts.json',JSON.stringify(report,null,2));
