/** Local verified timetable fixture: no API requests, secrets, or data rebuild. */
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {decodeConnections,decodeWalks} from '../../src/core/data';import {stockholmInstant} from '../../src/core/time';import type {FileRef,Manifest,Network,Settings} from '../../src/core/types';
const root=process.env.SLISO_DATA_ROOT??'.data-build/fixed-release/data',m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
function bytes(ref:FileRef){const b=readFileSync(root+ref.url.replace(/^\/data\//,'/'));assert.equal(b.length,ref.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}
function json<T>(ref:FileRef):T{return JSON.parse(new TextDecoder().decode(bytes(ref)))}
const template:Settings={v:1,stop:'',name:'',lat:0,lon:0,date:'2026-10-22',time:'08:07',maxMinutes:120,walkMinutes:30,maxTransfers:4,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
const t0=stockholmInstant(template.date,template.time),end=t0+(template.maxMinutes+template.windowMinutes)*60,trips=json<string[]>(m.trips);
assert.ok(Object.values(m.days).flat().some(r=>r.from<=end&&r.until>t0),'Fixture date outside dataset; use the recorded release or deliberately choose and document a new fixture date.');
const network:Network={stops:json(m.stops),walks:decodeWalks(json(m.walks)),routes:json(m.routes),transfers:json(m.transfers),connections:Object.values(m.days).flat().filter(r=>r.from<=end&&r.until>t0).flatMap(r=>decodeConnections(bytes(r),trips)).filter(c=>c.departure>=t0&&c.departure<=end)};
const settings=['9022001057310001','9022001007361002','9022001015503003'].map(id=>{const s=network.stops.find(s=>s.id===id)!;return {...template,stop:id,name:s.name,lat:s.lat,lon:s.lon}});
writeFileSync('.data-build/walking-state/network.json',JSON.stringify({dataset:m.version,network,settings}));
console.log(m.version,{stops:network.stops.length,walks:network.walks.length,connections:network.connections.length,integerWalkTimes:network.walks.every(w=>Number.isInteger(w.seconds))});
