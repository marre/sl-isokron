import {journeyLines} from './map-data';
import {test,expect} from '@playwright/test';

test('phone map stays clear while search and journey details open on demand',async({page},info)=>{
 test.skip(info.project.name!=='mobile','Touch layout');
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.addInitScript(()=>{document.addEventListener('sliso:map-ready',event=>{if((event.target as HTMLElement).id==='map')(window as any).touchMap=(event as CustomEvent).detail;});});
 await page.goto('/');
 await expect(page.locator('#stop-search')).toBeEnabled();
 await expect(page.locator('#calculate')).toBeInViewport();
 await page.locator('#stop-search').fill('T-Centralen');await page.locator('#stop-search').press('Enter');
 await page.locator('#time').fill('08:00');await page.locator('#calculate').tap();
 await expect(page.locator('#map')).toHaveAttribute('data-search-state','complete',{timeout:20000});
 await expect(page.locator('.panel')).toBeHidden();
 const map=await page.locator('#map').boundingBox();
 expect(map!.height).toBeGreaterThan(page.viewportSize()!.height*.85);
 await expect(page.locator('#legend, #walking-toggle, #display-time')).toHaveCount(0);
 await page.locator('#fit').tap();
 await page.getByRole('button',{name:'Zoom in',exact:true}).tap();
 await page.getByRole('button',{name:'Zoom in',exact:true}).tap();
 await page.waitForFunction(()=>!(window as any).touchMap.isMoving());
 await expect(page.getByRole('button',{name:'Universitetet · Testläge A',exact:true})).toBeInViewport();
 const station=await page.getByRole('button',{name:'Universitetet · Testläge A',exact:true}).boundingBox();
 const hold=await page.context().newCDPSession(page);
 await hold.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:station!.x+station!.width/2,y:station!.y+station!.height/2}]});
 await page.waitForTimeout(800);await hold.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await hold.detach();
 await expect(page.locator('#journey-panel')).toBeVisible();
 await expect(page.locator('#map')).toHaveAttribute('data-search-state','complete');
 await expect(page.locator('#journey-content')).toBeHidden();
 expect((await page.locator('#journey-panel').boundingBox())!.height).toBeLessThan(140);
 await page.screenshot({path:'test-results/mobile-compact-journey.png'});
 // Clipped SVG routes can keep the same bounding box while the map pans.
 const before=await page.evaluate(()=>(window as any).touchMap.getCenter().lng);
 const touch=await page.context().newCDPSession(page);
 const x=map!.x+100,y=map!.y+map!.height*.4;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let step=1;step<=6;step++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+step*10,y:y+step*5}]});await page.waitForTimeout(25);}
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=>Math.abs(await page.evaluate(()=>(window as any).touchMap.getCenter().lng)-before)).toBeGreaterThan(.00001);
 await expect.poll(async()=>(await journeyLines(page)).length).toBeGreaterThan(0);
 await touch.detach();
 await page.locator('#journey-expand').tap();
 await expect(page.locator('#journey-content')).toBeVisible();
 expect((await page.locator('#journey-panel').boundingBox())!.height).toBeLessThan(page.viewportSize()!.height*.6);
 await page.locator('#journey-expand').tap();
 await expect(page.locator('#journey-content')).toBeHidden();
 await expect.poll(async()=>(await journeyLines(page)).length).toBeGreaterThan(0);
 await page.locator('#mobile-toggle').tap();
 await expect(page.locator('.panel')).toBeVisible();
 await expect(page.locator('#journey-panel')).toBeHidden();
 await expect(page.locator('#map')).toHaveAttribute('data-search-state','complete');
 await page.locator('#mobile-close-search').tap();
 await expect(page.locator('#map')).toHaveAttribute('data-search-state','complete');
 for(const size of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);
  await expect(page.locator('#mobile-toggle')).toBeVisible();
  const share=(await page.locator('#share').boundingBox())!;
  expect(share.y+share.height).toBeLessThan(size.height);
  await page.locator('#mobile-toggle').tap();
  await expect(page.locator('#calculate')).toBeInViewport();
  await expect(page.locator('#reset-search')).toBeInViewport();
  const calculate=(await page.locator('#calculate').boundingBox())!,reset=(await page.locator('#reset-search').boundingBox())!;
  expect(Math.abs(calculate.y-reset.y)).toBeLessThan(2);expect(reset.x).toBeGreaterThan(calculate.x);
  await page.locator('#mobile-close-search').tap();
  await page.screenshot({path:`test-results/mobile-${size.width}-result.png`});
 }
});
