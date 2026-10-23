import {chromium} from 'playwright';import {readFile,writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';import os from 'node:os';
import {createHash} from 'node:crypto';
const dir='.data-build/walking-state',fixture=JSON.parse(await readFile(dir+'/network.json','utf8'));
const numeric=process.argv[2]==='numeric';
const objectives=r=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival,boardings:v.boardings,requestStop:v.requestStop,kind:v.kind}:null);
const sources=r=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const report={dataset:fixture.dataset,routerSHA256:createHash('sha256').update(await readFile('src/core/router.ts')).digest('hex'),measuredAt:new Date().toISOString(),runtime:browser.version(),cpu:os.cpus()[0].model,notes:['Desktop Chromium worker, fresh worker per trial; no CPU sampler.','Local fixture load excluded; algorithm elapsed includes indexing, route scanning, walking propagation and journey serialization.','Alternating variant order; two trials per variant per origin. No production changes.'],cases:[]};
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5194/experiments/walking-state/index.html');await page.waitForFunction(()=>window.run);
 for(const origin of [0,1,2]){
  let reference;
  for(const trial of [0,1])for(const variant of numeric?(trial===0?['baseline','numeric','guarded']:['guarded','numeric','baseline']):(trial===0?['baseline','cached','compact','lazy']:['lazy','compact','cached','baseline'])){
   console.log('Start',fixture.settings[origin].name,variant,trial);
   const {result,name}=await page.evaluate(async({variant,origin})=>{const r=await window.run(variant,origin);return {result:r.result,name:r.origin}},{variant,origin});
   if(!reference)reference=result;
   assert.deepEqual(objectives(result),objectives(reference),`${name} ${variant} objectives`);assert.deepEqual(sources(result),sources(reference),`${name} ${variant} walk frontier`);assert.deepEqual(result.journeys,reference.journeys,`${name} ${variant} witnesses`);assert.equal(result.labels,reference.labels);
   const row={origin:name,variant,trial,ms:result.elapsed,labels:result.labels,reachable:result.values.filter(Boolean).length,walkingSources:result.walkSources.length,allObjectivesWalkingFrontiersAndJourneysIdentical:true};report.cases.push(row);console.log(JSON.stringify(row));
   await writeFile(dir+(numeric?'/numeric-results.json':'/browser-results.json'),JSON.stringify(report,null,2));
  }
 }
}finally{await browser.close()}
