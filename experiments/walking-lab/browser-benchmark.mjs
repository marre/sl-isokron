import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
const results=JSON.parse(await readFile('.data-build/walking-lab/results.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 results.browser={engine:'Chromium desktop CPU, mobile viewport 390×844; no CPU/network throttling',memory:'Isolated decoded representation after GC: JS heap plus ArrayBuffer backing storage, excluding browser/native/GPU memory. This is not production tab peak memory.',cases:[]};
 for(const c of results.cases){
  const record={id:c.id,variants:[]};
  for(const kind of ['native','packed','fixed','grid-10','grid-20','grid-40','earliest-20']){
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),cdp=await page.context().newCDPSession(page);
   await page.goto('http://127.0.0.1:5180/experiments/walking-lab/bench.html');await page.waitForFunction(()=>window.ready);
   await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Runtime.getHeapUsage');
   const measures=await page.evaluate(async({id,kind})=>window.run(id,kind),{id:c.id,kind});
   await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Runtime.getHeapUsage');
   record.variants.push({id:kind,...measures,retainedHeapBytes:after.usedSize-before.usedSize,retainedArrayBufferBytes:(after.backingStorageSize??0)-(before.backingStorageSize??0)});
   console.log(c.id,kind,JSON.stringify(record.variants.at(-1)));await page.close();
  }
  if(record.variants[0].fieldHash!==record.variants[1].fieldHash||record.variants[0].fieldHash!==record.variants[2].fieldHash)throw new Error('Packed browser output mismatch');
  results.browser.cases.push(record);await writeFile('.data-build/walking-lab/results.json',JSON.stringify(results,null,2));
 }
}finally{await browser.close()}
