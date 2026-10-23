import {test,expect} from '@playwright/test';
import {stockholmNow} from '../../src/core/time';

test('legend and cutoff explore cached results without new transport searches or data downloads',async({page})=>{
 let searches=0;const downloads:string[]=[];
 page.on('worker',worker=>{if(/\/worker\.ts(?:\?|$)/.test(worker.url()))searches++;});
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/data/'))downloads.push(r.url());});
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 const s={v:1,stop:'demo-2',name:'T-Centralen',lat:59.331,lon:18.0592,date:stockholmNow().date,time:'08:00',maxMinutes:120,walkMinutes:15,maxTransfers:3,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
 await page.goto('/#s='+encodeURIComponent(JSON.stringify(s)));
 await expect(page.locator('#legend')).toBeVisible();
 await expect(page.locator('#walking-status')).toContainText('Ungefärliga',{timeout:20000});
 if(await page.locator('#legend-toggle').isVisible())await page.locator('#legend-toggle').click();
 const markers=page.locator('#map path[role=button]:visible');
 const count=await markers.count(),loaded=downloads.length,origin=page.getByRole('button',{name:'T-Centralen · Testläge A',exact:true});
 const color=await origin.getAttribute('fill');
 expect(searches).toBe(1);expect(count).toBeGreaterThan(5);
 await expect(page.locator('.bands button, #fit-result, #choose-point')).toHaveCount(0);
 await expect(page.locator('#legend .legend-top #reset-search')).toBeVisible();
 await page.locator('#display-time').fill('30');
 await expect(page.locator('#display-time')).toHaveValue('30');
 await expect(page.locator('#result-count')).toContainText('≤30 min');
 await page.locator('#show-all-results').click();
 await expect(markers).toHaveCount(count);
 await page.locator('#display-time').fill('30');
 await page.locator('#display-time').fill('1');
 await expect(markers).toHaveCount(1);
 await expect(page.locator('#display-output')).toHaveText('1 min');
 await expect(page.locator('.leaflet-walking-areas-pane canvas[data-cutoff="1"]')).toBeVisible();
 expect(await origin.getAttribute('fill')).toBe(color);
 await page.locator('#display-time').fill('23');
 await expect(page.locator('#display-output')).toHaveText('23 min');
 await expect(page.locator('.leaflet-walking-areas-pane canvas[data-cutoff="23"]')).toBeVisible();
 // Revisit a cutoff after the worker's bounded partial-contour cache evicts it.
 for(const minutes of [37,41,53,23]){
  await page.locator('#display-time').fill(String(minutes));
  await expect(page.locator(`.leaflet-walking-areas-pane canvas[data-cutoff="${minutes}"]`)).toBeVisible();
 }
 const painted=await page.locator('.leaflet-walking-areas-pane canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data.some((value,i)=>i%4===3&&value>0));
 expect(painted).toBe(true);
 await page.locator('#show-all-results').click();
 await expect(markers).toHaveCount(count);
 await expect(page.locator('#display-time')).toHaveValue('120');
 await expect(page.locator('#show-all-results')).toBeHidden();
 expect(searches).toBe(1);expect(downloads.length).toBe(loaded);
 await page.locator('#display-time').fill('23');
 await expect(page.locator('#display-output')).toHaveText('23 min');
 if(await page.locator('#legend-toggle').isVisible())await page.locator('#legend-toggle').click();
 await page.locator('#share').click();
 const shared=JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(3)));
 expect(shared.displayMinutes).toBe(23);expect(shared.maxMinutes).toBe(120);
 await page.goto(page.url());
 await expect(page.locator('#legend')).toBeVisible();
 await expect(page.locator('#display-time')).toHaveValue('23');
 await expect(page.locator('#max-time')).toHaveValue('120');
 await expect(page.locator('#result-count')).toContainText('≤23 min');
 await page.screenshot({path:`test-results/${test.info().project.name}-explore.png`});
});
