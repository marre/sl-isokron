import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadNetwork, verified, decodeConnections} from '../src/core/data';
import type {FileRef, Manifest} from '../src/core/types';
async function refFor(url:string, content:string):Promise<FileRef>{const bytes=new TextEncoder().encode(content);return {url,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')};}
test('data integrity rejects corrupt bytes; denied persistent cache still permits valid data',async()=>{
 const oldFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'caches');
 try{
  Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw new Error('cache denied');}});
  const ref=await refFor('/data/test/hash.json','[1,2,3]');
  globalThis.fetch=async()=>new Response('corrupt');
  await assert.rejects(verified(ref),/Datakontrollen/);
  globalThis.fetch=async()=>new Response('[1,2,3]');
  assert.equal(new TextDecoder().decode(await verified(ref)),'[1,2,3]');
 }finally{globalThis.fetch=oldFetch;if(descriptor)Object.defineProperty(globalThis,'caches',descriptor);else Reflect.deleteProperty(globalThis,'caches');}
});
test('network refuses a search whose final UTC day is absent',async()=>{
 const oldFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('[]');
  const ref=await refFor('/data/test/empty.json','[]');
  const m={stops:ref,routes:ref,walks:ref,transfers:ref,trips:ref,days:{}} as unknown as Manifest;
  await assert.rejects(loadNetwork(m,Date.parse('2026-10-19T23:50Z')/1000,Date.parse('2026-10-20T00:30Z')/1000),/hela resan/);
 }finally{globalThis.fetch=oldFetch;}
});
test('binary corruption and nonexistent trip indices are explicit errors',()=>{
 assert.throws(()=>decodeConnections(new ArrayBuffer(35),[]),/skadat/);
 assert.throws(()=>decodeConnections(new ArrayBuffer(36),[]),/Turindex/);
});
test('hourly shards outside the query interval are not fetched',async()=>{
 const oldFetch=globalThis.fetch,urls:string[]=[];
 try{
  const empty=await refFor('/data/shards/core.json','[]');
  const unused=await refFor('/data/shards/outside.bin','');
  const inside=await refFor('/data/shards/inside.bin','');
  globalThis.fetch=async(input)=>{const url=String(input);urls.push(url);return new Response(url.endsWith('.json')?'[]':'');};
  const t0=Date.parse('2026-10-19T08:00Z')/1000;
  const m={stops:empty,routes:empty,walks:empty,transfers:empty,trips:empty,days:{'2026-10-19':[{...unused,from:t0-7200,until:t0-3600},{...inside,from:t0,until:t0+3600}]}} as unknown as Manifest;
  await loadNetwork(m,t0,t0+1800);
  assert.ok(urls.includes(inside.url));assert.ok(!urls.includes(unused.url));
 }finally{globalThis.fetch=oldFetch;}
});
