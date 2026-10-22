import {rasterBands,paintBands,type AreaBand,type RasterGrid} from './core/bands';
let version='',field:Uint8Array|undefined;
const partials=new Map<number,Uint8Array>();
self.onmessage=({data}:MessageEvent<{version:string;view:number;cutoff:number;maxMinutes:number;bands:AreaBand[];grid:RasterGrid}>)=>{
 try{
  if(version!==data.version){
   const next=rasterBands(data.bands.filter(b=>b.minutes%10===0||b.minutes===data.maxMinutes),data.grid);
   partials.clear();version=data.version;field=next;
  }
  const partial=data.cutoff%10!==0&&data.cutoff!==data.maxMinutes;
  if(partial&&!partials.has(data.cutoff)){
   partials.set(data.cutoff,rasterBands(data.bands.filter(b=>b.minutes===data.cutoff),data.grid));
   while(partials.size>3)partials.delete(partials.keys().next().value!);
  }
  const pixels=paintBands(field!,data.grid,data.maxMinutes,data.cutoff,partial?partials.get(data.cutoff):undefined);
  let x0=data.grid.width,y0=data.grid.height,x1=0,y1=0;
  for(let i=0;i<field!.length;i++)if(pixels[i*4+3]){const x=i%data.grid.width,y=Math.floor(i/data.grid.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
  const extent=x1>x0?[x0,y0,x1,y1]:undefined;
  (self as unknown as {postMessage(value:unknown,transfer:Transferable[]):void}).postMessage({version,view:data.view,cutoff:data.cutoff,width:data.grid.width,height:data.grid.height,pixels,extent,cachedCutoffs:[...partials.keys()]},[pixels.buffer]);
 }catch{version='';field=undefined;partials.clear();self.postMessage({version:data.version,view:data.view,error:true});}
};
