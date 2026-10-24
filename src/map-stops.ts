import type {Map,GeoJSONSource} from 'maplibre-gl';
import type {FeatureCollection,Point} from 'geojson';
import type {Stop} from './core/types';
import {lngLat} from './map';
type Style={color:string;fillColor:string;fillOpacity:number;weight:number;radius:number};
/** GPU circles and hit-testing; DOM targets retain keyboard access and labels. */
export class StopMarker {
 readonly element=document.createElement('button');
 visible=true;
 style:Style={color:'#52766e',fillColor:'#f5f6f0',fillOpacity:.9,weight:1.5,radius:5};
 constructor(readonly stop:Stop,readonly index:number,private owner:MapStops){
  this.element.type='button';this.element.className='map-stop';this.element.dataset.stopIndex=String(index);
  this.element.setAttribute('aria-label',stop.name+' · '+stop.platform);this.element.title=stop.name+' · '+stop.platform;
 }
 getElement(){return this.element;}
 setVisible(visible:boolean){this.visible=visible;this.element.style.display=visible?'':'none';this.owner.schedule();}
 setStyle(style:Partial<Style>){Object.assign(this.style,style);this.element.setAttribute('fill',this.style.fillColor);this.element.style.width=this.element.style.height=`${Math.max(14,this.style.radius*2)}px`;this.owner.schedule();return this;}
 on(event:string,fn:()=>void){this.element.addEventListener(event,fn);return this;}
 closeTooltip(){}
}
export class MapStops {
 private markers:StopMarker[]=[];private frame=0;
 constructor(private map:Map){
  map.addSource('stops',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'stops',type:'circle',source:'stops',paint:{'circle-radius':['get','radius'],'circle-color':['get','fillColor'],'circle-opacity':['get','fillOpacity'],'circle-stroke-color':['get','color'],'circle-stroke-width':['get','weight']}});
  // Invisible keyboard targets need positioning only after a gesture. Pointer
  // hit-testing uses the GPU source, so panning does no per-stop DOM work.
  map.on('moveend',()=>this.position());map.on('resize',()=>this.position());
 }
 add(stop:Stop,index:number){const marker=new StopMarker(stop,index,this);this.markers.push(marker);this.map.getCanvasContainer().append(marker.element);this.schedule();return marker;}
 schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>this.flush());}
 private position(){
  const map=this.map,w=map.getContainer().clientWidth,h=map.getContainer().clientHeight;
  for(const marker of this.markers){if(!marker.visible)continue;const p=map.project(lngLat(marker.stop));const inView=p.x>=-20&&p.y>=-20&&p.x<=w+20&&p.y<=h+20;
   const transform=`translate(${inView?p.x:-100}px,${inView?p.y:-100}px) translate(-50%,-50%)`;
   if(marker.element.style.transform!==transform)marker.element.style.transform=transform;
  }
 }
 private flush(){this.frame=0;
  const data:FeatureCollection<Point>={type:'FeatureCollection',features:this.markers.filter(m=>m.visible).map(m=>({type:'Feature',geometry:{type:'Point',coordinates:lngLat(m.stop)},properties:{index:m.index,...m.style}}))};
  (this.map.getSource('stops') as GeoJSONSource).setData(data);this.position();
 }
}

export function hitStop(map:Map,point:{x:number;y:number}):number|undefined {
 if(!map.getLayer('stops'))return;
 const hit=map.queryRenderedFeatures([point.x,point.y],{layers:['stops']})[0];
 return hit?Number(hit.properties.index):undefined;
}
