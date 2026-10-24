/// <reference lib="webworker" />
import {verified} from './core/data';
import {graphFromTiles,type FootpathTile,type FootpathGraph} from './core/origin-access';
import {incomingBudgets,incomingEdges,incomingIntervals,strokeIncoming} from './core/incoming-walks';
import {bandLimits} from './core/bands';
import {colorFor} from './core/settings';
import type {FileRef,FootpathAnchor,Settings,Stop,WalkSource} from './core/types';

let context:{stops:Stop[];sources:WalkSource[];anchor?:FootpathAnchor;settings:Settings}|undefined;
let generation=0,abort:AbortController|undefined;
// Only one viewport graph survives. Verified compressed bytes have their own
// bounded/cache-backed store; do not retain the entire region's parsed OSM.
let cached:{key:string;graph:FootpathGraph;incoming:FootpathGraph['edges']}|undefined;
const mercator=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
self.onmessage=async({data})=>{
 if(data.type==='configure'){context=data;return;}
 if(data.type==='cancel'){generation++;abort?.abort();return;}
 if(data.type!=='draw'||!context)return;
 const own=++generation,id=data.id,{settings,sources,anchor,stops}=context,refs=data.refs as FileRef[];
 abort?.abort();const controller=abort=new AbortController();
 try{
  const key=refs.map(r=>r.sha256).sort().join(':'),bands=bandLimits(settings.maxMinutes).reverse(),total=refs.length+bands.length;
  let done=0;
  const progress=()=>self.postMessage({id,type:'progress',done,total});progress();
  if(cached?.key!==key){
   cached=undefined;const tiles:FootpathTile[]=[];let next=0;
   await Promise.all(Array.from({length:Math.min(4,refs.length)},async()=>{while(next<refs.length){
    const bytes=await verified(refs[next++],controller.signal);if(own!==generation)return;
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    tiles.push(JSON.parse(await new Response(stream).text()) as FootpathTile);done++;progress();
   }}));
   if(own!==generation)return;
   const graph=graphFromTiles(tiles,stops);cached={key,graph,incoming:incomingEdges(graph)};
  }
  if(own!==generation||!cached)return;
  done=refs.length;
  const {graph,incoming}=cached,{width,height}=data,bounds=data.bounds as [number,number,number,number],field=new Uint8Array(width*height);
  const [west,south,east,north]=bounds,top=mercator(north),sx=width/(east-west),sy=height/(top-mercator(south));
  const project=(lat:number,lon:number)=>[(lon-west)*sx,(top-mercator(lat))*sy];
  const positions=new Map([...graph.nodes].map(([id,[lat,lon]])=>[id,project(lat,lon)]));
  const colors=Array.from({length:settings.maxMinutes+1},(_,n)=>colorFor(n*60,settings.maxMinutes).slice(1).match(/../g)!.map(v=>parseInt(v,16)));
  for(const minutes of bands){
   const budgets=incomingBudgets(graph,incoming,sources,minutes*60,settings.walkMinutes*60,anchor);
   for(const edge of graph.segments){
    const a=positions.get(edge.from)!,b=positions.get(edge.to)!;
    if(Math.max(a[0],b[0])<-3||Math.min(a[0],b[0])>width+3||Math.max(a[1],b[1])<-3||Math.min(a[1],b[1])>height+3)continue;
    for(const [from,to] of incomingIntervals(edge,budgets,anchor,Math.min(minutes,settings.walkMinutes)*60)){
     strokeIncoming(field,width,height,[a[0]+(b[0]-a[0])*from,a[1]+(b[1]-a[1])*from],[a[0]+(b[0]-a[0])*to,a[1]+(b[1]-a[1])*to],minutes);
    }
   }
   done++;progress();
   const rgba=new Uint8ClampedArray(field.length*4);
   for(let i=0;i<field.length;i++){const n=field[i];if(!n)continue;const color=colors[n],at=i*4;rgba[at]=color[0];rgba[at+1]=color[1];rgba[at+2]=color[2];rgba[at+3]=255;}
   const pixels=rgba.buffer;
   self.postMessage({id,type:'image',bounds,width,height,pixels,done:done===total},{transfer:[pixels]});
   // Let cancellation and newer view requests run between bands.
   await new Promise(resolve=>setTimeout(resolve,0));if(own!==generation)return;
  }
 }catch(error){controller.abort();if(own===generation)self.postMessage({id,type:'error',message:String(error)});}
};
