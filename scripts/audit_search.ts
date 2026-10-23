/** Usage: npx tsx scripts/audit_search.ts DATA_DIRECTORY SETTINGS_JSON [REPORT_JSON] */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {originTileRefs,graphFromTiles,routeOrigin} from '../src/core/origin-access';
import {decodeWalkingClosure} from '../src/core/walking-closure';
import {createHash} from 'node:crypto';
import {decodeConnections,decodeWalks} from '../src/core/data';
import {search} from '../src/core/router';
import {stockholmInstant} from '../src/core/time';
import {auditSearch} from './search_audit';
import type {Manifest,Network,Settings,FileRef} from '../src/core/types';
const [root,settingsFile,reportFile]=process.argv.slice(2);
if(!root||!settingsFile)throw new Error('Usage: audit_search.ts DATA_DIRECTORY SETTINGS_JSON [REPORT_JSON]');
const m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
const bytes=(r:FileRef)=>{const b=readFileSync(root+'/'+r.url.replace(/^\/data\//,''));
  if(b.length!==r.bytes||createHash('sha256').update(b).digest('hex')!==r.sha256)throw new Error('Data integrity check failed: '+r.url);return b;};
const json=(r:FileRef)=>JSON.parse(bytes(r).toString());
const settings:Settings=JSON.parse(readFileSync(settingsFile,'utf8'));
const start=stockholmInstant(settings.date,settings.time),end=start+(settings.maxMinutes+settings.windowMinutes)*60,trips=json(m.trips);
const network:Network={stops:json(m.stops),walks:decodeWalks(json(m.walks)),routes:json(m.routes),transfers:json(m.transfers),
 connections:Object.values(m.days).flat().filter(r=>r.from<=end&&r.until>start).flatMap(r=>{const b=bytes(r);return decodeConnections(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),trips);})};
if(m.walkingClosure){const b=bytes(m.walkingClosure);network.walkingClosure=await decodeWalkingClosure(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),network,{walksSHA256:m.walks.sha256,stopsSHA256:m.stops.sha256,maxSeconds:m.walkingClosure.maxMinutes*60});}
const access=settings.origin==='point'?routeOrigin(graphFromTiles(originTileRefs(m,[settings.lat,settings.lon],Math.min(settings.walkMinutes,settings.maxMinutes)).map(r=>JSON.parse(gunzipSync(bytes(r)).toString())),network.stops),[settings.lat,settings.lon],Math.min(settings.walkMinutes,settings.maxMinutes)*60):undefined;
const result=search(network,settings,{access}),audit=auditSearch(network,result,settings);
const report={dataset:m.version,settings,reachable:result.values.filter(Boolean).length,...audit};
if(reportFile)writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({dataset:m.version,reachable:report.reachable,violations:audit.violations.length,outliers:audit.outliers.length,largest:audit.outliers.slice(0,10)},null,2));
if(audit.violations.length)process.exitCode=1;
