import L from 'leaflet';
import type { Polygon, MultiPolygon } from 'geojson';
import { loadJSON } from './core/data';
import { colorFor } from './core/settings';
import { walkingMinutes } from './core/walking';
import type { Manifest, SearchResult, Settings, Stop } from './core/types';

type Contour = { minutes: number; geometry: Polygon | MultiPolygon };
type Profiles = Record<string, Contour[]>;

export class WalkingView {
  enabled = true;
  private layer = L.featureGroup();
  private controller?: AbortController;
  private data?: { result: SearchResult; settings: Settings; manifest: Manifest; stops: Stop[] };
  private renderers: L.Renderer[] = [];
  private panes: HTMLElement[] = [];
  private pane: HTMLElement;

  constructor(private map: L.Map, private status: (text: string) => void, private ready: () => void, private progress?: (completed: number, total: number, failed: number) => void) {
    this.pane = map.createPane('walking-areas');
    this.pane.style.zIndex = '250'; this.pane.style.opacity = '.4'; this.pane.style.pointerEvents = 'none';
    this.layer.addTo(map);
  }

  private clear() {
    this.controller?.abort(); this.layer.clearLayers();
    for (const renderer of this.renderers) this.map.removeLayer(renderer);
    for (const pane of this.panes) pane.remove();
    this.renderers = []; this.panes = [];
  }
  reset() { this.clear(); this.data = undefined; }
  bounds() { const bounds = this.layer.getBounds(); return bounds.isValid() ? bounds : undefined; }
  setData(result: SearchResult, settings: Settings, manifest: Manifest, stops: Stop[]) {
    this.reset(); this.data = { result, settings, manifest, stops };
    void this.draw();
  }
  toggle(enabled: boolean) { this.enabled = enabled; this.clear(); void this.draw(); }

  private async draw() {
    if (!this.data || !this.enabled) { this.progress?.(0,0,0); this.status('Gångområden är dolda.'); return; }
    const { result, settings, manifest, stops } = this.data, areas = manifest.walkingAreas;
    if (!areas) { this.progress?.(0,0,0); this.status('Gångområden saknas i detta dataset.'); return; }
    const available = walkingMinutes(result.walkSources, settings.maxMinutes * 60, settings.walkMinutes * 60);
    const files = [...new Set([...available.keys()].map(i => areas.index[stops[i].id]).filter(i => i !== undefined))];
    if (!files.length) { this.progress?.(0,0,0); this.status('Inga gångområden finns för de nådda lägena. Gångtäckningen är ofullständig.'); return; }
    const controller = this.controller = new AbortController();
    // Fixed band order makes the fastest color win even when files arrive out of
    // order. All opaque canvases share one translucent parent, avoiding dark seams.
    const needed = new Map<string, { minutes: number; band: number; renderer: L.Renderer }[]>();
    for (let i = 0; i < Math.ceil(settings.maxMinutes / 10); i++) {
      const band = Math.min((i + 1) * 10, settings.maxMinutes);
      const name = `walking-band-${i}`, pane = this.map.createPane(name, this.pane);
      pane.style.zIndex = String(100 - i); this.panes.push(pane);
      const renderer = L.canvas({ pane: name, padding: .2 }); this.renderers.push(renderer);
      for (const [index, minutes] of walkingMinutes(result.walkSources, band * 60, settings.walkMinutes * 60)) {
        const id = stops[index].id, entries = needed.get(id) ?? [];
        // A contour repeated in a slower band adds no visible information.
        if (!entries.some(entry => entry.minutes === minutes)) entries.push({ minutes, band, renderer });
        needed.set(id, entries);
      }
    }
    const completed=new Set<number>(), failed=new Set<number>(), inFlight=new Set<number>();
    const requests=new Map<number,AbortController>();
    let wanted=new Set<number>(), queue:number[]=[];
    const positions=new Map<number,number[]>();
    for(const index of available.keys()){
      const file=areas.index[stops[index].id];
      if(file!==undefined)positions.set(file,[...(positions.get(file)??[]),index]);
    }
    const progress=()=>{
      if(controller.signal.aborted)return;
      const done=[...wanted].filter(f=>completed.has(f)).length;
      const failures=[...wanted].filter(f=>failed.has(f)).length;
      this.progress?.(done,wanted.size,failures);
      if(done<wanted.size)this.status(`Laddar och visar gångområden: ${done} av ${wanted.size} (${Math.floor(done/wanted.size*100)} %) i kartvyn${failures?` · ${failures} kunde inte laddas`:''}…`);
      else if(!wanted.size)this.status('Inga gångområden i denna kartvy. Flytta kartan till nådda hållplatser.');
      else {
        this.status(failures?`Gångområden visas delvis · ${failures} underlag kunde inte laddas. Slå av och på gångområden för att försöka igen.`:'Ungefärliga gångområden · ofullständig täckning. En färgad yta garanterar inte tillträde överallt.');
        this.ready();
      }
    };
    const pump=()=>{
      while(inFlight.size<6&&queue.length){
        const file=queue.shift()!;
        if(completed.has(file)||inFlight.has(file)||!wanted.has(file))continue;
        inFlight.add(file);
        const request=new AbortController();requests.set(file,request);
        const abort=()=>request.abort();controller.signal.addEventListener('abort',abort,{once:true});
        void (async()=>{
          try {
            const profiles=await loadJSON<Profiles>(areas.files[file],request.signal);
            if(request.signal.aborted)return;
            for(const [id,contours] of Object.entries(profiles)){
              for(const {minutes,band,renderer} of needed.get(id)??[]){
                const contour=contours.find(c=>c.minutes===minutes);
                if(contour)L.geoJSON(contour.geometry,{interactive:false,style:{renderer,stroke:false,fillOpacity:1,fillColor:colorFor(band*60,settings.maxMinutes)}}).addTo(this.layer);
              }
            }
          }catch{if(!request.signal.aborted)failed.add(file);}
          finally {
            controller.signal.removeEventListener('abort',abort);requests.delete(file);inFlight.delete(file);
            if(controller.signal.aborted)return;
            if(!request.signal.aborted)completed.add(file);
            else if(wanted.has(file)&&!queue.includes(file))queue.push(file);
            progress();
            // Paint a batch before requesting the next one. New map views take priority.
            await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
            if(!controller.signal.aborted)pump();
          }
        })();
      }
    };
    const updateView=()=>{
      if(controller.signal.aborted)return;
      // A source outside the viewport can still have a contour reaching into it.
      const bounds=this.map.getBounds(),d=(settings.walkMinutes*80+50)/111320;
      const lon=d/Math.max(.1,Math.cos(this.map.getCenter().lat*Math.PI/180));
      const expanded=L.latLngBounds([bounds.getSouth()-d,bounds.getWest()-lon],[bounds.getNorth()+d,bounds.getEast()+lon]);
      wanted=new Set(files.filter(file=>positions.get(file)?.some(i=>expanded.contains([stops[i].lat,stops[i].lon]))));
      for(const [file,request] of requests)if(!wanted.has(file))request.abort();
      queue=[...wanted].filter(f=>!completed.has(f)&&!inFlight.has(f)).sort((a,b)=>{
        const score=(file:number)=>Math.min(...positions.get(file)!.map(i=>this.map.distance(this.map.getCenter(),[stops[i].lat,stops[i].lon])));
        return score(a)-score(b);
      });
      progress();pump();
    };
    this.map.on('moveend zoomend resize',updateView);
    controller.signal.addEventListener('abort',()=>this.map.off('moveend zoomend resize',updateView),{once:true});
    updateView();
  }
}
