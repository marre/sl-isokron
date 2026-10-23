import {test,expect} from '@playwright/test';
import {stockholmNow} from '../../src/core/time';
const point={v:1,origin:'point',stop:'@point',name:'Vald kartpunkt',lat:59.331,lon:18.058,date:stockholmNow().date,time:'08:00',maxMinutes:60,walkMinutes:15,maxTransfers:3,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
test.beforeEach(async({page})=>{await page.route('https://tile.openstreetmap.org/**',r=>r.abort());});
test('mapped origin restores, draws access geometry, shares and resets on desktop and mobile',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#s='+encodeURIComponent(JSON.stringify(point)));
 await expect(page.locator('#legend')).toBeVisible();await expect(page.locator('#status')).toContainText('Färdigt.');
 await expect(page.locator('#start-data-gap')).toContainText('Gångstart på kartlagd väg');
 const target=page.getByRole('button',{name:'T-Centralen · Testläge A',exact:true});await target.press('Enter');
 await expect(page.locator('#journey-panel')).toContainText('Vald kartpunkt');await expect(page.locator('.journey-walk')).toBeAttached();
 await page.getByRole('button',{name:'Stäng resedetaljer'}).click();await page.locator('#share').click();
 const shared=JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(3)));expect(shared.origin).toBe('point');expect(shared.lon).toBe(point.lon);
 await page.locator('#reset-search').click();await expect(page.locator('#stop-search')).toHaveValue('');await expect(page.locator('#calculate')).toBeDisabled();expect(errors).toEqual([]);
});
test('map picker supports cancel, keyboard center choice and an unobscured mobile map',async({page})=>{
 await page.goto('/');await expect(page.locator('#choose-point')).toBeEnabled();
 await page.locator('#choose-point').click();await expect(page.locator('#point-picker')).toBeVisible();
 const map=await page.locator('#map').boundingBox();expect(map!.height).toBeGreaterThan(300);
 await page.locator('#pick-cancel').click();await expect(page.locator('#point-picker')).toBeHidden();await expect(page.locator('#calculate')).toBeDisabled();
 await page.locator('#choose-point').click();await page.locator('#pick-center').click();await expect(page.locator('#calculate')).toBeEnabled();await expect(page.locator('#stop-search')).toHaveValue('Vald kartpunkt');
 await page.locator('#choose-point').click();await page.keyboard.press('Escape');await expect(page.locator('#point-picker')).toBeHidden();await expect(page.locator('#calculate')).toBeEnabled();
});
test('unmapped origins show a useful error and never fall back to straight-line access',async({page})=>{
 await page.goto('/#s='+encodeURIComponent(JSON.stringify({...point,lat:59.34})));
 await expect(page.locator('#form-error')).toContainText('Ingen kartlagd gångväg');await expect(page.locator('#legend')).toBeHidden();
});
