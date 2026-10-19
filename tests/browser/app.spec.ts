import { test, expect } from '@playwright/test';
import { stockholmNow } from '../../src/core/time';
async function init(page: import('@playwright/test').Page) {
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.goto('/');
 await expect(page.locator('#stop-search')).toBeEnabled();
 await page.locator('#time').fill('08:00');
}
async function select(page: import('@playwright/test').Page, name='T-Centralen') {
 await page.locator('#stop-search').fill(name);
 await page.locator('#stop-search').press('ArrowDown');
 await page.locator('#stop-search').press('Enter');
 await expect(page.locator('#calculate')).toBeEnabled();
}
test('local stop search, worker result, filters, share and marker detail',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await init(page);await select(page);
 await page.locator('#calculate').click();
 await expect(page.locator('#legend')).toBeVisible({timeout:20000});
 await expect(page.locator('#status')).toContainText('Färdigt.');
 await expect(page.locator('#legend')).toContainText('Utan initial väntan');
 await page.screenshot({path:`test-results/${test.info().project.name}-result.png`,fullPage:true});
 // A result click is a stop value, and its explicit action changes the origin.
 const marker=page.getByRole('button',{name:'Universitetet · Testläge A',exact:true});
 await marker.press('Enter');
 await expect(page.locator('#journey-panel')).toContainText('Avgång');
 await expect(page.locator('#journey-panel')).toContainText('Ankomst');
 await expect(page.locator('.journey-line').first()).toBeAttached();
 await page.getByRole('button',{name:'Stäng resedetaljer'}).click();
 // Restore mobile panel to modify filters.
 if(await page.locator('#mobile-toggle').isVisible())await page.locator('#mobile-toggle').click();
 await page.locator('#options').evaluate((d:HTMLDetailsElement)=>d.open=true);
 for(const c of await page.locator('[name=mode]').all())await c.uncheck();
 await expect(page.locator('#legend')).toBeHidden();
 await page.locator('#calculate').click();
 await expect(page.locator('#legend')).toBeVisible();
 await expect(page.locator('#legend')).toContainText('Endast gång');
 await page.locator('#share').click();
 await expect(page).toHaveURL(/#s=/);
 const shared=page.url();
 await page.goto(shared);await expect(page.locator('#legend')).toBeVisible();
 expect(errors).toEqual([]);
});
test('station hierarchy requires choosing a named platform',async({page})=>{
 await init(page);await page.locator('#stop-search').fill('Slussen');
 await page.locator('#stop-search').press('Enter');
 await expect(page.locator('#platform-field')).toBeVisible();
 await expect(page.locator('#calculate')).toBeDisabled();
 await page.locator('#platform').selectOption({label:'Testläge B'});
 await expect(page.locator('#calculate')).toBeEnabled();
});
test('A12/A14 cancellation and changed settings leave no finished result',async({page})=>{
 await init(page);await select(page);
 await page.route('**/*.bin',async r=>{await new Promise(resolve=>setTimeout(resolve,800));await r.continue();});
 await page.locator('#calculate').click();await page.locator('#cancel').click();
 await expect(page.locator('#status')).toContainText('Avbruten');
 await expect(page.locator('#legend')).toBeHidden();
 await page.locator('#time').fill('09:00');await page.locator('#time').blur();
 await page.waitForTimeout(1200);await expect(page.locator('#legend')).toBeHidden();
});
test('missing origin and out-of-coverage date are never silently replaced',async({page})=>{
 await init(page);await select(page);
 await page.locator('#share').click();
 const s=JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(3)));
 s.stop='removed-id';s.name='Försvunnen hållplats';
 await page.goto('/#s='+encodeURIComponent(JSON.stringify(s)));
 await expect(page.locator('#form-error')).toContainText('finns inte längre');
 await expect(page.locator('#calculate')).toBeDisabled();
 s.stop='demo-2';s.date='2020-01-01';
 await page.goto('/#s='+encodeURIComponent(JSON.stringify(s)));
 await expect(page.locator('#form-error')).toContainText('Välj ett nytt datum');
 await expect(page.locator('#date')).toHaveValue('2020-01-01');
 await expect(page.locator('#legend')).toBeHidden();
});
test('shared Stockholm times survive another browser timezone',async({browser})=>{
 const context=await browser.newContext({timezoneId:'America/New_York'});
 const page=await context.newPage();await init(page);await select(page);
 await page.locator('#share').click();
 const s=JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(3)));
 expect(s.time).toBe('08:00');expect(s.date).toBe(stockholmNow().date);
 await context.close();
});
test('missing timetable/quota failure leaves unknown rather than unreachable',async({page})=>{
 await init(page);await select(page);
 await page.route('**/*.bin',r=>r.fulfill({status:429,body:'quota'}));
 await page.locator('#calculate').click();
 await expect(page.locator('#form-error')).toContainText('Datakvoten');
 await expect(page.locator('#status')).toContainText('okänd');
 await expect(page.locator('#legend')).toBeHidden();
});
test('changed settings terminate old data loading before it can publish',async({page})=>{
 await init(page);await select(page);
 await page.route('**/*.bin',async r=>{await new Promise(resolve=>setTimeout(resolve,800));await r.continue();});
 await page.locator('#calculate').click();
 await page.locator('#stop-search').fill('Universitetet');await page.locator('#stop-search').press('Enter');
 await page.waitForTimeout(1000);
 await expect(page.locator('#legend')).toBeHidden();
 await expect(page.locator('#map-label')).toContainText('UNIVERSITETET');
});
test('driver-coordinated stops are routable and show a rider notice',async({page})=>{
 await init(page);await page.locator('#stop-search').fill('Slussen');await page.locator('#stop-search').press('Enter');
 await page.locator('#platform').selectOption({label:'Testläge B'});
 await page.locator('#options').evaluate((d:HTMLDetailsElement)=>d.open=true);
 for(const c of await page.locator('[name=mode]').all())if(await c.getAttribute('value')!=='bus')await c.uncheck();
 await page.locator('#calculate').click();await expect(page.locator('#legend')).toBeVisible();
 await expect(page.locator('#legend')).toContainText('Stopp på signal');
 await page.getByRole('button',{name:'Nacka strand · Testläge A',exact:true}).press('Enter');
 await expect(page.locator('#journey-panel')).toContainText('meddela föraren');
});

test('destination route previews on hover, pins on touch or click, and clears on origin change',async({page},info)=>{
 await init(page);await select(page);await page.locator('#calculate').click();
 await expect(page.locator('#legend')).toBeVisible();
 const colors=await page.locator('#legend .bands i').evaluateAll(items=>items.map(e=>(e as HTMLElement).style.backgroundColor));
 expect(colors[0]).toBe('rgb(217, 240, 163)');expect(colors.at(-1)).toBe('rgb(127, 0, 0)');
 const marker=page.getByRole('button',{name:'Universitetet · Testläge A',exact:true});
 if(info.project.name==='desktop'){
  await marker.hover({force:true});
  await expect(page.locator('#journey-panel')).toBeVisible();
  await expect(page.locator('#journey-panel')).toContainText('Tunnelbana');
  await expect(page.locator('.journey-line').first()).toBeAttached();
  await page.mouse.move(20,10);
  await expect(page.locator('#journey-panel')).toBeHidden();
  await marker.hover({force:true});
  await page.locator('#journey-pin').click();
 }else await marker.tap({force:true});
 await expect(page.locator('#journey-pin')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#journey-panel')).toContainText('Avgång');
 await expect(page.locator('#journey-panel')).toContainText('Ankomst');
 await expect(page.locator('#journey-panel')).toContainText('Schematisk resväg');
 await page.locator('#journey-fit').click();
 await expect(page.locator('#journey-panel')).toBeVisible();
 const routeBox=await page.locator('.journey-line').first().boundingBox(),mapBox=await page.locator('#map').boundingBox();
 expect(routeBox!.y).toBeGreaterThanOrEqual(mapBox!.y);expect(routeBox!.y+routeBox!.height).toBeLessThanOrEqual(mapBox!.y+mapBox!.height);
 await page.screenshot({path:`test-results/${info.project.name}-journey.png`,fullPage:true});
 await page.locator('#journey-start').click();
 await expect(page.locator('#map-label')).toContainText('UNIVERSITETET');
 await expect(page.locator('#journey-panel')).toBeHidden();
 await expect(page.locator('.journey-line')).toHaveCount(0);
 await expect(page.locator('#legend')).toBeHidden();
});
