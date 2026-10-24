import {test,expect} from '@playwright/test';

test('Maptoolkit default style needs no key and attribution stays visible after gestures and resizing',async({page})=>{
 const styleURL='https://styles.maptoolkit.org/summer.json';
 await page.route(styleURL,r=>r.fulfill({json:{version:8,sources:{mtk:{type:'vector',url:'https://tiles.maptoolkit.org/test.json'}},layers:[{id:'base',type:'background',paint:{'background-color':'#e8eee4'}},{id:'land',type:'fill',source:'mtk','source-layer':'land'}]}}));
 await page.route('https://tiles.maptoolkit.org/test.json',r=>r.fulfill({json:{tilejson:'3.0.0',tiles:['https://tiles.maptoolkit.org/test/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:14,attribution:'<a href="https://www.maptoolkit.com/copyright/">© Maptoolkit</a> <a href="https://www.openstreetmap.org/copyright">© Openstreetmap</a>'}}));
 await page.route('https://tiles.maptoolkit.org/test/**',r=>r.fulfill({body:Buffer.alloc(0)}));
 await page.goto('/');await expect(page.locator('#stop-search')).toBeEnabled();
 await page.evaluate(async()=>{
  const module='/src/map.ts',{createMap,MAP_STYLE}=await import(module);
  if(MAP_STYLE!=='https://styles.maptoolkit.org/summer.json')throw new Error('Unexpected default style');
  const el=document.createElement('div');el.id='provider-map';el.style.cssText='position:fixed;inset:0;z-index:10000';document.body.append(el);
  (window as any).providerMap=await createMap(el,[18,59.33],12,MAP_STYLE);
 });
 const logo=page.locator('#provider-map .maplibre-maptoolkit-logo-control a'),copy=page.locator('#provider-map .maplibregl-ctrl-attrib-inner');
 await expect(copy).toContainText('© Maptoolkit');await expect(copy).toContainText('© Openstreetmap');
 await expect(logo).toHaveAttribute('href',/maptoolkit.org/);
 await page.mouse.move(180,220);await page.mouse.down();await page.mouse.move(230,240,{steps:5});await page.mouse.up();
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>{(window as any).providerMap.resize();});
  await expect(logo).toBeVisible();await expect(copy).toBeVisible();
  const a=(await logo.boundingBox())!,b=(await copy.boundingBox())!;
  expect(a.height).toBeGreaterThanOrEqual(24);expect(a.y+a.height).toBeLessThanOrEqual(b.y);
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(viewport.width);
 }
});
