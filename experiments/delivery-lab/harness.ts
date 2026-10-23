import L from 'leaflet';import 'leaflet/dist/leaflet.css';
import {WalkingView} from '../../src/walking-view';
import {WalkingView as BundledWalkingView} from '../../.data-build/delivery-lab/bundled-view';
import {WalkingView as NoFrameWalkingView} from '../../.data-build/delivery-lab/no-frame-view';
import {configureProfile,drainProfile} from '../../src/core/profile';
import type {Manifest,SearchResult,Settings,Stop} from '../../src/core/types';
type Input={result:SearchResult;settings:Settings;stops:Stop[];center:[number,number];zoom:number};
let map:L.Map,input:Input,live:WalkingView|BundledWalkingView|NoFrameWalkingView|undefined,nextPreview=false,knots:Record<string,number[]>={},paintInterval=0;
const NativeWorker=window.Worker;
class ResearchWorker extends NativeWorker{
 private preview=nextPreview;private choices=knots;private interval=paintInterval;private last=-Infinity;private held:any;private timer?:ReturnType<typeof setTimeout>;
 postMessage(message:any,options?:any){
  if(this.preview&&message.type==='render')message={...message,bands:message.bands.map((b:any)=>({...b,allowances:b.allowances.map(([id,minutes]:[string,number])=>[id,this.choices[id]?.filter(n=>n<=minutes).at(-1)??0])}))};
  if(message.type==='render'&&this.interval&&performance.now()-this.last<this.interval){this.held=[message,options];clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),this.interval-(performance.now()-this.last));return;}
  if(message.type==='render')this.last=performance.now();super.postMessage(message,options);
 }
 private flush(){if(this.held){const [m,o]=this.held;this.held=undefined;this.last=performance.now();super.postMessage(m,o);}}
 terminate(){clearTimeout(this.timer);super.terminate();}
}
window.Worker=ResearchWorker;
let activeResolve:((v:any)=>void)|undefined,firstPaint=0,start=0,previewMs=0,previewPixels:Uint8ClampedArray|undefined,previewDimensions:number[]|undefined,observer:MutationObserver;
function canvas(){return map.getPane('walking-areas')!.querySelector('canvas')!;}
function snapshot(){const c=canvas();return {pixels:c.getContext('2d')!.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}
async function summary(){
 const end=performance.now(),s=snapshot(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',s.pixels))].map(v=>v.toString(16).padStart(2,'0')).join('');let difference;
 if(previewPixels){if(previewDimensions![0]!==s.width||previewDimensions![1]!==s.height)throw new Error('Preview grid differs');let union=0,changed=0,gained=0,lost=0;for(let i=0;i<s.pixels.length;i+=4){const a=previewPixels[i+3]>0,b=s.pixels[i+3]>0;if(a||b)union++;if(a&&!b)gained++;if(!a&&b)lost++;if((a||b)&&[0,1,2,3].some(k=>previewPixels![i+k]!==s.pixels[i+k]))changed++;}difference={union,changed,gained,lost,changedPercent:changed/union*100};}
 return {ms:end-start,firstPaintMs:firstPaint-start,previewMs:previewMs||undefined,pixelHash:hash,width:s.width,height:s.height,previewDifference:difference,events:drainProfile(),status:document.querySelector('#status')!.textContent};
}
function begin(){configureProfile(true,'main');firstPaint=0;previewMs=0;previewPixels=undefined;start=performance.now();observer?.disconnect();observer=new MutationObserver(()=>{if(!firstPaint&&document.querySelector('.leaflet-walking-areas-pane canvas'))firstPaint=performance.now()});observer.observe(document.querySelector('#map')!,{childList:true,subtree:true});}
function create(manifest:Manifest,ready:()=>void){const View=(manifest as any).noFrame?NoFrameWalkingView:(manifest.walkingAreas as any).sources?BundledWalkingView:WalkingView;return new View(map,text=>{document.querySelector('#status')!.textContent=text},ready);}
function complete(){if(activeResolve){const resolve=activeResolve;activeResolve=undefined;void summary().then(resolve);}}
const api={
 setup(data:Input){input=data;map=L.map('map',{zoomControl:false,attributionControl:false,zoomAnimation:false,fadeAnimation:false}).setView(data.center,data.zoom);for(let i=0;i<data.stops.length;i++)if(data.result.values[i]){const s=data.stops[i];L.circleMarker([s.lat,s.lon],{radius:5}).addTo(map);}},
 run(manifest:Manifest,interval=0){live?.reset();nextPreview=false;paintInterval=interval;begin();return new Promise(resolve=>{activeResolve=resolve;live=create(manifest,complete);live.setData(input.result,input.settings,manifest,input.stops);});},
 layered(preview:Manifest,detail:Manifest,interval=0){
  live?.reset();nextPreview=true;paintInterval=interval;knots=(preview.walkingAreas as any).previewKnots;begin();
  return new Promise(resolve=>{activeResolve=resolve;let ready=false;const coarse=create(preview,()=>{if(ready)return;ready=true;previewMs=performance.now()-start;const s=snapshot();previewPixels=s.pixels;previewDimensions=[s.width,s.height];nextPreview=false;const fine=create(detail,()=>{coarse.reset();map.getPane('walking-areas')!.style.visibility='visible';complete();});live=fine;fine.setData(input.result,input.settings,detail,input.stops);map.getPane('walking-areas')!.style.visibility='hidden';});coarse.setData(input.result,input.settings,preview,input.stops);});
 },
 cutoff(minutes:number){begin();return new Promise(resolve=>{activeResolve=resolve;live!.setCutoff(minutes);});},
 pan(center:[number,number]){begin();return new Promise(resolve=>{activeResolve=resolve;map.setView(center,map.getZoom(),{animate:false});});},
 image(){return canvas().toDataURL();},
 previewImage(){if(!previewPixels)return null;const c=document.createElement('canvas');c.width=previewDimensions![0];c.height=previewDimensions![1];c.getContext('2d')!.putImageData(new ImageData(previewPixels as Uint8ClampedArray<ArrayBuffer>,c.width,c.height),0,0);return c.toDataURL();}
};
(window as any).bench=api;
