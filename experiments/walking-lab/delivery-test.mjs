import http from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const root='.data-build/algorithm-lab/delivery',manifest=JSON.parse(await readFile(root+'/manifest.json','utf8')),archive=await readFile(root+'/walking.pmtiles'),js=await readFile('.data-build/research-deps/node_modules/pmtiles/dist/pmtiles.js');
let latency=0,requests=[];
const server=http.createServer(async(req,res)=>{try{
 if(req.url==='/'){res.end('<!doctype html><title>PMTiles delivery benchmark</title><script src="/pmtiles.js"></script>');return}
 if(req.url==='/pmtiles.js'){res.setHeader('Content-Type','application/javascript');res.end(js);return}
 let body,start=0,end;
 if(req.url==='/walking.pmtiles'){body=archive;end=body.length-1;const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');if(range){start=Number(range[1]);end=Math.min(end,range[2]?Number(range[2]):end);if(start>end){res.writeHead(416);res.end();return}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${body.length}`)}res.setHeader('Accept-Ranges','bytes');res.setHeader('ETag','"sliso-fixed-research-archive"');body=body.subarray(start,end+1)}
 else if(/^\/files\/\d+\.bin$/.test(req.url)){body=await readFile(root+req.url);res.setHeader('Content-Encoding','gzip')}
 else {res.writeHead(404);res.end();return}
 res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',body.length);requests.push({url:req.url,status:res.statusCode,bytes:body.length,start,end});setTimeout(()=>res.end(body),latency);
 }catch{res.writeHead(500);res.end()}});
await new Promise(r=>server.listen(5190,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results={note:manifest.note,conditions:'Local HTTP, artificial per-request response latency, no bandwidth throttling. Same gzip tile payloads; official PMTiles 4.3.0 browser reader. Equal application payload caches in both cases.',archiveBytes:archive.length,cases:[]};
try{
 for(const delay of [0,80])for(const kind of ['files','pmtiles']){
  latency=delay;const page=await browser.newPage();await page.goto('http://127.0.0.1:5190/');
  await page.evaluate(async({kind,entries})=>{
   const {PMTiles}=window.pmtiles;const archive=kind==='pmtiles'?new PMTiles('http://127.0.0.1:5190/walking.pmtiles'):undefined,cache=new Map();
   window.batch=async(indices)=>{const start=performance.now(),queue=[...indices];let verified=0;await Promise.all(Array.from({length:6},async()=>{while(queue.length){const i=queue.shift(),e=entries[i];let data=cache.get(i);if(!data){data=kind==='files'?await(await fetch('/files/'+e.name)).arrayBuffer():(await archive.getZxy(e.z,e.x,e.y)).data;cache.set(i,data)}const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==e.sha256)throw new Error('Payload mismatch');verified++}}));return {ms:performance.now()-start,verified}}
  },{kind,entries:manifest.entries});
  const phases=[['cold',[0,1,2,3,4,5]],['overlapping-pan',[3,4,5,6,7,8]],['return',[0,1,2,3,4,5]],['remaining',manifest.entries.map((_,i)=>i)]];
  for(const [phase,indices] of phases){requests=[];const result=await page.evaluate(indices=>window.batch(indices),indices);assert.equal(result.verified,indices.length);const record={delayMs:delay,kind,phase,...result,requests:requests.length,wireBytes:requests.reduce((n,r)=>n+r.bytes,0),rangeResponses:requests.filter(r=>r.status===206).length};results.cases.push(record);console.log(record);if(kind==='pmtiles')assert.ok(requests.every(r=>r.status===206));if(phase==='return')assert.equal(requests.length,0)}await page.close();
 }
 await writeFile('.data-build/algorithm-lab/delivery-results.json',JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
