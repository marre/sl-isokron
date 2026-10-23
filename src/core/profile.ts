/** Opt-in local diagnostics. No requests or telemetry; disabled without ?profile=1. */
export interface ProfileEvent {name:string;lane:string;at:number;ms:number;detail?:Record<string,number|string|boolean>}
let active=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('profile')==='1';
let lane='main';
let events:ProfileEvent[]=[];
export function configureProfile(enabled:boolean,name:string){active=enabled;lane=name;events=[];}
export const profiling=()=>active;
export const profileStart=()=>active?performance.now():0;
export function profileEnd(name:string,start:number,detail?:ProfileEvent['detail']){
 if(active&&events.length<100_000)events.push({name,lane,at:performance.timeOrigin+start,ms:performance.now()-start,detail});
}
export function drainProfile(){const result=events;events=[];return result;}
export function acceptProfile(batch?:ProfileEvent[]){if(active&&batch)events.push(...batch.slice(0,Math.max(0,100_000-events.length)));}
if(active){
 (globalThis as unknown as {__slisoProfile:unknown}).__slisoProfile={snapshot:()=>events.slice(),clear:()=>{events=[]}};
}
