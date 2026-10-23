import {test} from 'node:test';import assert from 'node:assert/strict';
import {routeColor,routeTextColor,transportIcon,MODE_COLORS} from '../src/core/transport';
import {MODES,type Route} from '../src/core/types';
const sl=(line:string,mode:Route['mode']='bus'):Route=>({id:'9011001'+line.padStart(4,'0')+'00000',name:line,mode});
test('line colours use supplied GTFS colours and classifications, with a scoped legacy SL fallback',()=>{
 assert.equal(routeColor(sl('1')),'#007db8');assert.equal(routeColor(sl('474')),'#007db8');assert.equal(routeColor(sl('105')),'#d71d24');
 assert.equal(routeColor({...sl('1'),description:''}),'#d71d24');
 assert.equal(routeColor({...sl('999'),description:'blåbuss'}),'#007db8');
 assert.equal(routeColor(sl('14','metro')),'#d71d24');assert.equal(routeColor(sl('19','metro')),'#008b43');assert.equal(routeColor(sl('11','metro')),'#007db8');
 assert.notEqual(routeColor({...sl('1'),agencyId:'other'}),'#007db8');assert.notEqual(routeColor({id:'other',name:'1',mode:'bus'}),'#007db8');
 assert.equal(routeColor({...sl('14','metro'),color:'AAbb00'}),'#aabb00');
 assert.equal(routeTextColor({...sl('1'),color:'ffff00'}),'#132c26');assert.equal(routeTextColor({...sl('1'),color:'000000'}),'#ffffff');
 assert.equal(routeColor({...sl('14','metro'),color:'red;position:fixed'}),'#d71d24');
 assert.equal(routeColor({...sl('999','metro'),description:'tunnelbanans gröna linje'}),'#008b43');
 assert.equal(routeColor(sl('27','tram')),'#8d549f');assert.equal(routeColor(sl('25','tram')),'#008c95');
 assert.equal(routeColor({id:'foreign',name:'19',mode:'metro'}),MODE_COLORS.metro);
});
test('every transport mode and walking has a decorative SVG without obscuring text labels',()=>{
 for(const mode of [...MODES,'walk'] as const){const svg=transportIcon(mode);assert.ok(svg.includes(`data-transport="${mode}"`));assert.ok(svg.includes('aria-hidden="true"'));assert.ok(svg.includes('viewBox="0 0 24 24"'));}
});
