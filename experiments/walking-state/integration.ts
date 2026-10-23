/** Actual production worker + verified compiled release, cold and CacheStorage warm. */
import {chromium} from 'playwright';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {decodeWalks,decodeConnections} from '../../src/core/data';import {stockholmInstant} from '../../src/core/time';import type {Manifest,FileRef,Network,Settings,SearchResult} from '../../src/core/types';
const root=process.env.SLISO_DATA_ROOT??'.data-build/precompute/data',m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
function bytes(ref:FileRef){const b=readFileSync(root+ref.url.replace(/^\/data\//,'/'));assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
function json<T>(ref:FileRef):T{return JSON.parse(new TextDecoder().decode(bytes(ref)));}
assert.ok(m.walkingClosure);
const template:Settings={v:1,stop:'',name:'',lat:0,lon:0,date:'2026-10-22',time:'08:07',maxMinutes:120,walkMinutes:30,maxTransfers:4,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
const t0=stockholmInstant(template.date,template.time),end=t0+(template.maxMinutes+template.windowMinutes)*60,trips=json<string[]>(m.trips);
const n:Network={stops:json(m.stops),walks:decodeWalks(json(m.walks)),routes:json(m.routes),transfers:json(m.transfers),connections:Object.values(m.days).flat().filter(r=>r.from<=end&&r.until>t0).flatMap(r=>decodeConnections(bytes(r),trips)).filter(c=>c.departure>=t0&&c.departure<=end)};
const walkIndex=n.stops.map(()=>[] as Network['walks']),departures=n.stops.map(()=>[] as Network['connections']),arrivals=n.stops.map(()=>[] as Network['connections']);
for(const w of n.walks)walkIndex[w.from].push(w);for(const c of n.connections){departures[c.from].push(c);arrivals[c.to].push(c);}
const objectives=(r:SearchResult)=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival,boardings:v.boardings}:null),sources=(r:SearchResult)=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
function witnesses(r:SearchResult){for(let i=0;i<r.journeys.length;i++){
 const node=r.journeys[i];if(node.previous!==null){assert.ok(node.previous<i);const p=r.journeys[node.previous];assert.equal(p.to,node.from);assert.ok(p.arrival<=node.departure);}
 if(node.kind==='walk')assert.ok(walkIndex[node.from].some(w=>w.to===node.to&&w.seconds===node.arrival-node.departure&&w.metres===node.metres&&(w.source.startsWith('Assumed ')||undefined)===node.estimated));
 else assert.ok(departures[node.from].some(b=>b.departure===node.departure&&b.route===node.route&&b.pickup&&arrivals[node.to].some(a=>a.trip===b.trip&&a.sequence>=b.sequence&&a.arrival===node.arrival&&a.dropoff)));
 }for(let stop=0;stop<r.values.length;stop++){const v=r.values[stop];if(v&&v.journey!==null){assert.equal(r.journeys[v.journey].to,stop);assert.equal(r.journeys[v.journey].arrival,v.arrival);}}}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const report={dataset:m.version,measuredAt:new Date().toISOString(),runtime:browser.version(),table:m.walkingClosure,notes:['Actual minified production worker; local verified compiled release.','Each engine/origin uses a new browser context; each query uses a new worker, matching the app.','Warm phase reuses CacheStorage; no simulated bandwidth or CPU throttling.','Profiling stage timers enabled, no CPU sampling; one cold and one warm run per origin/engine.'],cases:[] as unknown[]};
try{for(const stop of ['9022001057310001','9022001007361002','9022001015503003']){
 const origin=n.stops.find(s=>s.id===stop)!;const settings={...template,stop,name:origin.name,lat:origin.lat,lon:origin.lon};let baseline:SearchResult|undefined;
 for(const engine of ['graph','precomputed']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let requests=0,closureRequests=0,transferred=0;
  page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/data/')){requests++;transferred+=Number(r.headers()['content-length']??0);if(new URL(r.url()).pathname===m.walkingClosure!.url)closureRequests++;}});
  await page.goto('http://127.0.0.1:5196/experiments/walking-state/integration.html');await page.waitForFunction(()=>!!(window as any).run);
  const manifest={...m};if(engine==='graph')delete manifest.walkingClosure;
  for(const phase of ['cold','cache-warm']){
   const before={requests,closureRequests,transferred};const data=await page.evaluate(({manifest,settings})=>(window as any).run(manifest,settings),{manifest,settings}) as {result:SearchResult;profileEvents:{name:string;ms:number;detail?:Record<string,unknown>}[];batches:number};
   if(!baseline)baseline=data.result;assert.deepEqual(objectives(data.result),objectives(baseline));assert.deepEqual(sources(data.result),sources(baseline));witnesses(data.result);
   assert.ok(data.profileEvents.filter(e=>e.name==='routing.walkClosure').every(e=>e.detail?.precomputed===(engine==='precomputed')));
   const loadMs=data.profileEvents.find(e=>e.name==='routing.loadNetwork')!.ms,decodeMs=data.profileEvents.find(e=>e.name==='network.walkingClosureDecode')?.ms??0;
   const row={origin:origin.name,engine,phase,searchMs:data.result.elapsed,loadMs,closureDecodeMs:decodeMs,totalMs:loadMs+data.result.elapsed,labels:data.result.labels,reachable:data.result.values.filter(Boolean).length,stationBatches:data.batches,requests:requests-before.requests,closureRequests:closureRequests-before.closureRequests,bytes:transferred-before.transferred,exactObjectivesAndWalkingFrontiers:true,allWitnessEdgesValidated:true};
   if(phase==='cache-warm')assert.equal(row.requests,0);if(engine==='precomputed'&&phase==='cold')assert.equal(row.closureRequests,1);
   report.cases.push(row);console.log(row);writeFileSync('.data-build/precompute/integration-results.json',JSON.stringify(report,null,2));
  }await context.close();
 }
}}finally{await browser.close();}
