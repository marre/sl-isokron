import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const checks=[];
await mkdir('docs/images',{recursive:true});
try{
 for(const viewport of [{width:1440,height:1150},{width:390,height:844},{width:320,height:700}]){
  const p=await browser.newPage({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700}),errors=[];let requests=0;p.on('pageerror',e=>errors.push(e.message));p.on('request',()=>requests++);
  // Load once, then disconnect: every interaction must work without a network.
  await p.goto('http://127.0.0.1:5191/');await p.locator('#app').waitFor({state:'visible',timeout:30000});
  const initial=requests;await p.context().setOffline(true);
  for(const area of ['city','airport','rural']){
   await p.locator('#case').selectOption(area);
   for(const algorithm of ['h3-12','square-12','h3-13','square-13','display-quad']){
    await p.locator('#algorithm').selectOption(algorithm);
    for(const cutoff of ['60','91','120']){await p.locator('#cutoff').selectOption(cutoff);if(algorithm==='display-quad')assert.equal(await p.locator('#accuracy').textContent(),'Pixel-identical')}
   }
  }
  await p.locator('#case').selectOption('city');await p.locator('#algorithm').selectOption('h3-12');await p.locator('#cutoff').selectOption('120');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflows horizontally');
  const options=await p.locator('#station option').count();assert.ok(options>1);await p.locator('#station').selectOption({index:1});assert.match(await p.locator('#message').textContent(),/same journey/);
  await p.locator('#station').selectOption('');await p.evaluate(()=>scrollTo(0,0));
  if(viewport.width===1440)await p.screenshot({path:'docs/images/algorithm-lab-desktop.png'});
  if(viewport.width===390)await p.screenshot({path:'docs/images/algorithm-lab-mobile.png',fullPage:true});
  await p.locator('#difference').click();assert.equal(await p.locator('#difference').getAttribute('aria-pressed'),'true');
  await p.locator('#case').selectOption('rural');await p.evaluate(()=>scrollTo(0,0));
  if(viewport.width===1440)await p.screenshot({path:'docs/images/algorithm-lab-differences.png'});
  await p.locator('#zoom').click();assert.equal(await p.locator('#zoom').getAttribute('aria-pressed'),'true');
  assert.equal(requests,initial,'Controls initiated extra requests');assert.deepEqual(errors,[]);checks.push({viewport,cases:3,algorithms:5,cutoffs:3,noHorizontalOverflow:true,noAdditionalRequests:true,noPageErrors:true});await p.close();
 }
 await writeFile('.data-build/algorithm-lab/mockup-smoke.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));
}finally{await browser.close()}
