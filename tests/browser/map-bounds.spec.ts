import {test,expect} from '@playwright/test';

test('navigation stays within the complete stop network through panning, zooming and resizing',async({page})=>{
 await page.addInitScript(()=>{
  document.addEventListener('sliso:map-ready',event=>{if((event.target as HTMLElement).id==='map')(window as any).boundedMap=(event as CustomEvent).detail;});
 });
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 const coverage=await page.evaluate(()=>{const m=(window as any).boundedMap,b=m.getMaxBounds();return {valid:!b.isEmpty(),min:m.getMinZoom()};});
 expect(coverage.valid).toBe(true);expect(coverage.min).toBeGreaterThan(0);
 for(const center of [[0,0],[-33.8,151.2],[80,-120]]){
  await page.evaluate(center=>{(window as any).boundedMap.panTo([center[1],center[0]],{duration:0});},center);
  await expect.poll(()=>page.evaluate(()=>{const m=(window as any).boundedMap;return m.getMaxBounds().contains(m.getCenter());})).toBe(true);
 }
 await page.evaluate(()=>{const m=(window as any).boundedMap;m.setZoom(0);});
 expect(await page.evaluate(()=>{const m=(window as any).boundedMap;return m.getZoom()>=m.getMinZoom();})).toBe(true);
 // Fit keeps both ends of the full synthetic network in view, including edge stops.
 await page.locator('#fit').click();
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).boundedMap;return [[59.6567,18.2675],[58.9030,17.9560],[59.5697,17.5318]].every(p=>m.getBounds().contains([p[1],p[0]]));})).toBe(true);
 await page.setViewportSize({width:844,height:390});
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).boundedMap;return m.getZoom()>=m.getMinZoom()&&m.getMaxBounds().contains(m.getCenter());})).toBe(true);
 await page.locator('#fit').click();
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).boundedMap;return [[59.6567,18.2675],[58.9030,17.9560],[59.5697,17.5318]].every(p=>m.getBounds().contains([p[1],p[0]]));})).toBe(true);
});
