import {profileStart,profileEnd} from './profile';
import type {AreaGeometry,RasterGrid} from './bands';
export interface PackedGeometry {type:'Packed';xy:Float64Array|Int32Array;scale:number;rings:Uint32Array;polygons:Uint32Array}
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
export function unpack(buffer:ArrayBuffer,base=0,length=buffer.byteLength-base):PackedGeometry{
 if(base%8||length<24||base<0||length>buffer.byteLength-base)throw new Error('Invalid contour range');
 const v=new DataView(buffer,base,length),magic=v.getUint32(0,true);if(magic!==0x534c5031&&magic!==0x534c5131)throw new Error('Invalid packed contour');
 const fixed=magic===0x534c5131;
 const points=v.getUint32(4,true),rings=v.getUint32(8,true),polygons=v.getUint32(12,true),offset=Math.ceil((16+(rings+polygons+2)*4)/8)*8;
 if(length!==offset+points*(fixed?8:16))throw new Error('Invalid packed contour length');
 const geometry:PackedGeometry={type:'Packed',xy:fixed?new Int32Array(buffer,base+offset,points*2):new Float64Array(buffer,base+offset,points*2),scale:fixed?1e6:1,rings:new Uint32Array(buffer,base+16,rings+1),polygons:new Uint32Array(buffer,base+16+(rings+1)*4,polygons+1)};
 validate(geometry);return geometry;
}
const mercator=(latitude:number)=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360));
/** Same pixel-centre, even-odd scan conversion as the production renderer. */
export function packedRuns(g:PackedGeometry,grid:RasterGrid):Uint32Array{
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
export function archive(directory:unknown,chunks:ArrayBuffer[]):ArrayBuffer{
 const text=new TextEncoder().encode(JSON.stringify(directory)),offset=Math.ceil((8+text.length)/8)*8,buffer=new ArrayBuffer(offset+chunks.reduce((n,b)=>n+b.byteLength,0));
 const view=new DataView(buffer);view.setUint32(0,0x534c4131,true);view.setUint32(4,text.length,true);new Uint8Array(buffer,8,text.length).set(text);let at=offset;
 for(const chunk of chunks){new Uint8Array(buffer,at,chunk.byteLength).set(new Uint8Array(chunk));at+=chunk.byteLength}return buffer;
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

export type Profiles=Record<string,{minutes:number;geometry:PackedGeometry}[]>;
function validate(g:PackedGeometry){
 const check=(a:Uint32Array,end:number,min:number)=>{if(a[0]!==0||a[a.length-1]!==end)throw new Error('Invalid contour offsets');for(let i=1;i<a.length;i++)if(a[i]<a[i-1]+min)throw new Error('Invalid contour offsets')};
 check(g.rings,g.xy.length/2,4);check(g.polygons,g.rings.length-1,0);
 for(let i=0;i<g.xy.length;i++){const v=g.xy[i]/g.scale;if(!Number.isFinite(v)||Math.abs(v)>(i%2?90:180))throw new Error('Invalid coordinate')}
 for(let r=1;r<g.rings.length;r++){const a=g.rings[r-1]*2,b=(g.rings[r]-1)*2;if(g.xy[a]!==g.xy[b]||g.xy[a+1]!==g.xy[b+1])throw new Error('Unclosed contour')}
}
export function decodeProfiles(buffer:ArrayBuffer):Profiles{
 if(buffer.byteLength<8)throw new Error('Invalid contour archive');
 const view=new DataView(buffer);if(view.getUint32(0,true)!==0x534c4131)throw new Error('Invalid contour archive');
 const length=view.getUint32(4,true),base=Math.ceil((8+length)/8)*8;
 if(base>buffer.byteLength)throw new Error('Truncated contour directory');
 const directory:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buffer,8,length)));
 if(!directory||typeof directory!=='object'||Array.isArray(directory))throw new Error('Invalid directory');
 const result:Profiles=Object.create(null);let end=0;
 for(const [id,entries] of Object.entries(directory)){
  if(!Array.isArray(entries))throw new Error('Invalid contours');const seen=new Set<number>();
  result[id]=entries.map(e=>{
   if(!e||!Number.isInteger(e.minutes)||e.minutes<1||e.minutes>30||seen.has(e.minutes)||!Number.isSafeInteger(e.offset)||e.offset!==end||!Number.isSafeInteger(e.length)||e.length<24||e.length%8)throw new Error('Invalid contour entry');
   seen.add(e.minutes);const geometry=unpack(buffer,base+e.offset,e.length);end+=e.length;return {minutes:e.minutes,geometry};
  });
 }
 if(base+end!==buffer.byteLength)throw new Error('Trailing contour data');return result;
}
export function legacyProfiles(buffer:ArrayBuffer):Profiles{
 const native=JSON.parse(new TextDecoder().decode(buffer)),result:Profiles=Object.create(null);
 for(const [id,entries] of Object.entries(native) as [string,{minutes:number;geometry:AreaGeometry}[]][])result[id]=entries.map(e=>({minutes:e.minutes,geometry:unpack(packFixed(e.geometry))}));
 return result;
}

/** Explicit delivery compression also works on hosts that do not compress .bin. */
export async function deliveryProfiles(bytes:ArrayBuffer):Promise<Profiles>{
 const magic=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
 if(magic[0]===31&&magic[1]===139){
  const start=profileStart();
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  bytes=await new Response(stream).arrayBuffer();profileEnd('contour.inflate',start,{bytes:bytes.byteLength});
 }
 const start=profileStart(),result=decodeProfiles(bytes);profileEnd('contour.decode',start,{bytes:bytes.byteLength});return result;
}
