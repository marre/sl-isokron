import type {Map,GeoJSONSource,MapGeoJSONFeature} from 'maplibre-gl';
import type {FeatureCollection,Point} from 'geojson';
import type {Stop} from './core/types';
import {lngLat} from './map';
type Style={color:string;fillColor:string;fillOpacity:number;weight:number;radius:number};
const KEYBOARD_LIMIT=128,CLUSTER_THRESHOLD=500;
/** A stop's keyboard target can remain detached; pointers use GPU hit-testing. */
export class StopMarker {
 private element?:HTMLButtonElement;
 visible=true;
 style:Style={color:'#52766e',fillColor:'#f5f6f0',fillOpacity:.9,weight:1.5,radius:5};
 constructor(readonly stop:Stop,readonly index:number,private owner:MapStops){}
 getElement(){
  if(!this.element){
   const el=this.element=document.createElement('button');el.type='button';el.className='map-stop';el.dataset.stopIndex=String(this.index);
   el.setAttribute('aria-label',this.stop.name+' · '+this.stop.platform);el.title=this.stop.name+' · '+this.stop.platform;
   this.updateElement();
  }return this.element;
 }
 releaseElement(){this.element?.remove();this.element=undefined;}
 private updateElement(){if(!this.element)return;this.element.style.display=this.visible?'':'none';this.element.setAttribute('fill',this.style.fillColor);this.element.style.width=this.element.style.height=`${Math.max(14,this.style.radius*2)}px`;}

 setVisible(visible:boolean){if(this.visible===visible)return;this.visible=visible;this.updateElement();this.owner.schedule();}
 setStyle(style:Partial<Style>){
  const changed=Object.entries(style).some(([key,value])=>this.style[key as keyof Style]!==value);
  if(!changed)return this;
  const dataChanged=style.fillColor!==undefined&&style.fillColor!==this.style.fillColor||style.fillOpacity!==undefined&&style.fillOpacity!==this.style.fillOpacity;
  Object.assign(this.style,style);
  this.updateElement();
  if(dataChanged)this.owner.schedule();else this.owner.highlight(this);
  return this;
 }
 closeTooltip(){}
}
/** Geometry changes only for reachability/colours. Hover uses feature state.
 * Dense overview maps cluster in MapLibre's worker; keyboard DOM stays bounded. */
export class MapStops {
 private markers:StopMarker[]=[];private byIndex=new globalThis.Map<number,StopMarker>();private frame=0;private keyboardFrame=0;
 private mounted=new Set<HTMLElement>();private clusters=new globalThis.Map<number,HTMLButtonElement>();private clustered=false;
 constructor(private map:Map){
  map.addSource('stops',{type:'geojson',cluster:false,clusterRadius:40,clusterMaxZoom:10,data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'stop-clusters',type:'circle',source:'stops',filter:['has','point_count'],paint:{'circle-radius':20,'circle-color':'#183e36','circle-stroke-width':2,'circle-stroke-color':'#fff'}});
  // Count labels use small local sprite images, requiring no glyph-server request.
  map.setMissingStyleImageResolver(id=>{
   if(!/^stop-count-[0-9.km]+$/i.test(id)||map.hasImage(id))return;
   const canvas=document.createElement('canvas');canvas.width=80;canvas.height=64;
   const context=canvas.getContext('2d')!;context.font='bold 24px sans-serif';context.fillStyle='#fff';context.textAlign='center';context.textBaseline='middle';context.fillText(id.slice(11),40,33);
   map.addImage(id,context.getImageData(0,0,80,64),{pixelRatio:2});
  });
  map.addLayer({id:'stop-cluster-count',type:'symbol',source:'stops',filter:['has','point_count'],layout:{'icon-image':['concat','stop-count-',['to-string',['get','point_count_abbreviated']]],'icon-allow-overlap':true,'icon-ignore-placement':true}});
  map.addLayer({id:'stops',type:'circle',source:'stops',filter:['!', ['has','point_count']],paint:{'circle-radius':['coalesce',['feature-state','radius'],['get','radius']],'circle-color':['get','fillColor'],'circle-opacity':['get','fillOpacity'],'circle-stroke-color':['coalesce',['feature-state','color'],['get','color']],'circle-stroke-width':['coalesce',['feature-state','weight'],['get','weight']]}});
  map.on('moveend',()=>this.scheduleKeyboard());map.on('resize',()=>this.scheduleKeyboard());
  map.on('sourcedata',e=>{if(e.sourceId==='stops'&&e.isSourceLoaded)this.scheduleKeyboard();});
 }
 add(stop:Stop,index:number){const marker=new StopMarker(stop,index,this);this.markers.push(marker);this.byIndex.set(index,marker);this.schedule();return marker;}
 schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>this.flush());}
 highlight(marker:StopMarker){this.map.setFeatureState({source:'stops',id:marker.index},{radius:marker.style.radius,color:marker.style.color,weight:marker.style.weight});}
 private scheduleKeyboard(){if(!this.keyboardFrame)this.keyboardFrame=requestAnimationFrame(()=>{this.keyboardFrame=0;this.position();});}
 private position(){
  const map=this.map,w=map.getContainer().clientWidth,h=map.getContainer().clientHeight;
  const targets:{marker?:StopMarker;feature?:MapGeoJSONFeature;coordinates:number[];score:number}[]=[];
  const focused=(document.activeElement as HTMLElement|null)?.dataset.stopIndex;
  const seen=new Set<string>();
  if(this.markers.length<=KEYBOARD_LIMIT){
   for(const marker of this.markers)if(marker.visible)targets.push({marker,coordinates:lngLat(marker.stop),score:0});
  }else for(const feature of map.queryRenderedFeatures({layers:['stops','stop-clusters']})){
   if(feature.geometry.type!=='Point')continue;
   const cluster=feature.properties.cluster_id,key=cluster===undefined?'s'+feature.id:'c'+cluster;
   if(seen.has(key))continue;seen.add(key);
   const coordinates=feature.geometry.coordinates,p=map.project(coordinates as [number,number]);
   if(p.x<0||p.y<0||p.x>w||p.y>h)continue;
   const marker=cluster===undefined?this.byIndex.get(Number(feature.id)):undefined;
   if(marker||cluster!==undefined)targets.push({marker,feature:cluster===undefined?undefined:feature,coordinates,score:marker&&String(marker.index)===focused?-1:(p.x-w/2)**2+(p.y-h/2)**2});
  }
  targets.sort((a,b)=>a.score-b.score);
  const next=new Set<HTMLElement>();
  for(const {marker,feature,coordinates} of targets.slice(0,KEYBOARD_LIMIT)){
   let element:HTMLElement;
   if(marker)element=marker.getElement();
   else{
    const id=feature!.properties.cluster_id;
    let button=this.clusters.get(id);
    if(!button){button=document.createElement('button');button.type='button';button.className='map-stop map-stop-cluster';button.setAttribute('aria-label',`${feature!.properties.point_count} hållplatslägen. Zooma in.`);button.onclick=e=>{e.stopPropagation();void this.expandCluster(feature!);};this.clusters.set(id,button);}
    element=button;
   }
   const p=map.project(coordinates as [number,number]);
   element.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
   next.add(element);if(!this.mounted.has(element))map.getCanvasContainer().append(element);
  }
  for(const element of this.mounted)if(!next.has(element)){
   const index=element.dataset.stopIndex;if(index!==undefined)this.byIndex.get(Number(index))?.releaseElement();else element.remove();
  }
  this.mounted=next;
  for(const [id,button] of this.clusters)if(!next.has(button))this.clusters.delete(id);
 }
 async expandCluster(feature:MapGeoJSONFeature){
  try{const zoom=await(this.map.getSource('stops') as GeoJSONSource).getClusterExpansionZoom(feature.properties.cluster_id);
   if(feature.geometry.type==='Point')this.map.easeTo({center:feature.geometry.coordinates as [number,number],zoom:Math.max(this.map.getZoom()+1,zoom),duration:300});
  }catch{/* A new search may replace the cluster while its expansion is pending. */}
 }
 private flush(){this.frame=0;
  const visible=this.markers.filter(m=>m.visible),clustered=visible.length>=CLUSTER_THRESHOLD;
  const source=this.map.getSource('stops') as GeoJSONSource;
  if(clustered!==this.clustered){this.clustered=clustered;source.setClusterOptions({cluster:clustered});}
  const data:FeatureCollection<Point>={type:'FeatureCollection',features:visible.map(m=>({type:'Feature',id:m.index,geometry:{type:'Point',coordinates:lngLat(m.stop)},properties:{index:m.index,...m.style}}))};
  // Bulk data carries the current complete style; discard old hover overrides.
  this.map.removeFeatureState({source:'stops'});
  source.setData(data);this.scheduleKeyboard();
 }
}
export function hitCluster(map:Map,point:{x:number;y:number}){return map.getLayer('stop-clusters')?map.queryRenderedFeatures([point.x,point.y],{layers:['stop-clusters']})[0]:undefined;}
export function hitStop(map:Map,point:{x:number;y:number}):number|undefined {
 if(!map.getLayer('stops'))return;
 const hit=map.queryRenderedFeatures([point.x,point.y],{layers:['stops']})[0];
 return hit?Number(hit.properties.index):undefined;
}
