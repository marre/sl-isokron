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
test('single click chooses an origin, double click zooms without selecting, and Enter chooses map center',async({page},info)=>{
 await page.addInitScript(()=>{let leaflet:any;Object.defineProperty(window,'L',{get(){return leaflet;},set(value){leaflet=value;const create=value.map;value.map=(...args:any[])=>{const map=create(...args);(window as any).testMap=map;return map;};}});});
 await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 await expect(page.locator('#choose-point, #point-picker')).toHaveCount(0);
 if(info.project.name==='mobile')await page.locator('#mobile-close-search').click();
 await page.evaluate(()=>{(window as any).testMap.setView([59.3319,18.0592],17,{animate:false});});
 const position=()=>page.evaluate(()=>{const box=document.querySelector('#map')!.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};});
 let p=await position();const zoom=await page.evaluate(()=>(window as any).testMap.getZoom());
 await page.mouse.dblclick(p.x,p.y,{delay:100});
 await expect.poll(()=>page.evaluate(()=>(window as any).testMap.getZoom())).toBeGreaterThan(zoom);
 await page.waitForTimeout(550);await expect(page.locator('#stop-search')).toHaveValue('');await expect(page.locator('#calculate')).toBeDisabled();
 p=await position();await page.mouse.click(p.x,p.y);
 await expect(page.locator('#calculate')).toBeEnabled();await expect(page.locator('#stop-search')).toHaveValue('Vald kartpunkt');
 await expect(page.locator('#legend')).toBeHidden();
 if(info.project.name==='mobile')await page.locator('#mobile-close-search').click();
 const before=await page.locator('#start-data-gap').textContent();p=await position();await page.mouse.dblclick(p.x+45,p.y,{delay:100});await page.waitForTimeout(600);
 await expect(page.locator('#start-data-gap')).toHaveText(before!);
 await page.locator('#map').focus();await page.keyboard.press('Enter');await expect(page.locator('#stop-search')).toHaveValue('Vald kartpunkt');
});
test('unmapped origins show a useful error and never fall back to straight-line access',async({page})=>{
 await page.goto('/#s='+encodeURIComponent(JSON.stringify({...point,lat:59.34})));
 await expect(page.locator('#form-error')).toContainText('Ingen kartlagd gångväg');await expect(page.locator('#legend')).toBeHidden();
});
