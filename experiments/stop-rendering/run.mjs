import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const results=[];
try{for(const mobile of [true,false]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5199/experiments/stop-rendering/'+(process.argv.includes('--baseline')?'?baseline=1':''));await page.waitForFunction(()=>window.stopBench,undefined,{timeout:60000});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const phases=[];
 for(const phase of ['overview','pan','hover','results','pan','hover']){
  const before=await metrics(),result=await page.evaluate(phase=>window.stopBench.run(phase),phase),after=await metrics();
  phases.push({phase,...result,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000});
 }
 results.push({mobile,dataset:await page.evaluate(()=>window.stopBench.dataset),count:await page.evaluate(()=>window.stopBench.count),phases,errors});console.log(JSON.stringify(results.at(-1)));await page.close();
}}finally{await browser.close();}
await fs.writeFile(process.argv[2]??'.data-build/stop-rendering.json',JSON.stringify({note:'Real SL stops; isolated renderer, blank basemap, software WebGL. Pan wall time includes a 500 ms animation. Viewport emulation, not physical phone hardware.',results},null,2)+'\n');
