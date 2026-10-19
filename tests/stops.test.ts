import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchStations} from '../src/core/stops';
import type {Stop} from '../src/core/types';
test('origin search ignores destination text and matches Swedish names',()=>{
 const s:Stop[]=[{id:'a',name:'Slussen',station:'Slussen',platform:'Buss mot T-Centralen',lat:59,lon:18},{id:'b',name:'T-Centralen',station:'T-Centralen',platform:'Läge 3',lat:59,lon:18},{id:'c',name:'Mörby',station:'Mörby',platform:'1',lat:59,lon:18}];
 assert.deepEqual(searchStations(s,'T-Centralen'),['T-Centralen']);assert.deepEqual(searchStations(s,'MO\u0308RBY'),['Mörby']);
});
