import type {Manifest,Stop} from './types';

/** Apply only a complete index for this exact dataset, preserving all indices. */
export function applyStopService(stops:Stop[],manifest:Manifest,payload:unknown):boolean{
 const p=payload as {schema?:number;dataset?:string;stopsSHA256?:string;count?:number;serviceBits?:string}|null;
 if(!p||p.schema!==1||p.dataset!==manifest.version||p.stopsSHA256!==manifest.stops.sha256||p.count!==stops.length||typeof p.serviceBits!=='string')return false;
 let bits:string;try{bits=atob(p.serviceBits);}catch{return false;}
 if(bits.length!==Math.ceil(stops.length/8))return false;
 stops.forEach((stop,i)=>{stop.scheduled=!!(bits.charCodeAt(i>>3)&(1<<(i&7)));});
 return true;
}
export async function loadStopService(stops:Stop[],manifest:Manifest):Promise<void>{
 try{
  const response=await fetch(`/data/${encodeURIComponent(manifest.version)}/stop-service.json`);
  if(response.ok)applyStopService(stops,manifest,await response.json());
 }catch{/* Older releases remain usable; missing evidence never hides a stop. */}
}
