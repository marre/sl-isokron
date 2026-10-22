import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const dir='.data-build/algorithm-lab',report=JSON.parse(readFileSync(dir+'/layouts.json','utf8')),routing=JSON.parse(readFileSync('.data-build/routing-lab/results.json','utf8')),delivery=JSON.parse(readFileSync(dir+'/delivery-results.json','utf8'));
const routingBrowser=JSON.parse(readFileSync('.data-build/routing-lab/browser.json','utf8'));
const fields:string[]=[],known=new Map<string,number>(),displays:Record<string,unknown>={};
for(const c of report.cases){const raw=JSON.parse(readFileSync(dir+'/display.json','utf8'))[c.id],out:Record<string,unknown>={};
 for(const [cutoff,variants] of Object.entries(raw)){const ids:Record<string,number>={};for(const [id,encoded] of Object.entries(variants as Record<string,string>)){const key=createHash('sha256').update(encoded).digest('hex');let index=known.get(key);if(index===undefined){index=fields.length;known.set(key,index);fields.push(encoded)}ids[id]=index}out[cutoff]=ids}displays[c.id]=out;
}
const payload=gzipSync(JSON.stringify({report,routing,routingBrowser,delivery,fields,displays})).toString('base64'),html=readFileSync('experiments/walking-lab/algorithm-mockup.html','utf8').replace('__PAYLOAD__',payload);
mkdirSync('public/lab/algorithms',{recursive:true});writeFileSync('public/lab/algorithms/index.html',html);
writeFileSync('docs/algorithm-lab-results.json',JSON.stringify({...report,cases:report.cases.map(({stops,...c}:any)=>c),routing,routingBrowser,delivery},null,2)+'\n');console.log('Lab HTML bytes',Buffer.byteLength(html));
