/** Production bundle smoke test against a local, verified compiled release. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.SLISO_DATA_ROOT??'.data-build/fixed-release/data');
const m=JSON.parse(await readFile(root+'/manifest.json','utf8'));
assert.equal(m.walkingAreas.format,'sliso-contours-v1');
const settings={v:1,stop:'9022001057310001',name:'Arlanda terminal 4',lat:59.647775,lon:17.928574,date:'2026-10-22',time:'08:07',maxMinutes:120,walkMinutes:30,maxTransfers:4,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];let downloads=0,bytes=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let leaflet;Object.defineProperty(window,'L',{configurable:true,get(){return leaflet},set(v){leaflet=v;const create=v.map;v.map=(...args)=>{const map=create(...args);window.slisoMap=map;return map}}})});
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/data/**',async route=>{
  const name=new URL(route.request().url()).pathname;
  if(!/^\/data\/[a-zA-Z0-9._/-]+$/.test(name)||name.includes('..'))return route.abort();
  const body=await readFile(root+name.replace(/^\/data\//,'/'));downloads++;bytes+=body.length;
  await route.fulfill({body,contentType:name.endsWith('.json')?'application/json':'application/octet-stream'});
 });
 await page.goto((process.env.SLISO_PREVIEW_URL??'http://127.0.0.1:4173')+'/#s='+encodeURIComponent(JSON.stringify(settings)));
 await page.locator('#legend').waitFor({state:'visible',timeout:120000});
 const routing=await page.locator('#status').textContent();assert.match(routing,/Färdigt/);
 const start=Date.now();
 await page.evaluate(()=>window.slisoMap.setView([59.335,18.06],13,{animate:false}));
 await page.locator('#legend-toggle').tap();
 await page.waitForFunction(()=>document.querySelector('#walking-status')?.textContent.includes('Ungefärliga'),null,{timeout:120000});
 const readyMs=Date.now()-start;
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');const heap=(await cdp.send('Runtime.getHeapUsage')).usedSize;await cdp.detach();
 const loaded=downloads,cutoffStart=Date.now();await page.locator('#display-time').fill('91');
 await page.locator('.leaflet-walking-areas-pane canvas[data-cutoff="91"]').waitFor({state:'visible',timeout:30000});
 const cutoffMs=Date.now()-cutoffStart,extraCutoffDownloads=downloads-loaded;assert.equal(downloads,loaded,'Cutoff should reuse decoded data');
 const cityPainted=await page.locator('.leaflet-walking-areas-pane canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0));assert.ok(cityPainted);
 await mkdir('.data-build/production',{recursive:true});await page.locator('#legend-toggle').tap();await page.screenshot({path:'.data-build/production/city.png'});
 await page.locator('#legend-toggle').tap();await page.locator('#show-all-results').tap();
 await page.evaluate(()=>window.slisoMap.setView([59.648944,17.930153],14,{animate:false}));
 await page.waitForFunction(()=>document.querySelector('#walking-status')?.textContent.includes('Ungefärliga'),null,{timeout:120000});
 const airportPainted=await page.evaluate(()=>{const map=window.slisoMap,q=map.latLngToContainerPoint([59.648944,17.930153]),r=map.getContainer().getBoundingClientRect();return [...document.querySelectorAll('.leaflet-walking-areas-pane canvas')].some(c=>{const a=c.getBoundingClientRect(),x=Math.floor((r.left+q.x-a.left)*c.width/a.width),y=Math.floor((r.top+q.y-a.top)*c.height/a.height);return x>=0&&y>=0&&x<c.width&&y<c.height&&c.getContext('2d').getImageData(x,y,1,1).data[3]>0})});assert.ok(airportPainted,'Airport walking access remains painted');
 await page.locator('#legend-toggle').tap();await page.screenshot({path:'.data-build/production/airport.png'});assert.deepEqual(errors,[]);
 const report={dataset:m.version,note:'Desktop Chromium with mobile viewport, local verified real data, one unthrottled run. UI heap excludes worker heaps.',routing,cityReadyMs:readyMs,mainHeapBytes:heap,partialCutoffMs:cutoffMs,extraCutoffDownloads,downloads,bytes,cityPainted,airportPainted,errors};
 await writeFile('.data-build/production/browser.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close()}
