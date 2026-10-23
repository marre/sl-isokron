/** Local HTTP/1.1 delivery with keep-alive; optional fixed response latency. */
import http from 'node:http';import {createReadStream} from 'node:fs';import {stat} from 'node:fs/promises';import path from 'node:path';
const data=path.resolve(process.env.SLISO_DATA_ROOT??'.data-build/fixed-release/data'),site=path.resolve(process.env.SLISO_PROFILE_SITE??'.data-build/profile-site');
http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/$/,'/index.html');
  if(pathname.includes('..')||pathname.includes('\\')){res.writeHead(400).end();return}
  const file=pathname.startsWith('/data/')?path.join(data,pathname.slice(6)):path.join(site,pathname);
  const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return}
  const delay=Math.min(200,Math.max(0,Number(req.headers['x-profile-latency'])||0));
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  res.writeHead(200,{'Content-Length':info.size,'Content-Type':file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream','Cache-Control':pathname.startsWith('/data/')?'public,max-age=31536000,immutable':'no-cache'});
  createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end()}
}).listen(Number(process.env.SLISO_PROFILE_PORT??5192),'127.0.0.1',()=>console.log('Profiler HTTP server ready'));
