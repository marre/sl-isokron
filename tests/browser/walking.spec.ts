import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

async function walkingFixture(page: import('@playwright/test').Page) {
  await page.route('https://tile.openstreetmap.org/**', r => r.abort());
  await page.goto('/');
  const geometry = { type: 'Polygon', coordinates: [[[17.99,59.32],[18.01,59.32],[18.01,59.34],[17.99,59.34],[17.99,59.32]]] };
  const bodies = ['a','b'].map(id => JSON.stringify({ [id]: [{ minutes: 10, geometry }] }));
  const refs = bodies.map((body,i) => ({ url: `/data/progressive/${i}.json`, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/data/progressive/*.json', async route => {
    const i = Number(new URL(route.request().url()).pathname.split('/').at(-1)!.split('.')[0]);
    if (i === 1) await pending;
    await route.fulfill({ contentType: 'application/json', body: bodies[i] }).catch(() => {});
  });
  await page.evaluate(async refs => {
    const component = '/src/walking-view.ts', leaflet = '/node_modules/leaflet/dist/leaflet-src.esm.js';
    const { WalkingView } = await import(component), L = await import(leaflet);
    const el = document.createElement('div'); el.id = 'progressive-map';
    el.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:300px;z-index:10000'; document.body.append(el);
    const status = document.createElement('p'); status.id = 'progressive-status'; document.body.append(status);
    const view = new WalkingView(L.map(el).setView([59.33,18],14), (text:string) => { status.textContent = text; }, () => {});
    (window as any).progressiveView = view;
    view.setData({ walkSources: [{ stop:0,seconds:0,walked:0 },{ stop:1,seconds:600,walked:0 }] },
      { maxMinutes:20,walkMinutes:10 }, { walkingAreas: { index:{ a:0,b:1 },files:refs } }, [{ id:'a',lat:59.33,lon:18 },{ id:'b',lat:59.33,lon:18 }]);
  }, refs);
  return release;
}

test('walking areas paint before the final file arrives and preserve faster colors', async ({page}) => {
  const release = await walkingFixture(page);
  await expect(page.locator('#progressive-status')).toContainText('1 av 2 (50 %)');
  const first = page.locator('#progressive-map .leaflet-walking-band-0-pane');
  await expect(first.locator('canvas')).toBeVisible();
  expect(await first.locator('canvas').evaluate((canvas:HTMLCanvasElement) => {
    const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    return data.some((value,index)=>index%4===3&&value>0);
  })).toBe(true);
  release();
  await expect(page.locator('#progressive-status')).toContainText('Ungefärliga');
  const slower = page.locator('#progressive-map .leaflet-walking-band-1-pane');
  await expect(slower.locator('canvas')).toBeVisible();
  expect(Number(await first.evaluate(e=>getComputedStyle(e).zIndex))).toBeGreaterThan(Number(await slower.evaluate(e=>getComputedStyle(e).zIndex)));
});

test('reset removes partial walking areas and ignores late arrivals', async ({page}) => {
  const release = await walkingFixture(page);
  await expect(page.locator('#progressive-status')).toContainText('1 av 2');
  await page.evaluate(() => (window as any).progressiveView.reset());
  release();
  await expect(page.locator('#progressive-map .leaflet-walking-areas-pane canvas')).toHaveCount(0);
  await page.waitForTimeout(150);
  await expect(page.locator('#progressive-map .leaflet-walking-areas-pane canvas')).toHaveCount(0);
  await expect(page.locator('#progressive-status')).not.toContainText('Ungefärliga');
});

test('consecutive mapped and estimated walks form one labelled journey step', async ({page}) => {
  await page.route('https://tile.openstreetmap.org/**', r=>r.abort());
  await page.goto('/');
  await page.evaluate(async () => {
    const component='/src/journey-view.ts';
    const {JourneyView}=await import(component),L=(window as any).L;
    const el=document.createElement('div');el.style.cssText='width:300px;height:300px';document.body.append(el);
    const stops=['A','B','C','D'].map((platform,i)=>({id:String(i),name:'Station',platform,lat:59.+i*.0005,lon:18.,walking:'estimated'}));
    const map=L.map(el).setView([59,18],14),markers=stops.map(s=>L.circleMarker([s.lat,s.lon]).addTo(map));
    const view=new JourneyView(map,markers,()=>{});
    view.setData({values:[null,null,null,{seconds:180,kind:'walk',arrival:240,boardings:0,journey:2}],journeys:[
      {previous:null,kind:'walk',from:0,to:1,departure:60,arrival:120,stops:[0,1],metres:70},
      {previous:0,kind:'walk',from:1,to:2,departure:120,arrival:180,stops:[1,2],metres:80,estimated:true},
      {previous:1,kind:'walk',from:2,to:3,departure:180,arrival:240,stops:[2,3],metres:90}],routes:[]},{date:'2026-10-21',maxMinutes:120},stops);
    view.pin(3);
  });
  await expect(page.locator('#journey-panel')).toContainText('Gång · uppskattad');
  await expect(page.locator('#journey-panel')).toContainText('samma namn inom 250 meter');
  await expect(page.locator('#journey-panel')).toContainText('Gång totalt: 3 min · 240 m');
  await expect(page.locator('#journey-panel .journey-leg')).toHaveCount(1);
});

test('walking profiles load for the visible map then follow a new viewport',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());await page.goto('/');
 const bodies=[JSON.stringify({a:[{minutes:10,geometry:{type:'Polygon',coordinates:[[[17.99,59.32],[18.01,59.32],[18.01,59.34],[17.99,59.34],[17.99,59.32]]]}}]}),JSON.stringify({b:[{minutes:10,geometry:{type:'Polygon',coordinates:[[[17.89,59.51],[17.91,59.51],[17.91,59.53],[17.89,59.53],[17.89,59.51]]]}}]})];
 const refs=bodies.map((body,i)=>({url:`/data/viewport/${i}.json`,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}));
 const requested:number[]=[];let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 await page.route('**/data/viewport/*.json',async route=>{const i=Number(new URL(route.request().url()).pathname.split('/').at(-1)!.split('.')[0]);requested.push(i);if(i===0)await held;await route.fulfill({contentType:'application/json',body:bodies[i]}).catch(()=>{});});
 await page.evaluate(async refs=>{
  const component='/src/walking-view.ts',leaflet='/node_modules/leaflet/dist/leaflet-src.esm.js';const {WalkingView}=await import(component),L=await import(leaflet);
  const el=document.createElement('div');el.id='viewport-map';el.style.cssText='position:fixed;left:0;top:0;width:300px;height:300px;z-index:10000';document.body.append(el);
  const status=document.createElement('p');status.id='viewport-status';document.body.append(status);
  const map=L.map(el).setView([59.33,18],15);(window as any).viewportMap=map;
  const view=new WalkingView(map,(text:string)=>status.textContent=text,()=>{});
  view.setData({walkSources:[{stop:0,seconds:0,walked:0},{stop:1,seconds:0,walked:0}]},{maxMinutes:20,walkMinutes:10},{walkingAreas:{index:{a:0,b:1},files:refs}},[{id:'a',lat:59.33,lon:18},{id:'b',lat:59.52,lon:17.9}]);
 },refs);
 await expect.poll(()=>requested).toEqual([0]);
 await expect(page.locator('#viewport-status')).toContainText('0 av 1');
 await page.evaluate(()=>(window as any).viewportMap.setView([59.52,17.9],15,{animate:false}));
 await expect.poll(()=>requested).toEqual([0,1]);
 await expect(page.locator('#viewport-status')).toContainText('Ungefärliga');
 release();
 await page.evaluate(()=>(window as any).viewportMap.setView([59.33,18],15,{animate:false}));
 await expect.poll(()=>requested).toEqual([0,1,0]);
 await expect(page.locator('#viewport-status')).toContainText('Ungefärliga');
});
