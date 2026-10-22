import {BandRaster,rasterBands,paintBands,type AreaBand,type AreaGeometry,type RasterGrid} from './core/bands';
let version='',generation=-1,raster:BandRaster|undefined;
const geometries=new Map<number,AreaGeometry>(),partials=new Map<number,Uint8Array>(),retained=new Set<number>();
interface Job {version:string;view:number;generation:number;cutoff:number;maxMinutes:number;bands:{minutes:number;geometries:number[]}[];additions:{id:number;geometry:AreaGeometry}[];grid:RasterGrid}
self.onmessage=({data}:MessageEvent<Job>)=>{
 try{
  if(generation!==data.generation){
   geometries.clear();partials.clear();retained.clear();raster=new BandRaster(data.grid);generation=data.generation;version='';
  }
  for(const band of data.bands)if(band.minutes%10===0||band.minutes===data.maxMinutes)for(const id of band.geometries)retained.add(id);
  for(const addition of data.additions)geometries.set(addition.id,addition.geometry);
  const bands:AreaBand[]=data.bands.map(b=>({minutes:b.minutes,geometries:b.geometries.map(id=>{
   const geometry=geometries.get(id);if(!geometry)throw new Error('Missing contour');return geometry;
  })}));
  if(version!==data.version){
   raster!.add(bands.filter(b=>b.minutes%10===0||b.minutes===data.maxMinutes));
   partials.clear();version=data.version;
  }
  const partial=data.cutoff%10!==0&&data.cutoff!==data.maxMinutes;
  if(partial&&!partials.has(data.cutoff)){
   partials.set(data.cutoff,rasterBands(bands.filter(b=>b.minutes===data.cutoff),data.grid));
   while(partials.size>3)partials.delete(partials.keys().next().value!);
  }
  // Partial-cutoff masks are bounded; their source geometry need not stay in memory.
  for(const id of geometries.keys())if(!retained.has(id))geometries.delete(id);
  const pixels=paintBands(raster!.field,data.grid,data.maxMinutes,data.cutoff,partial?partials.get(data.cutoff):undefined);
  let x0=data.grid.width,y0=data.grid.height,x1=0,y1=0;
  for(let i=0;i<raster!.field.length;i++)if(pixels[i*4+3]){const x=i%data.grid.width,y=Math.floor(i/data.grid.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
  const extent=x1>x0?[x0,y0,x1,y1]:undefined;
  (self as unknown as {postMessage(value:unknown,transfer:Transferable[]):void}).postMessage({version,view:data.view,cutoff:data.cutoff,width:data.grid.width,height:data.grid.height,pixels,extent,cachedCutoffs:[...partials.keys()]},[pixels.buffer]);
 }catch{version='';generation=-1;raster=undefined;geometries.clear();partials.clear();retained.clear();self.postMessage({version:data.version,view:data.view,error:true});}
};
