import {rasterBands,type AreaGeometry,type RasterGrid} from '../../src/core/bands';
import {pack,packFixed,unpack,packedRuns,archive,openArchive,composeTiles,type Packed,type Contour,type Tile} from './algorithms';
export type Budgets=Record<string,{minutes:number;walking:number}[]>;
export type Native=Record<string,Contour[]>;
export type PackedProfiles=Record<string,{minutes:number;geometry:Packed}[]>;
export interface GridProfiles {grid:RasterGrid;profiles:Record<string,Tile[]>}
export function encodePacked(profiles:Native,fixed=false):ArrayBuffer{
 const directory:Record<string,{minutes:number;offset:number;length:number}[]>={},chunks:ArrayBuffer[]=[];let offset=0;
 for(const [id,contours] of Object.entries(profiles))directory[id]=contours.map(c=>{const chunk=(fixed?packFixed:pack)(c.geometry),entry={minutes:c.minutes,offset,length:chunk.byteLength};offset+=chunk.byteLength;chunks.push(chunk);return entry});
 return archive(directory,chunks);
}
export function decodePacked(buffer:ArrayBuffer):PackedProfiles{
 const {directory,offset}=openArchive<Record<string,{minutes:number;offset:number;length:number}[]>>(buffer),out:PackedProfiles={};
 for(const [id,entries] of Object.entries(directory))out[id]=entries.map(e=>({minutes:e.minutes,geometry:unpack(buffer,offset+e.offset,e.length)}));return out;
}
export function encodeGrid(data:GridProfiles):ArrayBuffer{
 const profiles:Record<string,{x:number;y:number;offset:number;length:number}[]>={},chunks:ArrayBuffer[]=[];let offset=0;
 for(const [id,parts] of Object.entries(data.profiles))profiles[id]=parts.map(p=>{const entry={x:p.x,y:p.y,offset,length:p.runs.length};offset+=p.runs.byteLength;chunks.push(p.runs.buffer.slice(p.runs.byteOffset,p.runs.byteOffset+p.runs.byteLength) as ArrayBuffer);return entry});
 return archive({grid:data.grid,profiles},chunks);
}
export function decodeGrid(buffer:ArrayBuffer):GridProfiles{
 const {directory,offset}=openArchive<{grid:RasterGrid;profiles:Record<string,{x:number;y:number;offset:number;length:number}[]>}>(buffer),profiles:GridProfiles['profiles']={};
 for(const [id,entries] of Object.entries(directory.profiles))profiles[id]=entries.map(e=>({x:e.x,y:e.y,runs:new Uint32Array(buffer,offset+e.offset,e.length)}));return {grid:directory.grid,profiles};
}
export function nativeRender(profiles:Native,budgets:Budgets,grid:RasterGrid):Uint8Array{
 const bands=new Map<number,AreaGeometry[]>();
 for(const [id,contours] of Object.entries(profiles))for(const b of budgets[id]??[]){const contour=contours.find(c=>c.minutes===b.walking);if(contour){const geometries=bands.get(b.minutes)??[];geometries.push(contour.geometry);bands.set(b.minutes,geometries)}}
 return rasterBands([...bands].map(([minutes,geometries])=>({minutes,geometries})),grid);
}
export function packedRender(profiles:PackedProfiles,budgets:Budgets,grid:RasterGrid):Uint8Array{
 const earliest=new Map<Packed,number>(),out=new Uint8Array(grid.width*grid.height);
 for(const [id,contours] of Object.entries(profiles))for(const b of budgets[id]??[]){const c=contours.find(c=>c.minutes===b.walking);if(c)earliest.set(c.geometry,Math.min(b.minutes,earliest.get(c.geometry)??Infinity))}
 for(const [g,m] of [...earliest].sort((a,b)=>b[1]-a[1])){const runs=packedRuns(g,grid);for(let i=0;i<runs.length;i+=2)out.fill(m,runs[i],runs[i+1])}return out;
}
export function gridRender(profiles:GridProfiles,budgets:Budgets,earliest=false):Uint8Array{
 const out=new Uint8Array(profiles.grid.width*profiles.grid.height);
 for(const [id,parts] of Object.entries(profiles.profiles))composeTiles(parts,budgets[id]??[],out,profiles.grid.width,earliest);return out;
}
