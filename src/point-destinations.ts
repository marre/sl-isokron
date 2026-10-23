import L from 'leaflet';
import type {JourneyView} from './journey-view';
import type {Manifest,SearchResult,Settings,Stop} from './core/types';

/** One persistent worker per search; pointer changes invalidate stale previews. */
export class PointDestinations {
 private worker?:Worker;private id=0;private timer?:ReturnType<typeof setTimeout>;private cutoff=0;private pinPending=false;
 constructor(private map:L.Map,private view:JourneyView,private status:HTMLElement){
  document.querySelector('#journey-panel')!.addEventListener('journeyclose',()=>this.cancel());
  map.on('mousemove',e=>this.move(e));
  map.on('click',e=>{this.cancel();if(this.available()&&!this.onStop(e)&&!(e.originalEvent?.detail>1)){this.pinPending=true;this.timer=setTimeout(()=>this.query(e.latlng,true),450);}});
  map.on('dblclick',()=>this.cancel());
  map.on('movestart',()=>{this.cancel();this.view.leave();});
  map.on('mouseout',e=>{const target=(e.originalEvent as MouseEvent)?.relatedTarget;if(target instanceof Node&&map.getContainer().contains(target))return;this.cancel();this.view.leave();});
 }
 private available(){return !!this.worker;}
 private onStop(e:L.LeafletMouseEvent){return !!(e.originalEvent?.target as Element|null)?.closest?.('.leaflet-interactive');}
 private move(e:L.LeafletMouseEvent){
  if(this.pinPending||!this.available()||this.view.isPinned||!matchMedia('(hover: hover)').matches)return;
  if(this.onStop(e)){this.cancel();return;}
  this.cancel();this.view.leave();
  this.timer=setTimeout(()=>this.query(e.latlng,false),220);
 }
 private query(point:L.LatLng,pin:boolean){
  this.cancel();if(!this.available())return;
  if(pin)this.view.close();
  this.pinPending=pin;
  const id=++this.id;
  this.status.textContent='Beräknar sista gångvägen…';this.status.hidden=false;
  this.worker!.onmessage=({data})=>{
   if(data.id!==this.id||!this.available())return;
   this.pinPending=false;
   if(data.journey){this.status.hidden=true;this.view.showPoint(data.journey,pin);}
   else {this.view.leave();this.status.textContent=pin?data.message:'Ingen känd gångresa till punkten inom valda gränser.';this.status.hidden=false;}
  };
  this.worker!.postMessage({type:'query',id,lat:point.lat,lon:point.lng,cutoff:this.cutoff});
 }
 private cancel(){this.pinPending=false;clearTimeout(this.timer);this.id++;this.worker?.postMessage({type:'cancel'});this.status.hidden=true;}
 setData(result:SearchResult,settings:Settings,manifest:Manifest,stops:Stop[]){
  this.reset();this.cutoff=settings.displayMinutes??settings.maxMinutes;
  if(!manifest.footpaths||!result.destinationSources)return;
  this.worker=new Worker(new URL('./destination-worker.ts',import.meta.url),{type:'module'});
  this.worker.onerror=()=>{this.pinPending=false;this.status.textContent='Gångvägen till punkten kunde inte beräknas. Sök igen för att försöka på nytt.';this.status.hidden=false;this.worker?.terminate();this.worker=undefined;};
  this.worker.postMessage({type:'configure',context:{manifest,settings,stops,result:{...result,values:[],routes:[],walkSources:[]}}});
 }
 pause(){this.cancel();}
 setCutoff(minutes:number){this.cutoff=minutes;this.cancel();}
 reset(){this.cancel();this.worker?.terminate();this.worker=undefined;}
}
