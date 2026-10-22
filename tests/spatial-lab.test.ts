import {test} from 'node:test';import assert from 'node:assert/strict';
import {encodeQuad,decodeQuad,quadTiles,composeQuad,displayQuad} from '../experiments/walking-lab/quadtree';import {composeTiles,encodeRuns} from '../experiments/walking-lab/algorithms';import {squareMapping,applyMapping} from '../experiments/walking-lab/spatial-layouts';
test('quadtree preserves every membership bit, including holes and non-nested times',()=>{
 const masks=new Uint32Array(4096);masks.fill(0x3fffffff);for(let y=13;y<37;y++)for(let x=11;x<38;x++)masks[y*64+x]=(x+y)%3===0?0:1<<29|1<<2;
 const encoded=encodeQuad(masks);assert.deepEqual(decodeQuad(encoded),masks);assert.ok(encoded.length<4096*3);
 const parts=[{x:1,y:0,runs:encodeRuns(masks)}],quad=quadTiles(parts);
 for(let walking=1;walking<=30;walking++){const expected=new Uint8Array(128*64),actual=new Uint8Array(128*64),budgets=[{minutes:70,walking}];composeTiles(parts,budgets,expected,128);composeQuad(quad,budgets,actual,128);assert.deepEqual(actual,expected)}
 assert.throws(()=>decodeQuad(encoded.subarray(1)));assert.throws(()=>decodeQuad(new Uint32Array([...encoded,0])));
});
test('display quadtree reconstructs non-square rasters exactly without filling holes',()=>{
 const field=new Uint8Array(73*51);field.fill(20);for(let y=10;y<30;y++)field.fill(0,y*73+10,y*73+30);const q=displayQuad(field,73,51),decoded=decodeQuad(q.nodes,q.size);
 for(let y=0;y<51;y++)assert.deepEqual(decoded.subarray(y*q.size,y*q.size+73),new Uint32Array(field.subarray(y*73,(y+1)*73)));
});
test('matched-area square mapping keeps constant fields and an explicit display-sized lookup',()=>{
 const grid={width:100,height:80,bounds:[18,59.3,18.02,59.32] as [number,number,number,number]},mapping=squareMapping(grid,300);
 assert.equal(mapping.owner.length,8000);assert.ok(mapping.cells>0);assert.deepEqual(applyMapping(new Uint8Array(8000).fill(70),mapping),new Uint8Array(8000).fill(70));
});
