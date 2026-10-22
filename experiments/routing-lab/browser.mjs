import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const root=process.env.SLISO_LAB_DATA_ROOT??'.data-build/diagnosis/data',manifest=JSON.parse(await readFile(root+'/manifest.json','utf8')),settings=JSON.parse(await readFile('.data-build/walking-lab/arlanda.json','utf8')).settings,browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),results=[];
try{
 for(const engine of ['reference','route','heap']){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await page.route('**/data/**',async route=>{const name=new URL(route.request().url()).pathname;if(!/^\/data\/[a-zA-Z0-9._/-]+$/.test(name)||name.includes('..'))return route.abort();await route.fulfill({body:await readFile(root+name.replace(/^\/data\//,'/')),contentType:name.endsWith('.json')?'application/json':'application/octet-stream'})});
  await page.goto('http://127.0.0.1:5180/experiments/routing-lab/bench.html');await page.waitForFunction(()=>window.ready);
  const result=await page.evaluate(({m,s,engine})=>window.run(m,s,engine),{m:manifest,s:settings,engine});results.push(result);console.log(result);await page.close();
 }
 assert.ok(results.every(r=>r.digest===results[0].digest),'Browser objectives or walking frontiers differ');await writeFile('.data-build/routing-lab/browser.json',JSON.stringify({note:'Dedicated browser workers; desktop Chromium mobile viewport; actual verified dataset, local HTTP mirror. One timed route search each, loading excluded.',settings,results},null,2));
}finally{await browser.close()}
