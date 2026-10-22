import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {decodeGrid,encodeGrid,type GridProfiles} from './runtime';import {world} from './algorithms';
const out='.data-build/algorithm-lab/delivery';mkdirSync(out+'/files',{recursive:true});
const b=readFileSync('.data-build/walking-lab/city/grid-20.bin'),data=decodeGrid(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),groups=new Map<string,GridProfiles['profiles']>(),[w,,e,n]=data.grid.bounds,nw=world(w,n),se=world(e,data.grid.bounds[1]),step=(se[0]-nw[0])/data.grid.width,half=20037508.342789244,span=half*2/2**14;
for(const [id,parts] of Object.entries(data.profiles))for(const p of parts){const key=p.x+':'+p.y,group=groups.get(key)??{};group[id]=[p];groups.set(key,group)}
const entries=[];let i=0;
for(const [key,profiles] of groups){const [x,y]=key.split(':').map(Number),cx=nw[0]+(x*64+32)*step,cy=nw[1]-(y*64+32)*step,tx=Math.floor((cx+half)/span),ty=Math.floor((half-cy)/span),bytes=new Uint8Array(encodeGrid({grid:data.grid,profiles})),gz=gzipSync(bytes,{mtime:0} as any),name=String(i++)+'.bin';writeFileSync(out+'/files/'+name,gz);entries.push({name,z:14,x:tx,y:ty,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,gzipBytes:gz.length})}
writeFileSync(out+'/manifest.json',JSON.stringify({note:'Transport microbenchmark. Native 20m data chunks are keyed by the XYZ tile containing each chunk centre. This does not test geographic tile selection.',entries}));
