import {createMap,boundsOf} from '../../src/map';
import {MapStops} from '../../src/map-stops';
import {isMapStop} from '../../src/core/stops';
import {loadStopService} from '../../src/core/stop-service';
import {colorFor} from '../../src/core/settings';
const map=await createMap('map',[18,59.35],8,'none');
const manifest=await(await fetch('/data/manifest.json')).json(),stops=await(await fetch(manifest.stops.url)).json();
await loadStopService(stops,manifest);
const visible=stops.map((stop:any,index:number)=>({stop,index})).filter(({stop}:any)=>isMapStop(stop));
const sourceCalls={count:0};
const module='/.data-build/map-stops-before.ts';
const StopLayer=location.search.includes('baseline')?(await import(module)).MapStops:MapStops;
const layer=new StopLayer(map),source:any=map.getSource('stops'),setData=source.setData;
source.setData=function(...args:any[]){sourceCalls.count++;return setData.apply(this,args);};
const markers=visible.map(({stop,index}:any)=>layer.add(stop,index));
const idle=async()=>{await new Promise(requestAnimationFrame);if(map.isMoving())await map.once('moveend');if(!map.loaded())await map.once('idle');};
async function run(phase:string){
 sourceCalls.count=0;
 const start=performance.now();
 if(phase==='overview'){
  map.fitBounds(boundsOf(visible.map(({stop}:any)=>[stop.lat,stop.lon])),{duration:0,padding:40});await idle();
 }else if(phase==='pan'){
  map.panBy([75,20],{duration:500});await idle();
 }else if(phase==='hover'){
  for(const marker of markers.slice(0,12)){
   marker.setStyle({radius:10,weight:3,color:'#183e36'});await idle();
   marker.setStyle({radius:7,weight:2,color:'#fff'});await idle();
  }
 }else if(phase==='results'){
  for(const [i,marker] of markers.entries()){
   marker.setVisible(i%3!==0);marker.setStyle({radius:7,weight:2,color:'#fff',fillColor:colorFor(i%7200,120),seconds:i%7200} as any);
  }await idle();
 }
 return {ms:performance.now()-start,sourceUpdates:sourceCalls.count,domStops:document.querySelectorAll('.map-stop').length,rendered:map.queryRenderedFeatures({layers:map.getStyle().layers.filter(l=>l.id==='stops'||l.id.startsWith('stop-cluster')).map(l=>l.id)}).length,zoom:map.getZoom()};
}
await idle();
(window as any).stopBench={map,run,count:markers.length,dataset:manifest.version};
