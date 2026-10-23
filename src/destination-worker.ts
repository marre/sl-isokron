/// <reference lib="webworker" />
import {loadFootpathGraph,originTileRefs,routeDestinationAccess,type FootpathGraph} from './core/origin-access';
import {choosePointJourney} from './core/point-journey';
import type {Manifest,SearchResult,Settings,Stop} from './core/types';
let context:{manifest:Manifest;result:SearchResult;settings:Settings;stops:Stop[]}|undefined;
let generation=0,abort:AbortController|undefined,cached:{key:string;graph:FootpathGraph}|undefined;
self.onmessage=async({data})=>{
 if(data.type==='configure'){generation++;abort?.abort();cached=undefined;context=data.context;return;}
 if(data.type==='cancel'){generation++;abort?.abort();return;}
 if(data.type!=='query'||!context)return;
 const id=data.id,own=++generation,{manifest,result,settings,stops}=context;
 abort?.abort();abort=new AbortController();
 try{
  const minutes=Math.min(settings.walkMinutes,settings.maxMinutes),point:[number,number]=[data.lat,data.lon];
  const key=originTileRefs(manifest,point,minutes).map(r=>r.sha256).sort().join(':');
  const graph=cached?.key===key?cached.graph:await loadFootpathGraph(manifest,point,minutes,stops,undefined,abort.signal);
  if(own!==generation)return;
  cached={key,graph};
  const access=routeDestinationAccess(graph,point,minutes*60,settings.origin==='point'&&result.origin?{stop:stops.length,...result.origin}:undefined),journey=choosePointJourney(result,settings,stops,access,data.cutoff);
  if(own!==generation)return;
  self.postMessage({id,type:'point',journey,message:journey?'':'Ingen känd resa till punkten inom restids- och gånggränsen.'});
 }catch(error){if(own===generation)self.postMessage({id,type:'point',journey:null,message:error instanceof Error?error.message:'Gångvägen till punkten kunde inte beräknas.'});}
};
