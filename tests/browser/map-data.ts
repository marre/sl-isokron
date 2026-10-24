import type {Page} from '@playwright/test';
/** Inspect the native MapLibre source rather than obsolete Leaflet SVG paths. */
export async function journeyLines(page:Page,kind?:string){return page.evaluate(async kind=>{
 const {map}=await import('/src/main.ts' as string);const data=map.getSource('journey').serialize().data;
 return data.features.filter((f:any)=>f.geometry.type==='LineString'&&(!kind||f.properties.kind===kind));
},kind);}
