import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useContourOverview} from '../src/core/contour-view';
test('overview requires a broad zoom and expensive detail; sparse or close views stay native',()=>{
 assert.equal(useContourOverview(12,48,2*1024*1024),true);
 assert.equal(useContourOverview(13,800,20*1024*1024),false);
 assert.equal(useContourOverview(10,14,1024*1024),false);
 assert.equal(useContourOverview(10,48,1024*1024),false);
});
