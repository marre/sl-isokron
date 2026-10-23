import {test,expect} from '@playwright/test';
test('worker uses cached precomputed walking while legacy manifests remain compatible',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/?profile=1');await expect(page.locator('#stop-search')).toBeEnabled();
 const closure=await page.evaluate(async()=>{const m=await (await fetch('/data/manifest.json')).json();return m.walkingClosure;});expect(closure.format).toBe('sliso-walk-closure-v1');
 let downloads=0;page.on('request',r=>{if(new URL(r.url()).pathname===closure.url)downloads++;});
 async function calculate(){await page.locator('#time').fill('08:00');await page.locator('#stop-search').fill('T-Centralen');await page.locator('#stop-search').press('ArrowDown');await page.locator('#stop-search').press('Enter');await page.locator('#calculate').click();await expect(page.locator('#status')).toContainText('Färdigt.');}
 await calculate();expect(downloads).toBe(1);
 expect(await page.evaluate(()=>((window as any).__slisoProfile.snapshot() as any[]).some(e=>e.name==='routing.walkClosure'&&e.detail.precomputed))).toBe(true);
 expect(await page.evaluate(async(url)=>!!await(await caches.open('sliso-data-v1')).match(url),closure.url)).toBe(true);
 // Reload creates a new routing worker, and startup cache pruning must keep it.
 await page.goto('/?profile=1');await expect(page.locator('#stop-search')).toBeEnabled();await calculate();expect(downloads).toBe(1);
 // The same app also accepts a previous immutable manifest without a closure.
 await page.route('**/data/manifest.json',async r=>{const response=await r.fetch(),m=await response.json();delete m.walkingClosure;await r.fulfill({json:m});});
 await page.goto('/?profile=1');await expect(page.locator('#stop-search')).toBeEnabled();await calculate();expect(downloads).toBe(1);
 expect(await page.evaluate(()=>((window as any).__slisoProfile.snapshot() as any[]).filter(e=>e.name==='routing.walkClosure').every(e=>e.detail.precomputed===false))).toBe(true);
});
