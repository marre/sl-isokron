import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const dir='.data-build/walking-state',raw=await readFile(dir+'/network.json'),fixture=JSON.parse(raw),fixtureSHA256=createHash('sha256').update(raw).digest('hex'),metadata=JSON.parse(await readFile(dir+'/closure-metadata.json','utf8'));assert.equal(metadata.fixtureSHA256,fixtureSHA256);
const objectives=r=>r.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival,boardings:v.boardings}:null);
const sources=r=>[...r.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked);
const walksByFrom=fixture.network.stops.map(()=>[]),connectionsByFrom=fixture.network.stops.map(()=>[]),connectionsByTo=fixture.network.stops.map(()=>[]);
for(const w of fixture.network.walks)walksByFrom[w.from].push(w);for(const c of fixture.network.connections){connectionsByFrom[c.from].push(c);connectionsByTo[c.to].push(c);}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const report={dataset:fixture.dataset,measuredAt:new Date().toISOString(),runtime:browser.version(),metadata,notes:['Fresh Chromium worker per run, reversed variant order on second trial; no CPU sampling.','Fixture load excluded; table fetch/decompression/checksum/validation separately reported.','Production bookkeeping engine compared with research-only full walking closure; no closure data is published to the app.','Equal-objective witness paths can differ; all returned itinerary edges and predecessor timing are validated.'],cases:[]};
function validateJourneys(r){
 for(let i=0;i<r.journeys.length;i++){
  const node=r.journeys[i];assert.ok(node.previous===null||node.previous<i);if(node.previous!==null){const parent=r.journeys[node.previous];assert.equal(parent.to,node.from);assert.ok(parent.arrival<=node.departure);}
  if(node.kind==='walk'){assert.ok(walksByFrom[node.from].some(w=>w.to===node.to&&w.seconds===node.arrival-node.departure&&w.metres===node.metres&&(w.source.startsWith('Assumed ')||undefined)===node.estimated));}
  else{assert.ok(connectionsByFrom[node.from].some(c=>c.departure===node.departure&&c.route===node.route&&c.pickup));assert.ok(connectionsByTo[node.to].some(c=>c.arrival===node.arrival&&c.route===node.route&&c.dropoff));}
 }
 for(let stop=0;stop<r.values.length;stop++){const v=r.values[stop];if(v?.journey!==null&&v?.journey!==undefined){assert.equal(r.journeys[v.journey].to,stop);assert.equal(r.journeys[v.journey].arrival,v.arrival);}}
}
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5194/experiments/walking-state/index.html');await page.waitForFunction(()=>window.run);
 for(const origin of [0,1,2]){
  let reference;
  for(const trial of [0,1])for(const variant of trial===0?['baseline','production','closure']:['closure','production','baseline']){
   console.log('Start',fixture.settings[origin].name,variant,trial);
   const {result,origin:name,tableLoadMs}=await page.evaluate(({variant,origin,fixtureSHA256})=>window.run(variant,origin,fixtureSHA256),{variant,origin,fixtureSHA256});
   if(!reference)reference=result;
   assert.deepEqual(objectives(result),objectives(reference),`${name} ${variant} stop objectives`);assert.deepEqual(sources(result),sources(reference),`${name} ${variant} walking frontiers`);
   if(variant==='production'){assert.deepEqual(result.journeys,reference.journeys);assert.deepEqual(result.values,reference.values);assert.equal(result.labels,reference.labels);}
   validateJourneys(result);
   const row={origin:name,variant,trial,ms:result.elapsed,tableLoadMs,totalSearchAndTableMs:result.elapsed+tableLoadMs,labels:result.labels,reachable:result.values.filter(Boolean).length,allObjectivesAndWalkingFrontiersEqual:true,allJourneyEdgesValidated:true};report.cases.push(row);console.log(JSON.stringify(row));await writeFile(dir+'/closure-benchmark.json',JSON.stringify(report,null,2));
  }
 }
}finally{await browser.close()}
