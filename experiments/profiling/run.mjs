import {cpuSummary,summarize} from './metrics.mjs';
import {chromium} from 'playwright';import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve(process.env.SLISO_DATA_ROOT??'.data-build/fixed-release/data'),out='.data-build/profiling';await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(root+'/manifest.json','utf8'));
async function json(ref){const raw=await readFile(root+ref.url.replace(/^\/data\//,'/'));assert.equal(raw.length,ref.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),ref.sha256);return JSON.parse(raw)}
const fixture=JSON.parse(await readFile('.data-build/profiling/fixture.json','utf8'));assert.equal(fixture.dataset,manifest.version,'Run prepare.ts for this dataset');
const stops=await json(manifest.stops),snapshot=fixture.result,settings=fixture.settings;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']}),rootCDP=await browser.newBrowserCDPSession();let wireId=0;
const pending=new Map();rootCDP.on('Target.receivedMessageFromTarget',({message})=>{const data=JSON.parse(message),p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result)}});
async function workerSession(url){
 for(let i=0;i<50;i++){
  const {targetInfos}=await rootCDP.send('Target.getTargets'),target=targetInfos.find(t=>t.type==='worker'&&t.url===url);
  if(target){const {sessionId}=await rootCDP.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});return {send:(method,params={})=>new Promise((resolve,reject)=>{const id=++wireId;pending.set(id,{resolve,reject});void rootCDP.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject)})}}
  await new Promise(resolve=>setTimeout(resolve,10));
 }throw new Error('Worker target missing');
}
const selected=process.argv[2]??'quick';
const cases=selected==='ablation'?[{name:'city-200ms',zoom:13,latency:0,paintEvery:200},{name:'city-final-only',zoom:13,latency:0,finalOnly:true}]:selected==='quick'?[{name:'city-direct',zoom:13,latency:0,cpu:true}]:selected==='full'?[{name:'city-direct-1',zoom:13,latency:0,cpu:true},{name:'city-direct-2',zoom:13,latency:0},{name:'city-direct-3',zoom:13,latency:0},{name:'city-intercept',zoom:13,latency:0,intercept:true},{name:'city-40ms',zoom:13,latency:40},{name:'city-40ms-2',zoom:13,latency:40},{name:'region-direct',zoom:11,latency:0,cpu:true},{name:'street-direct',zoom:15,latency:0,cpu:true},{name:'city-disabled',zoom:13,latency:0,disabled:true}]:[{name:selected,zoom:13,latency:0,cpu:true}];
const report={dataset:manifest.version,measuredAt:new Date().toISOString(),notes:['Real production WalkingView, bands worker and codec; unminified compiled harness with stage timers.','A saved exact routing result is prepared before timing. Routing excluded from contour-only phases.','Async stage sums overlap, and include event-loop stalls; do not add them to infer wall time or CPU.','HTTP is local HTTP/1.1 keep-alive, without bandwidth throttling. A 40 ms case adds fixed response latency only.','Mobile viewport on desktop Chromium; not physical mobile hardware.'],cases:[]};
try{
 if(selected==='routing'){
  report.cases=[];
  for(const id of ['9022001057310001','9022001007361002']){
   const stop=stops.find(s=>s.id===id),s={...settings,stop:id,name:stop.name,lat:stop.lat,lon:stop.lon};
   console.log('Routing',s.name);
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let cpuWorker,pendingWorker;
   page.on('worker',worker=>{pendingWorker=workerSession(worker.url()).then(async session=>{await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:1000});await session.send('Profiler.start');cpuWorker=session})});
   await page.goto('http://127.0.0.1:5192/experiments/profiling/index.html?profile=1');await page.waitForFunction(()=>window.bench);
   // Keep the routing worker alive just long enough to retrieve its CPU profile.
   const start=await page.evaluate(()=>performance.timeOrigin+performance.now());
   const result=await page.evaluate(async({manifest,settings})=>window.bench.route(manifest,settings),{manifest,settings:s});
   const data=await page.evaluate(()=>({end:performance.timeOrigin+performance.now(),events:window.__slisoProfile.snapshot()}));
   await pendingWorker;const {profile}=await cpuWorker.send('Profiler.stop');
   const row={name:s.name,wallMs:data.end-start,...result,...summarize(data.events,start,data.end),workerCPU:cpuSummary(profile)};
   report.cases.push(row);await writeFile(`${out}/routing-${id}.cpuprofile`,JSON.stringify(profile));await writeFile(`${out}/routing-${id}-events.json`,JSON.stringify(data.events));console.log(row.name,Math.round(row.wallMs),row.elapsed,row.labels);await context.close();
   await writeFile(`${out}/results-routing.json`,JSON.stringify(report,null,2));
  }
 }else for(const test of cases){
  console.log('Starting',test.name);const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'x-profile-latency':String(test.latency)}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let bytes=0,requests=0,cpuWorker,pendingWorker;
  page.on('worker',worker=>{if(test.cpu&&worker.url().includes('bands-worker'))pendingWorker=workerSession(worker.url()).then(async session=>{await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:1000});await session.send('Profiler.start');cpuWorker=session})});
  if(test.paintEvery||test.finalOnly)await page.addInitScript(({paintEvery,finalOnly})=>{
   const Native=window.Worker;
   window.Worker=class extends Native{
    constructor(url,options){super(url,options);this.expected=0;this.loaded=0;this.last=0;this.held=null;this.timer=null;
     this.addEventListener('message',({data})=>{if(data.type==='loaded'){this.loaded++;if(finalOnly&&this.loaded>=this.expected&&this.held)this.flush()}});
    }
    flush(){const held=this.held;this.held=null;this.last=performance.now();if(held)super.postMessage(...held)}
    postMessage(data,...rest){
     if(data.type==='retain')this.expected=data.files.length;
     if(data.type==='render'){
      if(finalOnly&&this.loaded<this.expected){this.held=[data,...rest];return}
      if(paintEvery&&performance.now()-this.last<paintEvery){this.held=[data,...rest];clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),paintEvery-(performance.now()-this.last));return}
      this.last=performance.now();
     }
     super.postMessage(data,...rest);
    }
    terminate(){clearTimeout(this.timer);super.terminate()}
   };
  },{paintEvery:test.paintEvery,finalOnly:test.finalOnly});
  if(test.intercept)await page.route('**/data/**',async route=>{const name=new URL(route.request().url()).pathname;assert.match(name,/^\/data\/[a-zA-Z0-9._/-]+$/);const raw=await readFile(root+name.slice(5));requests++;bytes+=raw.length;await route.fulfill({body:raw,contentType:name.endsWith('.json')?'application/json':'application/octet-stream'})});
  else page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/data/')){requests++;bytes+=Number(r.headers()['content-length']??0)}});
  await page.goto('http://127.0.0.1:5192/experiments/profiling/index.html?profile='+(test.disabled?'0':'1'));
  await page.waitForFunction(()=>window.bench);
  await page.evaluate(input=>window.bench.setup(input),{manifest,stops,result:snapshot,settings,center:[59.335,18.06],zoom:test.zoom});
  const mainCDP=await context.newCDPSession(page);
  const record={...test,phases:[]};
  for(const phase of ['cold','disk-warm','decoded-cutoff']){
   if(test.cpu){await mainCDP.send('Profiler.enable');await mainCDP.send('Profiler.start')}
   const before={requests,bytes};const start=await page.evaluate(()=>{window.__slisoProfile?.clear();return performance.timeOrigin+performance.now()});
   await page.evaluate(async phase=>{await Promise.race([phase==='decoded-cutoff'?window.bench.cutoff(91):window.bench.run(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Overlay timeout')),240000))])},phase);
   const result=await page.evaluate(()=>({end:performance.timeOrigin+performance.now(),events:window.__slisoProfile?.snapshot()??[],painted:[...document.querySelectorAll('canvas.walking-raster')].some(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)),status:document.querySelector('#status').textContent}));
   const pixelHash=await page.evaluate(async()=>{const c=document.querySelector('canvas.walking-raster'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(v=>v.toString(16).padStart(2,'0')).join('')});
   assert.ok(result.painted);assert.match(result.status,/Ungefärliga/);const summary={phase,pixelHash,wallMs:result.end-start,requests:requests-before.requests,bytes:bytes-before.bytes,...summarize(result.events,start,result.end)};
   if(test.cpu){await pendingWorker;const {profile}=await cpuWorker.send('Profiler.stop');summary.workerCPU=cpuSummary(profile);await writeFile(`${out}/${test.name}-${phase}-worker.cpuprofile`,JSON.stringify(profile));const {profile:main}=await mainCDP.send('Profiler.stop');summary.mainCPU=cpuSummary(main);await writeFile(`${out}/${test.name}-${phase}-main.cpuprofile`,JSON.stringify(main));if(phase!=='decoded-cutoff')await cpuWorker.send('Profiler.start')}
   await writeFile(`${out}/${test.name}-${phase}-events.json`,JSON.stringify(result.events));record.phases.push(summary);console.log(test.name,phase,Math.round(summary.wallMs),'ms',summary.requests,'requests');
  }
  assert.deepEqual(errors,[]);record.errors=errors;report.cases.push(record);await writeFile(`${out}/results-${selected}.json`,JSON.stringify(report,null,2));await context.close();
 }
}finally{await browser.close()}
