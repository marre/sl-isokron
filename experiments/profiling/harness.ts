import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {WalkingView} from '../../src/walking-view';
import {profiling,acceptProfile} from '../../src/core/profile';
import type {Manifest,SearchResult,Settings,Stop} from '../../src/core/types';
interface Input {manifest:Manifest;stops:Stop[];result:SearchResult;settings:Settings;center:[number,number];zoom:number}
let map:L.Map,view:WalkingView,input:Input;
let complete:(()=>void)|undefined;
const api={
 setup(data:Input){
  input=data;map=L.map('map',{zoomControl:false,attributionControl:false,zoomAnimation:false,fadeAnimation:false}).setView(data.center,data.zoom,{animate:false});
  // Match the app's stop-marker load; do this before the timed walking phase.
  for(let i=0;i<data.stops.length;i++)if(data.result.values[i]){const s=data.stops[i];L.circleMarker([s.lat,s.lon],{radius:5}).addTo(map);}
  view=new WalkingView(map,text=>{document.querySelector('#status')!.textContent=text},()=>{complete?.();complete=undefined});
 },
 run(){return new Promise<void>(resolve=>{complete=resolve;view.setData(input.result,input.settings,input.manifest,input.stops)})},
 cutoff(minutes:number){return new Promise<void>(resolve=>{complete=resolve;view.setCutoff(minutes)})},
 pan(center:[number,number],zoom:number){return new Promise<void>(resolve=>{complete=resolve;map.setView(center,zoom,{animate:false})})},
 route(manifest:Manifest,settings:Settings){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../../src/worker.ts',import.meta.url),{type:'module'});let batches=0;
  worker.onmessage=({data})=>{if(data.type==='stations')batches++;if(data.type==='result'){acceptProfile(data.profileEvents);setTimeout(()=>worker.terminate(),5000);resolve({elapsed:data.result.elapsed,labels:data.result.labels,reachable:data.result.values.filter(Boolean).length,batches})}if(data.type==='error'){worker.terminate();reject(new Error(data.message))}};
  worker.onerror=e=>{worker.terminate();reject(new Error(e.message))};worker.postMessage({id:1,manifest,settings,profiling:profiling()});
 })},
 profiling:profiling(),
};
(globalThis as unknown as {bench:typeof api}).bench=api;
