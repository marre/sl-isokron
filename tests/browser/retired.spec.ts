import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {stockholmNow,addDays} from '../../src/core/time';

async function fixture(page:Page,scheduled?:number[]){
 const date=stockholmNow().date;
 const stops=[
  {id:'a',name:'Start',station:'Start',platform:'Läge A',lat:59.3,lon:18},
  {id:'old-bridge',name:'Start',station:'Start',platform:'Läge OLD',lat:59.3001,lon:18},
  {id:'b',name:'Mål',station:'Mål',platform:'Läge B',lat:59.3002,lon:18},
  {id:'old-only',name:'Utgången',station:'Utgången',platform:'Läge OLD1',lat:80,lon:90},
  {id:'real-name',name:'Koldalsvägen',station:'Koldalsvägen',platform:'Läge C',lat:59.3003,lon:18},
  {id:'active-old',name:'Driftläge',station:'Driftläge',platform:'Läge OLD',retired:false,lat:59.3004,lon:18},
  {id:'explicit-retired',name:'Arkiv',station:'Arkiv',platform:'Läge Z',retired:true,lat:-60,lon:110}
 ];
 if(scheduled)stops[1].platform='Läge Extra';
 const payloads:Record<string,string>={
  stops:JSON.stringify(stops),routes:'[]',trips:'[]',transfers:'[]',
  walks:JSON.stringify([{from:0,to:1,seconds:60,metres:80,source:'Fixture'},{from:1,to:2,seconds:60,metres:80,source:'Fixture'}])
 };
 const refs=Object.fromEntries(Object.entries(payloads).map(([key,body])=>[key,{url:`/data/retired-fixture/${key}.json`,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}]));
 const manifest={schema:2,version:'retired-fixture',demo:true,updated:date,validFrom:date,validTo:addDays(date,7),walkingMaxMinutes:30,walkingSpeedKmh:4.8,walkingVersion:'fixture',days:{[date]:[]},warnings:[],attribution:[],...refs};
 if(scheduled){const bits=Buffer.alloc(Math.ceil(stops.length/8));for(const i of scheduled)bits[i>>3]|=1<<(i&7);payloads['stop-service']=JSON.stringify({schema:1,dataset:manifest.version,stopsSHA256:refs.stops.sha256,count:stops.length,serviceBits:bits.toString('base64')});}
 await page.addInitScript(()=>{let leaflet:any;Object.defineProperty(window,'L',{configurable:true,get(){return leaflet;},set(value){leaflet=value;const create=value.map;value.map=(...args:any[])=>{const map=create(...args);(window as any).retiredMap=map;return map;};}});});
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('**/data/**',route=>{const path=new URL(route.request().url()).pathname;const body=path==='/data/manifest.json'?JSON.stringify(manifest):payloads[path.split('/').at(-1)!.replace('.json','')];return body===undefined?route.abort():route.fulfill({contentType:'application/json',body});});
 return {date,stops};
}

test('retired stops stay hidden through results and reset while their walking bridge remains usable',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 await expect(page.getByRole('button',{name:'Start · Läge OLD',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Koldalsvägen · Läge C',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Driftläge · Läge OLD',exact:true})).toHaveCount(1);
 expect(await page.evaluate(()=>{const b=(window as any).retiredMap.options.maxBounds;return !b.contains([80,90])&&!b.contains([-60,110]);})).toBe(true);
 await page.locator('#stop-search').fill('Utgången');await expect(page.locator('#stop-options [role=option]')).toHaveCount(0);
 await page.locator('#stop-search').fill('Start');await page.locator('#stop-search').press('Enter');
 await expect(page.locator('#platform-field, #platform')).toHaveCount(0);
 await page.locator('#time').fill('08:00');await page.locator('#options').evaluate((d:HTMLDetailsElement)=>d.open=true);
 for(const mode of await page.locator('[name=mode]').all())await mode.uncheck();
 await page.locator('#calculate').click();
 await expect(page.locator('#status')).toContainText('Färdigt. 1 hållplatslägen');
 await page.getByRole('button',{name:'Mål · Läge B',exact:true}).press('Enter');
 await expect(page.locator('#journey-panel')).toContainText('2 min');
 await expect(page.locator('#journey-panel')).not.toContainText('OLD');
 await page.getByRole('button',{name:'Stäng resedetaljer'}).click();
 if(await page.locator('#mobile-toggle').isVisible()&&await page.locator('#mobile-toggle').getAttribute('aria-expanded')==='false')await page.locator('#mobile-toggle').click();await page.locator('#reset-search').click();
 await expect(page.getByRole('button',{name:'Start · Läge OLD',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Mål · Läge B',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('a retired shared origin is rejected without moving it to an active sibling',async({page})=>{
 const {date}=await fixture(page);
 const settings={v:1,stop:'old-bridge',name:'Start',lat:59.3001,lon:18,date,time:'08:00',maxMinutes:60,walkMinutes:15,maxTransfers:3,windowMinutes:30,modes:[]};
 await page.goto('/#s='+encodeURIComponent(JSON.stringify(settings)));
 await expect(page.locator('#form-error')).toContainText('har utgått');
 await expect(page.locator('#form-error')).toContainText('startpunkten har inte flyttats');
 await expect(page.locator('#calculate')).toBeDisabled();await expect(page.locator('#map')).not.toHaveAttribute('data-search-state','complete');
});

test('unserved non-OLD stops hide from markers and search while their walking bridge remains routable',async({page})=>{
 await fixture(page,[0,2,5]);await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 await expect(page.getByRole('button',{name:'Start · Läge Extra',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Koldalsvägen · Läge C',exact:true})).toHaveCount(0);
 await page.locator('#stop-search').fill('Koldals');await expect(page.locator('#stop-options [role=option]')).toHaveCount(0);
 await page.locator('#stop-search').fill('Start');await page.locator('#stop-search').press('Enter');await page.locator('#time').fill('08:00');
 await page.locator('#options').evaluate((d:HTMLDetailsElement)=>d.open=true);for(const mode of await page.locator('[name=mode]').all())await mode.uncheck();
 await page.locator('#calculate').click();await expect(page.locator('#map')).toHaveAttribute('data-search-state','complete');
 await page.getByRole('button',{name:'Mål · Läge B',exact:true}).press('Enter');await expect(page.locator('#journey-panel')).toContainText('2 min');
 await page.getByRole('button',{name:'Stäng resedetaljer'}).click();if(await page.locator('#mobile-toggle').isVisible()&&await page.locator('#mobile-toggle').getAttribute('aria-expanded')==='false')await page.locator('#mobile-toggle').click();await page.locator('#reset-search').click();
 await expect(page.getByRole('button',{name:'Start · Läge Extra',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Mål · Läge B',exact:true})).toBeVisible();
});
