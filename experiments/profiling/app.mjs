/** Recheck the earlier complete-application city-transition measurement. */
import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {summarize} from './metrics.mjs';
const root=path.resolve(process.env.SLISO_DATA_ROOT??'.data-build/fixed-release/data'),fixture=JSON.parse(await readFile('.data-build/profiling/fixture.json','utf8'));
const domClick=process.env.SLISO_APP_DOMCLICK==='1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),results=[];
try{
 for(const intercept of (domClick||process.env.SLISO_APP_ONE==='1'?[false]:[false,true])){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];let requests=0,bytes=0;
  // Reproduce the recorded query date despite the app's no-past-dates guard.
  await page.addInitScript(target=>{
   const Native=Date,offset=Native.now()-Native.parse(target);
   // Shift only JS Date; keep performance.timeOrigin, timers and RAF native.
   window.Date=class extends Native{
    constructor(...args){if(args.length)super(...args);else super(Native.now()-offset)}
    static now(){return Native.now()-offset}
   };
  },fixture.settings.date+'T06:00:00Z');
  page.on('pageerror',e=>{errors.push(e.message);console.log('Page error',e.message)});
  await page.addInitScript(()=>{let leaflet;Object.defineProperty(window,'L',{configurable:true,get(){return leaflet},set(v){leaflet=v;const create=v.map;v.map=(...args)=>{const map=create(...args);window.slisoMap=map;return map}}})});
  await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
  if(intercept)await page.route('**/data/**',async route=>{const name=new URL(route.request().url()).pathname;assert.match(name,/^\/data\/[a-zA-Z0-9._/-]+$/);const body=await readFile(root+name.slice(5));requests++;bytes+=body.length;await route.fulfill({body,contentType:name.endsWith('.json')?'application/json':'application/octet-stream'})});
  else page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/data/')){requests++;bytes+=Number(r.headers()['content-length']??0)}});
  await page.goto('http://127.0.0.1:5193/?profile=1#s='+encodeURIComponent(JSON.stringify(fixture.settings)));
  console.log('Navigated',intercept);
  await page.locator('#legend').waitFor({state:'visible',timeout:30000}).catch(async e=>{console.log('Failed route state',await page.locator('body').innerText());throw e});
  console.log('Route complete',intercept);
  const routing=await page.locator('#status').textContent(),before={requests,bytes};
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const metricStart=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const start=await page.evaluate(()=>{window.__slisoProfile.clear();return performance.timeOrigin+performance.now()});
  const panSyncMs=await page.evaluate(()=>{const start=performance.now();window.slisoMap.setView([59.335,18.06],13,{animate:false});return performance.now()-start});
  const tapStart=performance.now();
  if(domClick)await page.evaluate(()=>document.querySelector('#legend-toggle').click());else await page.locator('#legend-toggle').tap();
  const tapWallMs=performance.now()-tapStart;console.log('Pan / legend input ms',panSyncMs,tapWallMs);
  console.log('City transition requested',intercept);
  const diagnostic=setInterval(()=>{void page.evaluate(()=>({walking:document.querySelector('#walking-status')?.textContent,main:document.querySelector('#status')?.textContent,events:window.__slisoProfile?.snapshot().length})).then(s=>console.log('Pending',JSON.stringify(s))).catch(()=>{})},10000);
  await page.waitForFunction(()=>document.querySelector('#walking-status')?.textContent.includes('Ungefärliga'),null,{timeout:60000}).finally(()=>clearInterval(diagnostic));
  const data=await page.evaluate(()=>({end:performance.timeOrigin+performance.now(),events:window.__slisoProfile.snapshot(),status:document.querySelector('#walking-status').textContent}));
  const metricEnd=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const browserMetrics=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','DevToolsCommandDuration','TaskOtherDuration','LayoutCount','RecalcStyleCount'].map(name=>[name,metricEnd[name]-metricStart[name]]));
  const record={intercept,domClick,panSyncMs,tapWallMs,routing,browserMetrics,wallMs:data.end-start,requests:requests-before.requests,bytes:bytes-before.bytes,...summarize(data.events,start,data.end),errors};assert.deepEqual(errors,[]);results.push(record);
  await writeFile(`.data-build/profiling/results-app${domClick?'-domclick':process.env.SLISO_APP_ONE==='1'?'-input':''}.json`,JSON.stringify({dataset:fixture.dataset,note:'Current complete production bundle, mobile viewport, local verified HTTP data. Single run per delivery method, no CPU sampling. Date-only epoch shift reproduces query-date validation; performance clocks, timers and RAF remain native. Background requests can start before the measured city transition.',cases:results},null,2));
  await writeFile(`.data-build/profiling/app-${domClick?'domclick':intercept?'intercept':'direct'}-events.json`,JSON.stringify(data.events));console.log(intercept?'intercept':'direct',Math.round(record.wallMs),'ms',record.requests,'requests',record.stages['render.total'],browserMetrics);await context.close();
 }
}finally{await browser.close()}
