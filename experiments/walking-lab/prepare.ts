import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {decodeConnections,decodeWalks} from '../../src/core/data';
import {search} from '../../src/core/router';
import {stockholmInstant} from '../../src/core/time';
import {walkingMinutes} from '../../src/core/walking';
import type {Manifest,FileRef,Stop,Settings,Network} from '../../src/core/types';
const root=resolve(process.argv[2]??'.data-build/diagnosis/data'),output=resolve('.data-build/walking-lab');mkdirSync(output,{recursive:true});
const m:Manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
const local=(ref:FileRef)=>root+'/'+ref.url.replace(/^\/data\//,'');
function bytes(ref:FileRef){const p=local(ref);if(!existsSync(p)){mkdirSync(dirname(p),{recursive:true});execFileSync('curl',['--fail','--silent','--show-error','--max-time','60','https://sliso.xr.se'+ref.url,'-o',p])}const data=readFileSync(p);if(data.byteLength!==ref.bytes||createHash('sha256').update(data).digest('hex')!==ref.sha256)throw new Error('Compiled-data integrity mismatch: '+ref.url);return data}
function json<T>(ref:FileRef):T{return JSON.parse(bytes(ref).toString())}
const stops=json<Stop[]>(m.stops),settings:Settings={v:1,stop:'9022001057310001',name:'Arlanda terminal 4',lat:59.647775,lon:17.928574,date:process.env.SLISO_LAB_DATE??'2026-10-22',time:'08:07',maxMinutes:120,walkMinutes:30,maxTransfers:4,windowMinutes:30,modes:['bus','metro','rail','tram','boat']};
const vallentuna=stops.find(s=>s.id==='9022001007361002')!;if(!vallentuna)throw new Error('Missing Vallentuna');
const cases=[{id:'city',name:'Central Stockholm',bounds:[18.015,59.313,18.105,59.355],query:'arlanda'}, {id:'airport',name:'Arlanda / SkyCity',bounds:[17.90,59.63,17.96,59.665],query:'arlanda'}, {id:'rural',name:'Lindholmen',bounds:[18.085,59.572,18.135,59.606],query:'vallentuna'}];
for(const [id,s] of Object.entries({arlanda:settings,vallentuna:{...settings,stop:vallentuna.id,name:vallentuna.name,lat:vallentuna.lat,lon:vallentuna.lon}})){
 const p=output+'/'+id+'.json';if(existsSync(p)){const old=JSON.parse(readFileSync(p,'utf8'));if(old.dataset===m.version&&JSON.stringify(old.settings)===JSON.stringify(s))continue;}
 const t0=stockholmInstant(s.date,s.time),end=t0+(s.maxMinutes+s.windowMinutes)*60,first=new Date(t0*1000).toISOString().slice(0,10),last=new Date(end*1000).toISOString().slice(0,10),trips=json<string[]>(m.trips);
 const refs=Object.entries(m.days).filter(([d])=>d>=first&&d<=last).flatMap(([,rs])=>rs.filter(r=>r.from<=end&&r.until>t0));
 const network:Network={stops,routes:json(m.routes),walks:decodeWalks(json(m.walks)),transfers:json(m.transfers),connections:refs.flatMap(ref=>{const b=bytes(ref);return decodeConnections(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),trips)}).filter(c=>c.departure>=t0&&c.departure<=end)};
 const r=search(network,s);writeFileSync(p,JSON.stringify({dataset:m.version,settings:s,walkSources:r.walkSources,seconds:r.values.map(v=>v?.seconds??null),routingMs:r.elapsed}));console.log(id,'query',Math.round(r.elapsed),'ms',r.walkSources.length,'walking labels');
}
const wanted=new Set<number>();
for(const c of cases){
 const q=JSON.parse(readFileSync(output+'/'+c.query+'.json','utf8')),available=walkingMinutes(q.walkSources,q.settings.maxMinutes*60,q.settings.walkMinutes*60),[w,s,e,n]=c.bounds,delta=(30*80+50)/111320,lon=delta/Math.cos(n*Math.PI/180),files=new Set<number>();
 for(const i of available.keys()){const p=stops[i],file=m.walkingAreas?.index[p.id];if(file!==undefined&&p.lat>=s-delta&&p.lat<=n+delta&&p.lon>=w-lon&&p.lon<=e+lon)files.add(file)}
 Object.assign(c,{files:[...files]});for(const f of files)wanted.add(f);console.log(c.id,files.size,'profile shards');
}
const missing=[...wanted].filter(i=>!existsSync(local(m.walkingAreas!.files[i])));console.log('Missing static profile files:',missing.length);
// Static, immutable compiled data only. No Trafiklab request or API key involved.
const pending=[...missing];await Promise.all(Array.from({length:6},async()=>{while(pending.length){const i=pending.shift()!,ref=m.walkingAreas!.files[i],p=local(ref);mkdirSync(dirname(p),{recursive:true});const {execFile}=await import('node:child_process');await new Promise<void>((resolve,reject)=>execFile('curl',['--fail','--silent','--show-error','--max-time','60','https://sliso.xr.se'+ref.url,'-o',p],err=>err?reject(err):resolve()));}}));
writeFileSync(output+'/cases.json',JSON.stringify({dataset:m.version,root,cases}));
