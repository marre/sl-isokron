/** Display adapters for recorded result rasters; not pedestrian-network routing. */
import {contourRuns,type RasterGrid} from '../../src/core/bands';import {world,geographic} from './algorithms';
export interface H3Api {polygonToCells:(polygon:number[][],resolution:number)=>string[];cellToBoundary:(id:string)=>number[][];cellToLatLng:(id:string)=>number[];cellArea:(id:string,unit:string)=>number}
export function h3Mapping(h3:H3Api,grid:RasterGrid,resolution:number,recordIds=false){
 const [w,s,e,n]=grid.bounds,delta=250/111320,lon=delta/Math.cos(n*Math.PI/180),ids=h3.polygonToCells([[s-delta,w-lon],[s-delta,e+lon],[n+delta,e+lon],[n+delta,w-lon]],resolution),owner=new Uint32Array(grid.width*grid.height),samples:number[]=[],areas:number[]=[],cellIds:string[]=[];let used=0,clamped=0;
 const nw=world(w,n),se=world(e,s);
 for(const id of ids){
  const boundary=h3.cellToBoundary(id).map(([lat,lon])=>[lon,lat]);boundary.push(boundary[0]);const runs=contourRuns({type:'Polygon',coordinates:[boundary]},grid);if(!runs.length)continue;
  const [lat,lon]=h3.cellToLatLng(id),p=world(lon,lat),x=Math.floor((p[0]-nw[0])/(se[0]-nw[0])*grid.width),y=Math.floor((nw[1]-p[1])/(nw[1]-se[1])*grid.height);
  if(x<0||x>=grid.width||y<0||y>=grid.height)clamped++;
  samples.push(Math.max(0,Math.min(grid.height-1,y))*grid.width+Math.max(0,Math.min(grid.width-1,x)));areas.push(h3.cellArea(id,'m2'));if(recordIds)cellIds.push(id);used++;
  for(let i=0;i<runs.length;i+=2)owner.fill(used,runs[i],runs[i+1]);
 }
 if(owner.some(id=>!id))throw new Error('H3 coverage did not cover every display pixel');
 return {owner,samples:new Uint32Array(samples),cellIds,cells:used,meanCellArea:areas.reduce((a,b)=>a+b,0)/areas.length,clampedEdgeCells:clamped};
}
export function squareMapping(grid:RasterGrid,groundCellArea:number){
 const [w,s,e,n]=grid.bounds,step=Math.sqrt(groundCellArea)/Math.cos((s+n)/2*Math.PI/180),nw=world(w,n),se=world(e,s),x0=Math.floor(nw[0]/step),y0=Math.floor(se[1]/step),x1=Math.ceil(se[0]/step),y1=Math.ceil(nw[1]/step),columns=x1-x0;
 const samples:number[]=[],owner=new Uint32Array(grid.width*grid.height),indices=new Map<number,number>();let clamped=0;
 for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const px=nw[0]+(x+.5)*(se[0]-nw[0])/grid.width,py=nw[1]+(y+.5)*(se[1]-nw[1])/grid.height,tx=Math.floor(px/step),ty=Math.floor(py/step),key=(ty-y0)*columns+tx-x0;
  let id=indices.get(key);if(id===undefined){
   const cx=Math.floor(((tx+.5)*step-nw[0])/(se[0]-nw[0])*grid.width),cy=Math.floor((nw[1]-(ty+.5)*step)/(nw[1]-se[1])*grid.height);if(cx<0||cy<0||cx>=grid.width||cy>=grid.height)clamped++;
   samples.push(Math.max(0,Math.min(grid.height-1,cy))*grid.width+Math.max(0,Math.min(grid.width-1,cx)));id=samples.length;indices.set(key,id);
  }owner[y*grid.width+x]=id;
 }
 return {owner,samples:new Uint32Array(samples),cells:samples.length,meanCellArea:groundCellArea,clampedEdgeCells:clamped};
}
export function applyMapping(field:Uint8Array,mapping:{owner:Uint32Array;samples:Uint32Array}):Uint8Array{
 const values=new Uint8Array(mapping.samples.length+1);for(let i=0;i<mapping.samples.length;i++)values[i+1]=field[mapping.samples[i]];
 const out=new Uint8Array(field.length);for(let i=0;i<out.length;i++)out[i]=values[mapping.owner[i]];return out;
}
export function difference(reference:Uint8Array,next:Uint8Array){let changed=0,union=0,gained=0,lost=0;for(let i=0;i<reference.length;i++){if(reference[i]||next[i])union++;if(reference[i]!==next[i])changed++;if(!reference[i]&&next[i])gained++;if(reference[i]&&!next[i])lost++}return {changed,union,gained,lost,changedPct:union?changed/union*100:0}}
