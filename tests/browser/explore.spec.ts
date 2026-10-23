import {test,expect} from '@playwright/test';
import {stockholmNow} from '../../src/core/time';

test('compact results always include walking areas and reset retains search settings',async({page})=>{
 let searches=0;
 page.on('worker',worker=>{if(/\/worker\.ts(?:\?|$)/.test(worker.url()))searches++;});
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 // Old shared cutoff is accepted, but no longer silently hides reachable results.
 const s={v:1,stop:'demo-2',name:'T-Centralen',lat:59.331,lon:18.0592,date:stockholmNow().date,time:'08:00',maxMinutes:120,displayMinutes:1,walkMinutes:15,maxTransfers:3,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
 await page.goto('/#s='+encodeURIComponent(JSON.stringify(s)));
 await expect(page.locator('#map')).toHaveAttribute('data-search-state','complete');
 await expect(page.locator('#legend, #display-time, #walking-toggle, #platform, #choose-point, #fit-result')).toHaveCount(0);
 await expect(page.locator('.leaflet-walking-areas-pane canvas[data-cutoff="120"]')).toBeVisible({timeout:20000});
 const shown=()=>page.locator('#map path[role=button]').evaluateAll(items=>items.filter(e=>getComputedStyle(e).display!=='none').length);
 expect(await shown()).toBeGreaterThan(5);expect(searches).toBe(1);
 await page.locator('#share').click();
 expect(JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(3))).displayMinutes).toBeUndefined();
 if(await page.locator('#mobile-toggle').isVisible())await page.locator('#mobile-toggle').click();
 await expect(page.locator('.search-actions #reset-search')).toBeEnabled();
 await page.locator('#reset-search').click();
 await expect(page.locator('#map')).toHaveAttribute('data-search-state','idle');
 await expect(page.locator('#stop-search')).toHaveValue('');
 await expect(page.locator('#calculate')).toBeDisabled();await expect(page.locator('#reset-search')).toBeDisabled();
 await expect(page.locator('#max-time')).toHaveValue('120');await expect(page.locator('#time')).toHaveValue('08:00');
 await expect(page.locator('.leaflet-walking-areas-pane canvas')).toHaveCount(0);
 expect(new URL(page.url()).hash).toBe('');expect(searches).toBe(1);
 await page.screenshot({path:`test-results/${test.info().project.name}-compact-ui.png`});
});
