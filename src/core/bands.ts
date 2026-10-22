import type {Polygon,MultiPolygon} from 'geojson';
import {colorFor} from './settings';
export type AreaGeometry=Polygon|MultiPolygon;
export interface AreaBand {minutes:number;geometries:AreaGeometry[]}
export type ClipBounds=[number,number,number,number];
export interface RasterGrid {width:number;height:number;bounds:ClipBounds}

export function bandLimits(maxMinutes:number,cutoff=maxMinutes):number[]{
 const limit=Math.min(maxMinutes,Math.max(1,Math.floor(cutoff)));
 return Array.from({length:Math.ceil(limit/10)},(_,i)=>Math.min((i+1)*10,limit));
}
const mercator=(latitude:number)=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360));
/** Rasterize the existing contour, without buffering, hulls or invented links.
 * Scanline pairs include all rings, so holes stay empty and overlapping stops
 * union naturally. Sampling is at display-pixel centres, not a new travel model. */
export function contourRuns(geometry:AreaGeometry,grid:RasterGrid):Uint32Array{
 const {width,height,bounds:[west,south,east,north]}=grid;
 const top=mercator(north),sx=width/(east-west),sy=height/(top-mercator(south));
 const project=(p:number[])=>[(p[0]-west)*sx,(top-mercator(p[1]))*sy];
 const result:number[]=[];
 type Edge={end:number;x:number;step:number};
 for(const polygon of geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates){
  const buckets=new Map<number,Edge[]>();let first=height,last=0;
  for(const ring of polygon)for(let i=1;i<ring.length;i++){
   let [ax,ay]=project(ring[i-1]),[bx,by]=project(ring[i]);
   if(ay===by)continue;if(ay>by){[ax,bx]=[bx,ax];[ay,by]=[by,ay];}
   const start=Math.max(0,Math.ceil(ay-.5)),end=Math.min(height,Math.ceil(by-.5));
   if(start>=end)continue;
   const step=(bx-ax)/(by-ay),edge={end,x:ax+(start+.5-ay)*step,step};
   const bucket=buckets.get(start)??[];bucket.push(edge);buckets.set(start,bucket);
   first=Math.min(first,start);last=Math.max(last,end);
  }
  let active:Edge[]=[];
  for(let row=first;row<last;row++){
   active=active.filter(edge=>edge.end>row);active.push(...(buckets.get(row)??[]));
   const xs=active.map(edge=>edge.x).sort((a,b)=>a-b);
   for(let i=0;i+1<xs.length;i+=2){
    const start=Math.max(0,Math.ceil(xs[i]-.5)),end=Math.min(width,Math.ceil(xs[i+1]-.5));
    if(end>start)result.push(row*width+start,row*width+end);
   }
   for(const edge of active)edge.x+=edge.step;
  }
 }
 return new Uint32Array(result);
}

export function rasterBands(bands:AreaBand[],grid:RasterGrid):Uint8Array{
 const field=new Uint8Array(grid.width*grid.height),earliest=new Map<AreaGeometry,number>();
 for(const band of bands)for(const geometry of band.geometries)earliest.set(geometry,Math.min(band.minutes,earliest.get(geometry)??Infinity));
 // Slower areas first, so overlapping stops always keep the fastest colour.
 for(const [geometry,minutes] of [...earliest].sort((a,b)=>b[1]-a[1])){
  const runs=contourRuns(geometry,grid);
  for(let i=0;i<runs.length;i+=2)field.fill(minutes,runs[i],runs[i+1]);
 }
 return field;
}

export function paintBands(field:Uint8Array,grid:RasterGrid,maxMinutes:number,cutoff:number,partial?:Uint8Array):Uint8ClampedArray{
 const visible=new Uint8Array(field.length),rgba=new Uint8ClampedArray(field.length*4);
 const lower=Math.floor(cutoff/10)*10;
 for(let i=0;i<field.length;i++){
  const value=field[i];
  visible[i]=partial?(value&&value<=lower?value:partial[i]?cutoff:0):(value<=cutoff?value:0);
 }
 const colors=Array.from({length:maxMinutes+1},(_,n)=>colorFor(n*60,maxMinutes).slice(1).match(/../g)!.map(v=>parseInt(v,16)));
 const {width,height}=grid;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,value=visible[i];if(!value)continue;
  const border=(x>0&&visible[i-1]!==value)||(x<width-1&&visible[i+1]!==value)||(y>0&&visible[i-width]!==value)||(y<height-1&&visible[i+width]!==value);
  const color=border?[255,255,255]:colors[value];
  rgba.set(color,i*4);rgba[i*4+3]=border?235:255;
 }
 return rgba;
}
