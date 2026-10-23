/** Acceptance harness for production WalkingView; no worker/message wrappers. */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {WalkingView} from '../../src/walking-view';
import type {Manifest,SearchResult,Settings,Stop} from '../../src/core/types';
let map:L.Map,view:WalkingView,input:{result:SearchResult;settings:Settings;stops:Stop[]};
let resolve:((value:unknown)=>void)|undefined,start=0;
const api={
 setup(data:typeof input){
  input=data;map=L.map('map',{zoomAnimation:false,fadeAnimation:false}).setView([59.335,18.06],13);
  view=new WalkingView(map,text=>{document.querySelector('#status')!.textContent=text;},()=>{void complete();});
 },
 run(manifest:Manifest){return measure(()=>view.setData(input.result,input.settings,manifest,input.stops));},
 fresh(manifest:Manifest){return measure(()=>{view.setData(input.result,input.settings,manifest,input.stops);view.setCutoff(91);});},
 cutoff(minutes:number){return measure(()=>view.setCutoff(minutes));},
 pan(){return measure(()=>map.setView([59.335,18.075],map.getZoom(),{animate:false}));},
 zoom(zoom:number){return measure(()=>map.setZoom(zoom,{animate:false}));}
};
function measure(action:()=>void){start=performance.now();return new Promise(r=>{resolve=r;action();});}
async function complete(){
 if(!resolve)return;
 const callback=resolve;resolve=undefined;
 const c=map.getPane('walking-areas')!.querySelector('canvas')!,pixels=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;
 const ms=performance.now()-start,hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(n=>n.toString(16).padStart(2,'0')).join('');
 callback({ms,hash,layer:c.dataset.layer,status:document.querySelector('#status')!.textContent});
}
(window as any).production=api;
