/** Publish small, self-contained research artifacts; never copies native profile shards. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const dir='.data-build/walking-lab',report=JSON.parse(readFileSync(dir+'/results.json','utf8'));
if(report.browser?.cases.length!==report.cases.length)throw new Error('Browser measurements are incomplete');
const fields:string[]=[],known=new Map<string,number>(),displays:Record<string,unknown>={};
for(const c of report.cases){
 const raw=JSON.parse(readFileSync(dir+'/'+c.id+'/display.json','utf8')),cutoffs:Record<string,unknown>={};
 for(const [cutoff,variants] of Object.entries(raw)){
  const ids:Record<string,number>={};
  for(const [id,runs] of Object.entries(variants as Record<string,number[]>)){
   const field=new Uint8Array(c.screen.width*c.screen.height);
   for(let i=0;i<runs.length;i+=3)field.fill(runs[i+2],runs[i],runs[i]+runs[i+1]);
   const key=createHash('sha256').update(field).digest('hex');let index=known.get(key);
   if(index===undefined){index=fields.length;known.set(key,index);fields.push(Buffer.from(field).toString('base64'))}ids[id]=index;
  }cutoffs[cutoff]=ids;
 }displays[c.id]=cutoffs;
}
const compressed=gzipSync(JSON.stringify({report,displays,fields})).toString('base64'),template=readFileSync('experiments/walking-lab/mockup.html','utf8');
mkdirSync('public/lab/walking',{recursive:true});writeFileSync('public/lab/walking/index.html',template.replace('__PAYLOAD__',compressed));
const compact={...report,cases:report.cases.map(({stops,...rest}:any)=>rest)};writeFileSync('docs/walking-lab-results.json',JSON.stringify(compact,null,2)+'\n');
console.log('Self-contained lab bytes:',Buffer.byteLength(template.replace('__PAYLOAD__',compressed)));
