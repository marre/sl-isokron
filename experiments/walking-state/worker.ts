import {search as baseline} from '../../.data-build/walking-state/baseline';
import {search as cached} from '../../.data-build/walking-state/cached';
import {search as compact} from '../../.data-build/walking-state/compact';
import {search as lazy} from '../../.data-build/walking-state/lazy';
import {search as numeric} from '../../.data-build/walking-state/numeric';
import {search as guarded} from '../../.data-build/walking-state/guarded';
import type {Network,Settings} from '../../src/core/types';
const variants={baseline,cached,compact,lazy,numeric,guarded};
self.onmessage=async({data}:{data:{variant:keyof typeof variants;origin:number}})=>{
 try{
  const fixture=await (await fetch('/network.json')).json() as {network:Network;settings:Settings[]};
  const result=variants[data.variant](fixture.network,fixture.settings[data.origin]);
  self.postMessage({result,origin:fixture.settings[data.origin].name});
 }catch(e){self.postMessage({error:String(e)})}
};
