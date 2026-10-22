import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {packFixed,unpack,decodeProfiles,legacyProfiles,deliveryProfiles} from '../src/core/contours';
import {contourRuns,rasterBands,type AreaGeometry} from '../src/core/bands';
const geometry:AreaGeometry={type:'MultiPolygon',coordinates:[[[[18,59],[18.02,59],[18.02,59.02],[18,59.02],[18,59]],[[18.005,59.005],[18.015,59.005],[18.015,59.015],[18.005,59.015],[18.005,59.005]]],[[[18.03,59],[18.04,59],[18.04,59.01],[18.03,59]]]]};
const grid={width:123,height:97,bounds:[17.995,58.995,18.05,59.025] as [number,number,number,number]};
const arrayBuffer=(b:Uint8Array)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
test('fixed contours preserve pixels, clipping, islands and holes',()=>{
 const packed=unpack(packFixed(geometry));assert.equal(packed.scale,1e6);
 for(const bounds of [grid.bounds,[18.01,59.003,18.035,59.015] as typeof grid.bounds])assert.deepEqual(contourRuns(packed,{...grid,bounds}),contourRuns(geometry,{...grid,bounds}));
 const precise=structuredClone(geometry);precise.coordinates[0][0][1][0]=18.020000000001;
 const fallback=unpack(packFixed(precise));assert.equal(fallback.scale,1);assert.deepEqual(contourRuns(fallback,grid),contourRuns(precise,grid));
});
test('Python delivery codec and worker decoder agree at every minute',()=>{
 const profiles={stop:Array.from({length:30},(_,i)=>({minutes:i+1,geometry}))};
 const raw=execFileSync('python',['-c','import sys,json;sys.path.insert(0,"scripts");from contour_format import encode_profiles;sys.stdout.buffer.write(encode_profiles(json.load(sys.stdin)))'],{input:JSON.stringify(profiles)});
 const packed=decodeProfiles(arrayBuffer(raw));
 const legacy=legacyProfiles(arrayBuffer(new TextEncoder().encode(JSON.stringify(profiles))));
 for(let minute=1;minute<=30;minute++){
  const native=rasterBands([{minutes:minute,geometries:[geometry]}],grid);
  assert.deepEqual(rasterBands([{minutes:minute,geometries:[packed.stop[minute-1].geometry]}],grid),native);
  assert.deepEqual(rasterBands([{minutes:minute,geometries:[legacy.stop[minute-1].geometry]}],grid),native);
 }
 for(const length of [0,7,raw.length-1])assert.throws(()=>decodeProfiles(arrayBuffer(raw.subarray(0,length))));
 const bad=Buffer.from(raw);bad.writeUInt32LE(0xffffffff,4);assert.throws(()=>decodeProfiles(arrayBuffer(bad)));
 const corrupt=packFixed(geometry);new DataView(corrupt).setUint32(16,1,true);assert.throws(()=>unpack(corrupt));
});

test('empty source contours remain empty',()=>{for(const geometry of [{type:'Polygon',coordinates:[]},{type:'MultiPolygon',coordinates:[]}] as AreaGeometry[]){assert.deepEqual(contourRuns(unpack(packFixed(geometry)),grid),new Uint32Array())}});

test('explicit gzip delivery is lossless and checksum-independent of HTTP encoding',async()=>{
 const raw=execFileSync('python',['-c','import sys,json;sys.path.insert(0,"scripts");from contour_format import delivery_profiles;sys.stdout.buffer.write(delivery_profiles(json.load(sys.stdin)))'],{input:JSON.stringify({s:[{minutes:1,geometry}]})});
 const profiles=await deliveryProfiles(arrayBuffer(raw));assert.deepEqual(contourRuns(profiles.s[0].geometry,grid),contourRuns(geometry,grid));
 await assert.rejects(()=>deliveryProfiles(arrayBuffer(raw.subarray(0,raw.length-3))));
});
