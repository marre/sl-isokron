import L from 'leaflet';
import { loadJSON } from './core/data';
import { walkingMinutes } from './core/walking';
import { bandLimits, type AreaBand, type AreaGeometry, type RasterGrid } from './core/bands';
import type { Manifest, SearchResult, Settings, Stop } from './core/types';

type Profiles = Record<string, {minutes:number;geometry:AreaGeometry}[]>;
class BandCanvas extends L.Layer {
  readonly canvas=document.createElement('canvas');
  coverage?:L.LatLngBounds;
  private map?:L.Map;
  constructor(private pane:HTMLElement,private area:L.LatLngBounds){super();this.canvas.className='leaflet-layer leaflet-zoom-hide';}
  onAdd(map:L.Map){this.map=map;this.pane.append(this.canvas);this.position();return this;}
  onRemove(){this.canvas.remove();this.map=undefined;return this;}
  getEvents(){return {zoomend:this.position,viewreset:this.position};}
  image(width:number,height:number,pixels:Uint8ClampedArray,cutoff:number){
    this.canvas.width=width;this.canvas.height=height;this.canvas.dataset.cutoff=String(cutoff);
    this.canvas.getContext('2d')!.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>,width,height),0,0);this.position();
  }
  private position=()=>{
    if(!this.map)return;
    const nw=this.map.latLngToLayerPoint(this.area.getNorthWest()),se=this.map.latLngToLayerPoint(this.area.getSouthEast());
    L.DomUtil.setPosition(this.canvas,nw);this.canvas.style.width=`${se.x-nw.x}px`;this.canvas.style.height=`${se.y-nw.y}px`;
  };
}

export class WalkingView {
  enabled = true;
  private controller?: AbortController;
  private data?: {result:SearchResult;settings:Settings;manifest:Manifest;stops:Stop[]};
  private pane:HTMLElement;
  private merger?:Worker;
  private image?:BandCanvas;
  private workerVersion='';
  private workerCutoffs=new Set<number>();
  private profiles = new Map<number,Profiles>();
  private cutoff = 0;
  private schedule?:()=>void;
  private timer?:ReturnType<typeof setTimeout>;

  constructor(private map:L.Map,private status:(text:string)=>void,private ready:()=>void,private progress?:(completed:number,total:number,failed:number)=>void) {
    this.pane=map.createPane('walking-areas');this.pane.style.zIndex='250';this.pane.style.opacity='.48';this.pane.style.pointerEvents='none';
  }
  private removeLayers(){this.image?.remove();this.image=undefined;}
  private clear() {
    this.controller?.abort();this.merger?.terminate();this.merger=undefined;clearTimeout(this.timer);this.timer=undefined;
    this.removeLayers();this.workerVersion='';this.workerCutoffs.clear();this.schedule=undefined;
  }
  reset(){this.clear();this.profiles.clear();this.data=undefined;}
  bounds(){return this.image?.coverage;}
  setData(result:SearchResult,settings:Settings,manifest:Manifest,stops:Stop[]){
    this.reset();this.data={result,settings,manifest,stops};this.cutoff=settings.maxMinutes;this.draw();
  }
  toggle(enabled:boolean){this.enabled=enabled;this.clear();this.draw();}
  setCutoff(minutes:number){
    if(!this.data)return;
    this.cutoff=Math.max(1,Math.min(this.data.settings.maxMinutes,Math.floor(minutes)));
    if(Number(this.image?.canvas.dataset.cutoff)!==this.cutoff)this.schedule?.();
  }

  private draw(){
    if(!this.data||!this.enabled){this.progress?.(0,0,0);this.status('Gångområden är dolda.');return;}
    const {result,settings,manifest,stops}=this.data,areas=manifest.walkingAreas;
    if(!areas){this.status('Gångområden saknas i detta dataset.');return;}
    const available=walkingMinutes(result.walkSources,settings.maxMinutes*60,settings.walkMinutes*60);
    const positions=new Map<number,number[]>();
    for(const index of available.keys()){
      const file=areas.index[stops[index].id];
      if(file!==undefined)positions.set(file,[...(positions.get(file)??[]),index]);
    }
    if(!positions.size){this.status('Inga gångområden finns för de nådda lägena. Gångtäckningen är ofullständig.');return;}
    const controller=this.controller=new AbortController();
    const merger=this.merger=new Worker(new URL('./bands-worker.ts',import.meta.url),{type:'module'});
    const requests=new Map<number,AbortController>(),failed=new Set<number>();
    let wanted=new Set<number>(),queue:number[]=[],profileVersion=0,view=0,busy=false,pending=false,mergeError=false;
    let clip=this.map.getBounds().pad(.25),clipZoom=this.map.getZoom();
    const budgets=new Map<number,Map<number,number>>();
    const standard=bandLimits(settings.maxMinutes);
    const budget=(minutes:number)=>{
      if(!budgets.has(minutes))budgets.set(minutes,walkingMinutes(result.walkSources,minutes*60,settings.walkMinutes*60));
      const partials=[...budgets.keys()].filter(n=>!standard.includes(n)&&n!==minutes);
      for(const n of partials.slice(0,Math.max(0,partials.length-3)))budgets.delete(n);
      return budgets.get(minutes)!;
    };
    const progress=()=>{
      if(controller.signal.aborted)return;
      const done=[...wanted].filter(file=>this.profiles.has(file)||failed.has(file)).length;
      this.progress?.(done,wanted.size+((busy||pending)&&!mergeError?1:0),failed.size+(mergeError?1:0));
      if(done<wanted.size)this.status(`Laddar och visar gångområden: ${done} av ${wanted.size} (${Math.floor(done/wanted.size*100)} %) i kartvyn${failed.size?` · ${failed.size} kunde inte laddas`:''}…`);
      else if(mergeError)this.status('Gångområden kunde inte sammanfogas. Hållplatsernas restider visas fortfarande. Slå av och på gångområden för att försöka igen.');
      else if(!wanted.size)this.status('Inga gångområden i denna kartvy. Flytta kartan till nådda hållplatser.');
      else if(busy||pending)this.status('Sammanfogar restidsband i kartvyn…');
      else {
        this.status(failed.size?`Gångområden visas delvis · ${failed.size} underlag kunde inte laddas. Slå av och på gångområden för att försöka igen.`:'Ungefärliga gångområden · ofullständig täckning. En färgad yta garanterar inte tillträde överallt.');
        this.ready();
      }
    };
    const send=()=>{
      clearTimeout(this.timer);this.timer=undefined;
      if(controller.signal.aborted||busy||!pending)return;
      pending=false;busy=true;
      const version=`${view}:${profileVersion}`,known=this.workerVersion===version;
      const partial=this.cutoff%10!==0&&this.cutoff!==settings.maxMinutes;
      const limits=known?(partial&&!this.workerCutoffs.has(this.cutoff)?[this.cutoff]:[]):[...new Set([...standard,this.cutoff])].sort((a,b)=>a-b);
      const bands:AreaBand[]=limits.map(minutes=>{
        const geometries:AreaGeometry[]=[];
        const needed=budget(minutes);
        for(const file of wanted)for(const [id,contours] of Object.entries(this.profiles.get(file)??{})){
          const index=indices.get(id),allowance=index===undefined?undefined:needed.get(index);
          const contour=allowance===undefined?undefined:contours.find(c=>c.minutes===allowance);
          if(contour)geometries.push(contour.geometry);
        }
        return {minutes,geometries};
      });
      const nw=this.map.project(clip.getNorthWest()),se=this.map.project(clip.getSouthEast()),w=se.x-nw.x,h=se.y-nw.y;
      const scale=Math.min(1,Math.sqrt(1_000_000/(w*h)),2048/Math.max(w,h));
      const grid:RasterGrid={width:Math.max(1,Math.ceil(w*scale)),height:Math.max(1,Math.ceil(h*scale)),bounds:[clip.getWest(),clip.getSouth(),clip.getEast(),clip.getNorth()]};
      merger.postMessage({version,view,cutoff:this.cutoff,maxMinutes:settings.maxMinutes,bands,grid});progress();
    };
    this.schedule=()=>{
      pending=true;
      if(!this.timer&&!busy)this.timer=setTimeout(send,60);
    };
    const indices=new Map(stops.map((stop,index)=>[stop.id,index]));
    merger.onmessage=({data}:{data:{version:string;view:number;cutoff:number;width:number;height:number;pixels?:Uint8ClampedArray;extent?:number[];cachedCutoffs?:number[];error?:boolean}})=>{
      if(controller.signal.aborted)return;
      busy=false;
      if(data.view===view){
        if(data.error){mergeError=true;this.workerVersion='';this.workerCutoffs.clear();}
        else if(data.pixels){
          mergeError=false;
          if(this.workerVersion!==data.version)this.workerCutoffs.clear();
          this.workerVersion=data.version;this.workerCutoffs=new Set(data.cachedCutoffs??[]);
          if(data.cutoff===this.cutoff){
            if(!this.image)this.image=new BandCanvas(this.pane,clip).addTo(this.map);
            this.image.image(data.width,data.height,data.pixels,data.cutoff);
            if(data.extent){
              const nw=this.map.project(clip.getNorthWest()),se=this.map.project(clip.getSouthEast());
              const point=(x:number,y:number)=>this.map.unproject(L.point(nw.x+(se.x-nw.x)*x/data.width,nw.y+(se.y-nw.y)*y/data.height));
              this.image.coverage=L.latLngBounds(point(data.extent[0],data.extent[1]),point(data.extent[2],data.extent[3]));
            }else this.image.coverage=undefined;
          }
        }
      }
      if(pending)send();progress();
    };
    merger.onerror=()=>{if(controller.signal.aborted)return;busy=false;pending=false;mergeError=true;progress();};
    const pump=()=>{
      while(requests.size<6&&queue.length){
        const file=queue.shift()!;
        if(this.profiles.has(file)||requests.has(file)||!wanted.has(file))continue;
        const request=new AbortController();requests.set(file,request);
        const abort=()=>request.abort();controller.signal.addEventListener('abort',abort,{once:true});
        void(async()=>{
          try{
            const profiles=await loadJSON<Profiles>(areas.files[file],request.signal);
            if(request.signal.aborted)return;
            this.profiles.set(file,profiles);profileVersion++;failed.delete(file);this.schedule?.();
          }catch{if(!request.signal.aborted)failed.add(file);}
          finally{
            controller.signal.removeEventListener('abort',abort);requests.delete(file);
            if(controller.signal.aborted)return;
            if(request.signal.aborted&&wanted.has(file)&&!queue.includes(file))queue.push(file);
            progress();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
            if(!controller.signal.aborted)pump();
          }
        })();
      }
    };
    const updateView=()=>{
      if(controller.signal.aborted)return;
      const bounds=this.map.getBounds(),d=(settings.walkMinutes*80+50)/111320;
      const lon=d/Math.max(.1,Math.cos(this.map.getCenter().lat*Math.PI/180));
      const expanded=L.latLngBounds([bounds.getSouth()-d,bounds.getWest()-lon],[bounds.getNorth()+d,bounds.getEast()+lon]);
      const previous=wanted;
      wanted=new Set([...positions.keys()].filter(file=>positions.get(file)!.some(i=>expanded.contains([stops[i].lat,stops[i].lon]))));
      for(const [file,request] of requests)if(!wanted.has(file))request.abort();
      // Raw profiles outside this view stay in the verified browser disk cache.
      for(const file of this.profiles.keys())if(!wanted.has(file))this.profiles.delete(file);
      for(const file of failed)if(!wanted.has(file))failed.delete(file);
      const moved=!clip.contains(bounds)||clipZoom!==this.map.getZoom(),changed=previous.size!==wanted.size||[...wanted].some(file=>!previous.has(file));
      if(moved){clip=bounds.pad(.25);clipZoom=this.map.getZoom();view++;this.removeLayers();}
      if(changed)profileVersion++;
      queue=[...wanted].filter(file=>!this.profiles.has(file)&&!requests.has(file)).sort((a,b)=>{
        const score=(file:number)=>Math.min(...positions.get(file)!.map(i=>this.map.distance(this.map.getCenter(),[stops[i].lat,stops[i].lon])));
        return score(a)-score(b);
      });
      if(moved||changed)this.schedule?.();progress();pump();
    };
    this.map.on('moveend zoomend resize',updateView);
    controller.signal.addEventListener('abort',()=>{this.map.off('moveend zoomend resize',updateView);for(const request of requests.values())request.abort();},{once:true});
    updateView();
  }
}
