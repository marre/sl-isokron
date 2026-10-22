/** Research implementations. Production routing and rendering do not import this file. */
import {contourRuns,type AreaGeometry,type RasterGrid} from '../../src/core/bands';
export interface Contour {minutes:number;geometry:AreaGeometry}
export interface Packed {xy:Float64Array|Int32Array;scale:number;rings:Uint32Array;polygons:Uint32Array}
export function pack(geometry:AreaGeometry):ArrayBuffer{
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 const rings=polygons.flat(),points=rings.flat(),header=16+(rings.length+1+polygons.length+1)*4,offset=Math.ceil(header/8)*8;
 const buffer=new ArrayBuffer(offset+points.length*16),v=new DataView(buffer);
 [0x534c5031,points.length,rings.length,polygons.length].forEach((n,i)=>v.setUint32(i*4,n,true));
 const ringOffsets=new Uint32Array(buffer,16,rings.length+1),polyOffsets=new Uint32Array(buffer,16+ringOffsets.byteLength,polygons.length+1);
 let n=0;rings.forEach((r,i)=>{ringOffsets[i]=n;n+=r.length});ringOffsets[rings.length]=n;
 n=0;polygons.forEach((p,i)=>{polyOffsets[i]=n;n+=p.length});polyOffsets[polygons.length]=n;
 const xy=new Float64Array(buffer,offset);points.forEach((p,i)=>{xy[i*2]=p[0];xy[i*2+1]=p[1]});return buffer;
}
export function unpack(buffer:ArrayBuffer,base=0,length=buffer.byteLength-base):Packed{
 const v=new DataView(buffer,base,length),magic=v.getUint32(0,true);if(magic!==0x534c5031&&magic!==0x534c5131)throw new Error('Invalid packed contour');
 const fixed=magic===0x534c5131;
 const points=v.getUint32(4,true),rings=v.getUint32(8,true),polygons=v.getUint32(12,true),offset=Math.ceil((16+(rings+polygons+2)*4)/8)*8;
 if(length!==offset+points*(fixed?8:16))throw new Error('Invalid packed contour length');
 return {xy:fixed?new Int32Array(buffer,base+offset,points*2):new Float64Array(buffer,base+offset,points*2),scale:fixed?1e6:1,rings:new Uint32Array(buffer,base+16,rings+1),polygons:new Uint32Array(buffer,base+16+(rings+1)*4,polygons+1)};
}
const mercator=(latitude:number)=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360));
/** Same pixel-centre, even-odd scan conversion as the production renderer. */
export function packedRuns(g:Packed,grid:RasterGrid):Uint32Array{
 const {width,height,bounds:[west,south,east,north]}=grid,top=mercator(north),sx=width/(east-west),sy=height/(top-mercator(south));
 const scale=g.scale;
 const result:number[]=[];type Edge={end:number;x:number;step:number};
 for(let p=1;p<g.polygons.length;p++){
  const buckets=new Map<number,Edge[]>();let first=height,last=0;
  for(let r=g.polygons[p-1];r<g.polygons[p];r++)for(let i=g.rings[r]+1;i<g.rings[r+1];i++){
   let ax=(g.xy[(i-1)*2]/scale-west)*sx,ay=(top-mercator(g.xy[(i-1)*2+1]/scale))*sy,bx=(g.xy[i*2]/scale-west)*sx,by=(top-mercator(g.xy[i*2+1]/scale))*sy;
   if(ay===by)continue;if(ay>by){[ax,bx]=[bx,ax];[ay,by]=[by,ay]}
   const start=Math.max(0,Math.ceil(ay-.5)),end=Math.min(height,Math.ceil(by-.5));if(start>=end)continue;
   const step=(bx-ax)/(by-ay),edge={end,x:ax+(start+.5-ay)*step,step};
   const bucket=buckets.get(start)??[];bucket.push(edge);buckets.set(start,bucket);first=Math.min(first,start);last=Math.max(last,end);
  }
  let active:Edge[]=[];
  for(let row=first;row<last;row++){
   active=active.filter(e=>e.end>row);active.push(...(buckets.get(row)??[]));const xs=active.map(e=>e.x).sort((a,b)=>a-b);
   for(let i=0;i+1<xs.length;i+=2){const start=Math.max(0,Math.ceil(xs[i]-.5)),end=Math.min(width,Math.ceil(xs[i+1]-.5));if(end>start)result.push(row*width+start,row*width+end)}
   for(const e of active)e.x+=e.step;
  }
 }
 return new Uint32Array(result);
}
/** A 30-bit membership mask retains non-nested contours at each sampled cell. */
export function precompute(contours:Contour[],grid:RasterGrid):Uint32Array{
 const masks=new Uint32Array(grid.width*grid.height);
 for(const c of contours){const bit=1<<(c.minutes-1),runs=contourRuns(c.geometry,grid);for(let i=0;i<runs.length;i+=2)for(let p=runs[i];p<runs[i+1];p++)masks[p]|=bit}
 return masks;
}
export function encodeRuns(values:Uint32Array):Uint32Array{
 const out:number[]=[];for(let i=0;i<values.length;){const start=i,value=values[i++];while(i<values.length&&values[i]===value)i++;if(value)out.push(start,i-start,value)}return new Uint32Array(out);
}
export function firstMinute(mask:number):number{return mask?32-Math.clz32(mask&-mask):0}
export function nested(mask:number):boolean{const first=firstMinute(mask);return !mask||mask===((0x3fffffff<<first-1)&0x3fffffff)}
export function compose(runs:Uint32Array,allowances:{minutes:number;walking:number}[],field:Uint8Array,earliestOnly=false){
 for(let i=0;i<runs.length;i+=3){
  const mask=runs[i+2],first=firstMinute(mask),band=allowances.find(b=>earliestOnly?first<=b.walking:!!(mask&(1<<b.walking-1)))?.minutes;
  if(band===undefined)continue;
  for(let p=runs[i],end=p+runs[i+1];p<end;p++)if(!field[p]||band<field[p])field[p]=band;
 }
}
export const world=(lon:number,lat:number):[number,number]=>[lon*Math.PI/180*6378137,mercator(lat)*6378137];
export const geographic=(x:number,y:number):[number,number]=>[x/6378137*180/Math.PI,(2*Math.atan(Math.exp(y/6378137))-Math.PI/2)*180/Math.PI];
/** Globally aligned 64-cell tiles; resolution in ground metres at latitude 59.335. */
export function tileGrid(bounds:RasterGrid['bounds'],metres:number){
 const step=metres/Math.cos(59.335*Math.PI/180),[west,south]=world(bounds[0],bounds[1]),[east,north]=world(bounds[2],bounds[3]),span=step*64;
 const x0=Math.floor(west/span),x1=Math.ceil(east/span),y0=Math.floor(south/span),y1=Math.ceil(north/span);
 const a=geographic(x0*span,y0*span),b=geographic(x1*span,y1*span);
 return {grid:{width:(x1-x0)*64,height:(y1-y0)*64,bounds:[a[0],a[1],b[0],b[1]] as RasterGrid['bounds']},x0,y0,x1,y1,step};
}
export function sample(field:Uint8Array,from:RasterGrid,to:RasterGrid):Uint8Array{
 const out=new Uint8Array(to.width*to.height),nw=world(from.bounds[0],from.bounds[3]),se=world(from.bounds[2],from.bounds[1]),a=world(to.bounds[0],to.bounds[3]),b=world(to.bounds[2],to.bounds[1]);
 for(let y=0;y<to.height;y++){const fy=Math.floor((nw[1]-(a[1]+(y+.5)*(b[1]-a[1])/to.height))/(nw[1]-se[1])*from.height);if(fy<0||fy>=from.height)continue;
  for(let x=0;x<to.width;x++){const fx=Math.floor(((a[0]+(x+.5)*(b[0]-a[0])/to.width)-nw[0])/(se[0]-nw[0])*from.width);if(fx>=0&&fx<from.width)out[y*to.width+x]=field[fy*from.width+fx]}
 }return out;
}
export interface Tile {x:number;y:number;runs:Uint32Array}
export function tiles(masks:Uint32Array,grid:RasterGrid):Tile[]{
 const buckets=new Map<number,Uint32Array>(),columns=grid.width/64;
 for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const mask=masks[y*grid.width+x];if(!mask)continue;const key=Math.floor(y/64)*columns+Math.floor(x/64);
  let tile=buckets.get(key);if(!tile){tile=new Uint32Array(4096);buckets.set(key,tile)}tile[(y%64)*64+x%64]=mask;
 }
 return [...buckets].map(([key,tile])=>({x:key%columns,y:Math.floor(key/columns),runs:encodeRuns(tile)}));
}
export function composeTiles(parts:Tile[],allowances:{minutes:number;walking:number}[],field:Uint8Array,width:number,earliestOnly=false){
 for(const tile of parts)for(let i=0;i<tile.runs.length;i+=3){
  const mask=tile.runs[i+2],first=firstMinute(mask),band=allowances.find(b=>earliestOnly?first<=b.walking:!!(mask&(1<<b.walking-1)))?.minutes;
  if(band===undefined)continue;
  for(let p=tile.runs[i],end=p+tile.runs[i+1];p<end;){
   const length=Math.min(end-p,64-p%64),start=(tile.y*64+Math.floor(p/64))*width+tile.x*64+p%64;
   for(let q=start;q<start+length;q++)if(!field[q]||band<field[q])field[q]=band;p+=length;
  }
 }
}
export function archive(directory:unknown,chunks:ArrayBuffer[]):ArrayBuffer{
 const text=new TextEncoder().encode(JSON.stringify(directory)),offset=Math.ceil((8+text.length)/8)*8,buffer=new ArrayBuffer(offset+chunks.reduce((n,b)=>n+b.byteLength,0));
 const view=new DataView(buffer);view.setUint32(0,0x534c4131,true);view.setUint32(4,text.length,true);new Uint8Array(buffer,8,text.length).set(text);let at=offset;
 for(const chunk of chunks){new Uint8Array(buffer,at,chunk.byteLength).set(new Uint8Array(chunk));at+=chunk.byteLength}return buffer;
}
export function openArchive<T>(buffer:ArrayBuffer):{directory:T;offset:number}{
 const v=new DataView(buffer);if(v.getUint32(0,true)!==0x534c4131)throw new Error('Invalid archive');const length=v.getUint32(4,true);
 return {directory:JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,length))),offset:Math.ceil((8+length)/8)*8};
}

/** Lossless for native six-decimal coordinates; Float64 fallback otherwise. */
export function packFixed(geometry:AreaGeometry):ArrayBuffer{
 const original=pack(geometry),g=unpack(original);
 for(const coordinate of g.xy)if(coordinate!==Math.round(coordinate*1e6)/1e6)return original;
 const offset=Math.ceil((16+(g.rings.length+g.polygons.length)*4)/8)*8;
 const buffer=new ArrayBuffer(offset+g.xy.length*4);new Uint8Array(buffer,0,offset).set(new Uint8Array(original,0,offset));
 new DataView(buffer).setUint32(0,0x534c5131,true);const xy=new Int32Array(buffer,offset,g.xy.length);
 for(let i=0;i<xy.length;i++)xy[i]=Math.round(g.xy[i]*1e6);return buffer;
}
