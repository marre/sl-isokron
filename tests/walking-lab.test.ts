import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pack,packFixed,unpack,packedRuns,precompute,encodeRuns,compose,tiles,composeTiles,nested,archive,openArchive,tileGrid,sample} from '../experiments/walking-lab/algorithms';
import {contourRuns,type AreaGeometry,type RasterGrid} from '../src/core/bands';
const box=(a:number,b:number,c:number,d:number):AreaGeometry=>({type:'Polygon',coordinates:[[[a,b],[c,b],[c,d],[a,d],[a,b]]]});
const grid:RasterGrid={width:128,height:128,bounds:[0,0,4,4]};
test('packed Float64 contours retain identical scanlines for holes, islands and clipped views',()=>{
 const geometry:AreaGeometry={type:'MultiPolygon',coordinates:[[[[0,0],[3,0],[3,4],[0,4],[0,0]],[[1,1],[1,3],[2,3],[2,1],[1,1]]],[[[3.5,1],[4,1],[4,2],[3.5,2],[3.5,1]]]]};
 const buffer=pack(geometry),container=archive({shape:0},[buffer]),opened=openArchive<{shape:number}>(container);
 for(const bounds of [grid.bounds,[1.25,.37,3.71,2.18] as RasterGrid['bounds']])assert.deepEqual(packedRuns(unpack(container,opened.offset,buffer.byteLength),{...grid,bounds}),contourRuns(geometry,{...grid,bounds}));
 assert.throws(()=>unpack(new ArrayBuffer(16)));
});
test('membership grids preserve non-nested contours that earliest-minute grids cannot',()=>{
 const masks=precompute([{minutes:1,geometry:box(0,0,2,4)},{minutes:2,geometry:box(2,0,4,4)},{minutes:30,geometry:box(0,0,4,4)}],grid),allowances=[{minutes:20,walking:2}];
 const exact=new Uint8Array(masks.length),naive=new Uint8Array(masks.length),tiled=new Uint8Array(masks.length);
 compose(encodeRuns(masks),allowances,exact);compose(encodeRuns(masks),allowances,naive,true);composeTiles(tiles(masks,grid),allowances,tiled,grid.width);
 assert.deepEqual(tiled,exact);assert.equal(exact[64*128+16],0);assert.equal(naive[64*128+16],20);assert.equal(exact[64*128+100],20);assert.ok(!nested(masks[64*128+16]));
 assert.ok(nested(0x3fffffff));assert.ok(nested(0x3ffffffc));
});
test('a tiled membership field equals individual masks at every walking budget',()=>{
 const masks=precompute(Array.from({length:30},(_,i)=>({minutes:i+1,geometry:box(0,0,(i+1)*4/30,4)})),grid),parts=tiles(masks,grid);
 for(let minute=1;minute<=30;minute++){
  const actual=new Uint8Array(masks.length);composeTiles(parts,[{minutes:70,walking:minute}],actual,grid.width);
  for(let i=0;i<masks.length;i++)assert.equal(actual[i],masks[i]&(1<<minute-1)?70:0);
 }
});
test('world tiles align across adjacent viewports and nearest sampling preserves an empty field',()=>{
 const a=tileGrid([18,59.3,18.05,59.35],20),b=tileGrid([18.02,59.3,18.07,59.35],20);
 assert.equal(a.step,b.step);assert.equal(a.grid.width%64,0);assert.ok(a.x1>b.x0);
 assert.deepEqual(sample(new Uint8Array(a.grid.width*a.grid.height),a.grid,grid),new Uint8Array(grid.width*grid.height));
});

test('fixed-point packing uses native precision exactly and falls back for finer input',()=>{
 for(const geometry of [box(18.123456,59.123456,18.234567,59.234567),box(18.123456789,59.123456789,18.234567891,59.234567891)]){
  const packed=unpack(packFixed(geometry));assert.deepEqual(packedRuns(packed,{width:120,height:120,bounds:[18,59,18.5,59.5]}),contourRuns(geometry,{width:120,height:120,bounds:[18,59,18.5,59.5]}));
 }
 assert.equal(unpack(packFixed(box(18.123456,59.123456,18.234567,59.234567))).scale,1e6);
 assert.equal(unpack(packFixed(box(18.123456789,59.123456789,18.234567891,59.234567891))).scale,1);
});

test('grid archives serialize only the addressed view, not its backing archive',async()=>{
 const {encodeGrid,decodeGrid}=await import('../experiments/walking-lab/runtime');
 const original=encodeGrid({grid,profiles:{a:[{x:0,y:0,runs:new Uint32Array([0,3,7])}],b:[{x:1,y:1,runs:new Uint32Array([4,5,9])}]}});
 const decoded=decodeGrid(original),again=encodeGrid(decoded);
 assert.equal(again.byteLength,original.byteLength);assert.deepEqual(again,original);
});
