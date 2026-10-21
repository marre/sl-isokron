import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkingExitGap } from '../src/core/result-notice';
import { defaults } from '../src/core/settings';
import type { SearchResult, Stop } from '../src/core/types';

test('a walking-only island without mapped exits warns about incomplete coverage', () => {
  const stops: Stop[] = [
    {id:'terminal', name:'Terminal', lat:59, lon:18, station:'', platform:'', walking:'estimated'},
    {id:'other-position', name:'Terminal', lat:59, lon:18.001, station:'', platform:'', walking:'estimated'},
    {id:'bus', name:'Nearby bus station', lat:59, lon:18.002, station:'', platform:'', walkingArea:true},
  ];
  const reach = {seconds:60, kind:'walk' as const, arrival:100, boardings:0, journey:null};
  const result: SearchResult = {values:[reach, reach, null], journeys:[], routes:[], walkSources:[], labels:2, elapsed:1, complete:true};
  const settings = {...defaults(stops[0]), modes:['bus' as const], walkMinutes:30};
  assert.equal(walkingExitGap(result, settings, stops), true);
  // An unvisited nearby profile must not hide a disconnected origin.
  assert.equal(walkingExitGap({...result, values:[reach, reach, reach]}, settings, stops), false);
  assert.equal(walkingExitGap({...result, values:[reach, {...reach, boardings:1}, null]}, settings, stops), false);
  assert.equal(walkingExitGap(result, {...settings, modes:[]}, stops), false);
  assert.equal(walkingExitGap(result, {...settings, walkMinutes:0}, stops), false);
});
