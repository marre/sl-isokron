import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditSearch} from '../scripts/search_audit';
import {search} from '../src/core/router';
import {defaults} from '../src/core/settings';
import type {Network} from '../src/core/types';
function fixture():Network{return {stops:[{id:'a',name:'Street',lat:59,lon:18,station:'a',platform:''},{id:'b',name:'Care home',lat:59.0001,lon:18,station:'b',platform:''},{id:'c',name:'Square',lat:59.0002,lon:18,station:'c',platform:''}],routes:[],transfers:[],connections:[],walks:[{from:0,to:1,seconds:600,source:'mapped'},{from:1,to:2,seconds:600,source:'mapped'}]};}
test('audit respects remaining continuous walking budget and detects a broken feasible extension',()=>{
 const n=fixture(),s={...defaults(n.stops[0]),date:'2026-10-21',time:'08:07',walkMinutes:15};
 const r=search(n,s);assert.equal(r.values[2],null);
 assert.deepEqual(auditSearch(n,r,s).violations,[]);
 r.values[1]=null;
 assert.equal(auditSearch(n,r,s).violations[0].to,'b');
});
test('geographic outliers include different names without claiming a walking route',()=>{
 const n=fixture(),s={...defaults(n.stops[0]),date:'2026-10-21',time:'08:07',walkMinutes:15};
 const r=search(n,s),a=auditSearch(n,r,s);
 assert.ok(a.outliers.some(o=>o.from==='a'&&o.to==='c'));
 assert.deepEqual(a.violations,[]);assert.equal(n.walks.length,2);
});
