import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';

test('dense maps bound keyboard DOM, cluster overview stops, and highlight without rebuilding geometry',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 await page.evaluate(async()=>{
  const mapModule='/src/map.ts',stopModule='/src/map-stops.ts';
  const {createMap}=await import(mapModule),{MapStops}=await import(stopModule);
  const el=document.createElement('div');el.id='stop-performance-map';el.style.cssText='position:fixed;inset:0;z-index:10000';document.body.append(el);
  const map=await createMap(el,[18,59.35],9,'none'),layer=new MapStops(map),markers=[];
  for(let i=0;i<1200;i++)markers.push(layer.add({id:String(i),name:'Station '+i,station:'Station '+i,platform:'A',lat:59.28+Math.floor(i/40)*.004,lon:17.9+(i%40)*.005},i));
  await new Promise(requestAnimationFrame);if(!map.loaded())await map.once('idle');
  let calls=0;const source=map.getSource('stops'),setData=source.setData;source.setData=function(...args:any[]){calls++;return setData.apply(this,args);};
  (window as any).stopsTest={map,markers,calls:()=>calls};
 });
 await expect.poll(()=>page.evaluate(()=>(window as any).stopsTest.map.queryRenderedFeatures({layers:['stop-clusters']}).length)).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).stopsTest.map.queryRenderedFeatures({layers:['stop-cluster-count']}).length)).toBeGreaterThan(0);
 expect(await page.locator('#stop-performance-map .map-stop').count()).toBeLessThanOrEqual(128);
 await page.evaluate(()=>{const t=(window as any).stopsTest;for(const marker of t.markers.slice(0,12)){marker.setStyle({radius:10,weight:3,color:'#183e36'});marker.setStyle({radius:7,weight:2,color:'#fff'});}});
 await page.waitForTimeout(100);
 expect(await page.evaluate(()=>(window as any).stopsTest.calls())).toBe(0);
 expect(await page.evaluate(()=>(window as any).stopsTest.map.getSource('stops').serialize().data.features.length)).toBe(1200);
 await page.evaluate(()=>{const t=(window as any).stopsTest;t.markers[0].setStyle({radius:10});t.markers[0].setStyle({radius:7,fillColor:'#d9f0a3'});});
 await expect.poll(()=>page.evaluate(()=>(window as any).stopsTest.calls())).toBe(1);
 expect(await page.evaluate(()=>(window as any).stopsTest.map.getFeatureState({source:'stops',id:0}))).toEqual({});
 await page.evaluate(()=>{const t=(window as any).stopsTest;t.map.jumpTo({center:[17.95,59.31],zoom:13});});
 await expect.poll(()=>page.evaluate(()=>(window as any).stopsTest.map.queryRenderedFeatures({layers:['stop-clusters']}).length)).toBe(0);
 await expect.poll(()=>page.locator('#stop-performance-map .map-stop').count()).toBeGreaterThan(0);
 expect(await page.locator('#stop-performance-map .map-stop').count()).toBeLessThanOrEqual(128);
 expect(errors).toEqual([]);
});

test('tapping an overview group zooms in without changing the origin or starting a search',async({page})=>{
 let searches=0;page.on('worker',w=>{if(/\/worker\.ts(?:\?|$)/.test(w.url()))searches++;});
 const stops=Array.from({length:1200},(_,i)=>({id:'dense-'+i,name:'Station '+i,station:'Station '+i,platform:'A',lat:59.28+Math.floor(i/40)*.004,lon:17.9+(i%40)*.005}));
 const body=JSON.stringify(stops);
 await page.route('**/data/manifest.json',async route=>{const response=await route.fetch(),m=await response.json();m.stops={url:'/data/dense/stops.json',bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')};await route.fulfill({json:m});});
 await page.route('**/data/dense/stops.json',r=>r.fulfill({contentType:'application/json',body}));
 await page.addInitScript(()=>document.addEventListener('sliso:map-ready',e=>{if((e.target as HTMLElement).id==='map')(window as any).clusterMap=(e as CustomEvent).detail;}));
 await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 if(await page.locator('#mobile-close-search').isVisible())await page.locator('#mobile-close-search').click();
 await page.evaluate(()=>{(window as any).clusterMap.jumpTo({center:[18,59.34],zoom:9});});
 await expect.poll(()=>page.evaluate(()=>(window as any).clusterMap.queryRenderedFeatures({layers:['stop-clusters']}).length)).toBeGreaterThan(0);
 const target=await page.evaluate(()=>{const m=(window as any).clusterMap,r=m.getContainer().getBoundingClientRect();const f=m.queryRenderedFeatures({layers:['stop-clusters']}).find((f:any)=>{const p=m.project(f.geometry.coordinates);return p.y>170&&p.y<r.height-100&&p.x>30&&p.x<r.width-80;});const p=m.project(f.geometry.coordinates);return {x:r.x+p.x,y:r.y+p.y,zoom:m.getZoom()};});
 await page.mouse.click(target.x,target.y);
 await expect.poll(()=>page.evaluate(()=>(window as any).clusterMap.getZoom())).toBeGreaterThan(target.zoom);
 await page.waitForTimeout(600);
 await expect(page.locator('#stop-search')).toHaveValue('');await expect(page.locator('#calculate')).toBeDisabled();expect(searches).toBe(0);
 expect(await page.locator('#map .map-stop').count()).toBeLessThanOrEqual(128);
});
