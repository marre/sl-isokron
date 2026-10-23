/** Prepare an exact result outside timed contour phases. No GTFS/OSM requests. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import path from 'node:path';import assert from 'node:assert/strict';
import {decodeConnections,decodeWalks} from '../../src/core/data';import {search} from '../../src/core/router';import {stockholmInstant} from '../../src/core/time';import type {FileRef,Manifest,Network,Settings} from '../../src/core/types';
const root=path.resolve(process.env.SLISO_DATA_ROOT??'.data-build/fixed-release/data'),manifest:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
function bytes(ref:FileRef){const b=readFileSync(root+ref.url.replace(/^\/data\//,'/'));assert.equal(b.length,ref.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}
function json<T>(ref:FileRef):T{return JSON.parse(new TextDecoder().decode(bytes(ref)))}
const settings:Settings={v:1,stop:'9022001057310001',name:'Arlanda terminal 4',lat:59.647775,lon:17.928574,date:process.env.SLISO_PROFILE_DATE??'2026-10-22',time:'08:07',maxMinutes:120,walkMinutes:30,maxTransfers:4,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
const t0=stockholmInstant(settings.date,settings.time),end=t0+(settings.maxMinutes+settings.windowMinutes)*60,trips=json<string[]>(manifest.trips);
const refs=Object.values(manifest.days).flat().filter(r=>r.from<=end&&r.until>t0);assert.ok(refs.length,'Date outside pinned timetable');
const network:Network={stops:json(manifest.stops),walks:decodeWalks(json(manifest.walks)),routes:json(manifest.routes),transfers:json(manifest.transfers),connections:refs.flatMap(r=>decodeConnections(bytes(r),trips)).filter(c=>c.departure>=t0&&c.departure<=end)};
const result=search(network,settings);mkdirSync('.data-build/profiling',{recursive:true});writeFileSync('.data-build/profiling/fixture.json',JSON.stringify({dataset:manifest.version,settings,result}));console.log('Prepared',manifest.version,result.values.filter(Boolean).length,'reachable positions');
