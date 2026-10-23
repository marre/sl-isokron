/** Run after the pinned-data migration and production.config.ts build. */
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.data-build/delivery-lab/fixture.json','utf8'));
const manifest=JSON.parse(await readFile('public/data/manifest.json','utf8'));
const baseline=JSON.parse(await readFile('docs/delivery-layer-results.json','utf8')).reports.city.cases[0].phases;
const reference=phase=>baseline.find(p=>p.phase===phase).pixelHash;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const report={dataset:manifest.version,measuredAt:new Date().toISOString(),cases:[]};
try{
 for(const latency of [0,40]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'x-profile-latency':String(latency)}});
  const page=await context.newPage(),errors=[];let requests=0,bytes=0,overviewRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/data/')){requests++;bytes+=Number(r.headers()['content-length']??0);if(r.url().includes('areas-overview-'))overviewRequests++;}});
  await page.goto('http://127.0.0.1:5198/experiments/delivery-lab/production.html');
  await page.waitForFunction(()=>window.production);
  await page.evaluate(data=>window.production.setup(data),fixture);
  const phases=[];let returnedHash;
  for(const phase of ['cold','cache-warm','cutoff91','pan','overview','detail-return','detail-fresh']){
   const before={requests,bytes,overviewRequests};
   const result=await page.evaluate(({phase,manifest})=>Promise.race([
    phase==='detail-fresh'?window.production.fresh(manifest):phase==='overview'?window.production.zoom(11):phase==='detail-return'?window.production.zoom(13):phase==='pan'?window.production.pan():phase==='cutoff91'?window.production.cutoff(91):window.production.run(manifest),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Overlay timeout')),120000))
   ]),{phase,manifest});
   assert.deepEqual(errors,[]);assert.equal(result.layer,phase==='overview'?'overview':'detail');
   const row={phase,latency,...result,requests:requests-before.requests,bytes:bytes-before.bytes,overviewRequests:overviewRequests-before.overviewRequests};
   if(phase==='cold'||phase==='cache-warm')assert.equal(result.hash,reference('cold'));
   if(phase==='cutoff91')assert.equal(result.hash,reference('cutoff91'));
   if(phase==='pan')assert.equal(result.hash,reference('pan'));
   if(phase==='cache-warm'||phase==='cutoff91')assert.equal(row.requests,0);
   if(phase!=='overview')assert.equal(row.overviewRequests,0);
   if(phase==='overview'){assert.equal(row.requests,row.overviewRequests);assert.match(result.status,/Översiktliga/);}
   if(phase==='detail-return')returnedHash=result.hash;
   if(phase==='detail-fresh')assert.equal(result.hash,returnedHash);
   phases.push(row);console.log(phase,latency,Math.round(result.ms)+'ms',row.requests+' requests',row.bytes+' bytes');
  }
  report.cases.push({latency,phases});await context.close();
 }
 await writeFile('docs/contour-delivery-implementation-results.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();}
