import {loadNetwork} from '../../src/core/data';import {stockholmInstant} from '../../src/core/time';import {search as reference} from '../../src/core/router';import {search,searchHeap} from './raptor';import type {Manifest,Settings} from '../../src/core/types';
self.onmessage=async({data}:MessageEvent<{manifest:Manifest;settings:Settings;engine:'reference'|'route'|'heap'}>)=>{
 try{const t0=stockholmInstant(data.settings.date,data.settings.time),network=await loadNetwork(data.manifest,t0,t0+(data.settings.maxMinutes+data.settings.windowMinutes)*60),result=(data.engine==='reference'?reference:data.engine==='heap'?searchHeap:search)(network,data.settings);
 const text=JSON.stringify({objectives:result.values.map(v=>v?{seconds:v.seconds,arrival:v.arrival}:null),sources:[...result.walkSources].sort((a,b)=>a.stop-b.stop||a.seconds-b.seconds||a.walked-b.walked)}),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 self.postMessage({engine:data.engine,elapsed:result.elapsed,labels:result.labels,reachable:result.values.filter(Boolean).length,digest});
 }catch(error){self.postMessage({error:String(error)})}
};
