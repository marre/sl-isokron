import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bandLimits,rasterBands,paintBands,type AreaGeometry,type RasterGrid} from '../src/core/bands';
import {defaults,parseHash,shareHash,validateSettings} from '../src/core/settings';
const box=(x:number,y:number,w:number,h:number):AreaGeometry=>({type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]});
const grid:RasterGrid={width:60,height:40,bounds:[0,0,6,4]};
const at=(field:Uint8Array,x:number,y:number)=>field[Math.floor(y)*grid.width+Math.floor(x)];

test('overlapping stop areas form one field with the fastest colour and no internal seam',()=>{
 const field=rasterBands([{minutes:10,geometries:[box(0,0,3,4),box(1,0,3,4)]},{minutes:20,geometries:[box(2,0,3,4)]}],grid);
 assert.equal(at(field,15,20),10);assert.equal(at(field,35,20),10);assert.equal(at(field,45,20),20);assert.equal(at(field,55,20),0);
 const pixels=paintBands(field,grid,20,20);
 assert.deepEqual([...pixels.slice((20*60+15)*4,(20*60+15)*4+4)], [...pixels.slice((20*60+25)*4,(20*60+25)*4+4)]);
});
test('holes and islands stay separate; a second contour may legitimately reach a hole',()=>{
 const donut:AreaGeometry={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,3],[3,3],[3,1],[1,1]]]};
 const field=rasterBands([{minutes:10,geometries:[donut,box(5,0,1,1)]}],grid);
 assert.equal(at(field,5,20),10);assert.equal(at(field,20,20),0);assert.equal(at(field,45,20),0);assert.equal(at(field,55,35),10);
 const union=rasterBands([{minutes:10,geometries:[donut,box(1,1,2,2)]}],grid);
 assert.equal(at(union,20,20),10);
});
test('partial cutoffs require the actual partial walking contour, not the next full band',()=>{
 const full=rasterBands([{minutes:10,geometries:[box(0,0,2,4)]},{minutes:20,geometries:[box(0,0,5,4)]}],grid);
 const partial=rasterBands([{minutes:15,geometries:[box(0,0,3,4)]}],grid);
 const pixels=paintBands(full,grid,20,15,partial);
 assert.equal(pixels[(20*60+25)*4+3],255);assert.equal(pixels[(20*60+45)*4+3],0);
 assert.equal(paintBands(full,grid,20,10)[(20*60+25)*4+3],0);
});
test('band limits include exact partial cutoffs and retain standard ten-minute intervals',()=>{
 assert.deepEqual(bandLimits(120,23),[10,20,23]);assert.deepEqual(bandLimits(75),[10,20,30,40,50,60,70,75]);
 assert.deepEqual(bandLimits(120,20),[10,20]);assert.deepEqual(bandLimits(120,1),[1]);
 assert.deepEqual(bandLimits(60,120),[10,20,30,40,50,60]);
});

test('a shared display cutoff preserves search constraints and rejects impossible views',()=>{
 const s={...defaults({id:'a',name:'A',station:'A',platform:'A',lat:59,lon:18}),maxMinutes:120,displayMinutes:23};
 assert.deepEqual(parseHash(shareHash(s)),s);
 for(const displayMinutes of [0,121,1.5])assert.throws(()=>validateSettings({...s,displayMinutes}));
});
