import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const dir='.data-build/delivery-lab',manifests=JSON.parse(await readFile(dir+'/manifests.json','utf8')),fixture=JSON.parse(await readFile(dir+'/fixture.json','utf8'));
const mode=process.argv[2]??'city';
if(mode==='admission'){manifests.baselineNoFrame={...manifests.baseline,noFrame:true};manifests.fullNoFrame={...manifests.full256,noFrame:true};}
if(mode==='lindholmen'){let raw;try{raw=await readFile(dir+'/vallentuna.json','utf8')}catch{raw=await readFile('.data-build/routing-lab/reference-9022001007361002.json','utf8')}fixture.result=JSON.parse(raw);const stop=fixture.stops.find(s=>s.id==='9022001007361002');fixture.settings={...fixture.settings,stop:stop.id,name:stop.name,lat:stop.lat,lon:stop.lon};}
const city=mode==='city'||mode==='wide'||mode==='repeat'||mode==='admission';
const center=city?[59.335,18.06]:mode==='lindholmen'?[59.584158,18.109237]:[59.648944,17.930153];
const pan=city?[59.335,18.075]:mode==='lindholmen'?[59.584158,18.115]:[59.649,17.938];
const tests=mode==='admission'?[
 {name:'baseline-no-frame',manifest:'baselineNoFrame',latency:0},{name:'full256-no-frame',manifest:'fullNoFrame',latency:0},{name:'full256-no-frame-40ms',manifest:'fullNoFrame',latency:40}
]:mode==='wide'?[
 {name:'layeredWide',manifest:'full256',preview:'previewWide',latency:0},{name:'layeredWide-40ms',manifest:'full256',preview:'previewWide',latency:40}
]:mode==='repeat'?[
 {name:'full256-repeat',manifest:'full256',latency:0},{name:'baseline-repeat',manifest:'baseline',latency:0}
]:mode==='city'?[
 {name:'baseline',manifest:'baseline',latency:0},{name:'full128',manifest:'full128',latency:0},{name:'full256',manifest:'full256',latency:0},{name:'full512',manifest:'full512',latency:0},
 {name:'full256-200ms',manifest:'full256',interval:200,latency:0},{name:'layered256',manifest:'full256',preview:'preview256',latency:0},
 {name:'baseline-40ms',manifest:'baseline',latency:40},{name:'full256-40ms',manifest:'full256',latency:40},{name:'layered256-40ms',manifest:'full256',preview:'preview256',latency:40}
]:[{name:mode+'-baseline',manifest:'baseline',latency:0},{name:mode+'-full128',manifest:'full128',latency:0},{name:mode+'-full256',manifest:'full256',latency:0},{name:mode+'-layeredWide',manifest:'full256',preview:'previewWide',latency:0}];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const report={dataset:manifests.baseline.version,measuredAt:new Date().toISOString(),runtime:browser.version(),notes:['Actual production WalkingView, bands worker and codec; recorded exact routing result, routing excluded.','Full-region spatial bundles; whole native archives included, so offscreen/unreached profiles are real overfetch.','HTTP/1.1 local keep-alive; added 40ms is fixed response latency, not cellular bandwidth or CDN HTTP/2.','Fresh browser context for each case; cold and CacheStorage-warm use fresh walking workers.','Experimental wrapper quantizes preview allowances to native five-minute knots and swaps to a separate exact raster at completion.','Two-layer data and canvases coexist during refinement; preview does not change any station time.'],cases:[]};
const references=new Map();
if(mode==='wide'||mode==='repeat'||mode==='admission'){const prior=JSON.parse(await readFile(`${dir}/results-city.json`,'utf8'));for(const row of prior.cases[0].phases)references.set(row.phase==='cache-warm'?'cold':row.phase,row.pixelHash);}
try{for(const test of tests){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'x-profile-latency':String(test.latency)}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0,bytes=0;
 page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/data/')){requests++;bytes+=Number(r.headers()['content-length']??0);}});
 await page.goto('http://127.0.0.1:5197/experiments/delivery-lab/index.html');await page.waitForFunction(()=>window.bench);
 await page.evaluate(input=>window.bench.setup(input),{...fixture,center,zoom:city?13:14});
 const row={...test,phases:[]};
 for(const phase of ['cold','cache-warm','cutoff91','pan']){
  const before={requests,bytes};const result=await page.evaluate(async({phase,manifest,preview,interval,center})=>Promise.race([phase==='cutoff91'?window.bench.cutoff(91):phase==='pan'?window.bench.pan(center):preview?window.bench.layered(preview,manifest,interval):window.bench.run(manifest,interval),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Overlay timeout')),180000))]),{phase,manifest:manifests[test.manifest],preview:test.preview?manifests[test.preview]:undefined,interval:test.interval??0,center:pan});
  const hashKey=phase==='cache-warm'?'cold':phase;
  if(!references.has(hashKey))references.set(hashKey,result.pixelHash);else assert.equal(result.pixelHash,references.get(hashKey),`${test.name} ${phase} final pixels`);
  assert.match(result.status,/Ungefärliga/);assert.deepEqual(errors,[]);
  const renders=result.events.filter(e=>e.name==='render.total').length;
  const measured={phase,requests:requests-before.requests,bytes:bytes-before.bytes,...result,renders};delete measured.events;
  if(phase==='cache-warm'||phase==='cutoff91')assert.equal(measured.requests,0);
  row.phases.push(measured);console.log(test.name,phase,Math.round(result.ms),'ms',measured.requests,'requests',measured.bytes,'bytes',result.previewMs?Math.round(result.previewMs)+'ms preview':'');
  await writeFile(`${dir}/${test.name}-${phase}-events.json`,JSON.stringify(result.events));
  if(phase==='cold'&&test.preview){const pictures=await page.evaluate(()=>({preview:window.bench.previewImage(),detail:window.bench.image()}));for(const [name,url] of Object.entries(pictures))await writeFile(`${dir}/${test.name}-${name}.png`,Buffer.from(url.split(',')[1],'base64'));}
 }
 report.cases.push(row);await writeFile(`${dir}/results-${mode}.json`,JSON.stringify(report,null,2));await context.close();
}}finally{await browser.close();}
