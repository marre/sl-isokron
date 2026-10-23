import {search as baseline} from '../../.data-build/walking-state/baseline';
import {search as cached} from '../../.data-build/walking-state/cached';
import {search as compact} from '../../.data-build/walking-state/compact';
import {search as lazy} from '../../.data-build/walking-state/lazy';
import {search as numeric} from '../../.data-build/walking-state/numeric';
import {search as guarded} from '../../.data-build/walking-state/guarded';
import {search as production} from '../../src/core/router';
import {search as closureSearch} from '../../.data-build/walking-state/closure-router';
import {WalkingClosure} from './table';
import type {Network,Settings} from '../../src/core/types';
const variants={baseline,cached,compact,lazy,numeric,guarded,production};
self.onmessage=async({data}:{data:{variant:keyof typeof variants|'closure';origin:number;fixtureSHA256?:string}})=>{
 try{
  const fixture=await (await fetch('/network.json')).json() as {dataset:string;network:Network;settings:Settings[]};
  let table:WalkingClosure|undefined,tableLoadMs=0;
  if(data.variant==='closure'){
   const start=performance.now();
   const [compressed,metadata]=await Promise.all([fetch('/closure.bin.gz').then(r=>r.arrayBuffer()),fetch('/closure-metadata.json').then(r=>r.json())]);
   if(metadata.dataset!==fixture.dataset||metadata.fixtureSHA256!==data.fixtureSHA256)throw new Error('Closure belongs to a different fixture');
   const bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
   if(digest!==metadata.sha256)throw new Error('Walking closure checksum mismatch');
   table=new WalkingClosure(bytes,fixture.network);tableLoadMs=performance.now()-start;
  }
  const result=data.variant==='closure'?closureSearch(fixture.network,fixture.settings[data.origin],{walkingClosure:table}):variants[data.variant](fixture.network,fixture.settings[data.origin]);
  self.postMessage({result,origin:fixture.settings[data.origin].name,tableLoadMs});
 }catch(e){self.postMessage({error:String(e)})}
};
