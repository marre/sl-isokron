/** Prepare exact overlay inputs from any installed matching historical release. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {decodeConnections,decodeWalks} from '../../src/core/data';import {decodeWalkingClosure} from '../../src/core/walking-closure';import {search} from '../../src/core/router';import {stockholmInstant} from '../../src/core/time';import type {Manifest,FileRef,Network,Settings} from '../../src/core/types';
const root=process.env.SLISO_DATA_ROOT??'public/data',out=process.env.SLISO_DELIVERY_OUTPUT??'.data-build/delivery-lab',m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
function bytes(r:FileRef){const b=readFileSync(root+r.url.replace(/^\/data\//,'/'));assert.equal(b.length,r.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
function json<T>(r:FileRef):T{return JSON.parse(new TextDecoder().decode(bytes(r)));}
const settings:Settings={v:1,stop:'9022001057310001',name:'Arlanda terminal 4',lat:59.647775,lon:17.928574,date:process.env.SLISO_DELIVERY_DATE??'2026-10-22',time:'08:07',maxMinutes:120,walkMinutes:30,maxTransfers:4,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
const t0=stockholmInstant(settings.date,settings.time),end=t0+(settings.maxMinutes+settings.windowMinutes)*60,trips=json<string[]>(m.trips),hourly=Object.values(m.days).flat().filter(r=>r.from<=end&&r.until>t0);assert.ok(hourly.length,'Use the recorded historical release or deliberately document a new fixture date');
const n:Network={stops:json(m.stops),routes:json(m.routes),walks:decodeWalks(json(m.walks)),transfers:json(m.transfers),connections:hourly.flatMap(r=>decodeConnections(bytes(r),trips)).filter(c=>c.departure>=t0&&c.departure<=end)};
if(m.walkingClosure)n.walkingClosure=await decodeWalkingClosure(bytes(m.walkingClosure),n,{walksSHA256:m.walks.sha256,stopsSHA256:m.stops.sha256,maxSeconds:m.walkingClosure.maxMinutes*60});
mkdirSync(out,{recursive:true});writeFileSync(out+'/fixture.json',JSON.stringify({dataset:m.version,settings,result:search(n,settings),stops:n.stops}));
const stop=n.stops.find(s=>s.id==='9022001007361002')!;writeFileSync(out+'/vallentuna.json',JSON.stringify(search(n,{...settings,stop:stop.id,name:stop.name,lat:stop.lat,lon:stop.lon})));
console.log('Prepared two exact search snapshots from',m.version);
