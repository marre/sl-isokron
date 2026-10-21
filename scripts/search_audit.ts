/** Offline result diagnostics. Geographic proximity flags a question, never a route. */
import { journeyFor } from '../src/core/journey';
import type { Network, SearchResult, Settings, Stop } from '../src/core/types';
function metres(a: Stop, b: Stop): number {
  const rad = Math.PI / 180, x = (b.lat-a.lat)*rad, y = (b.lon-a.lon)*rad;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(y/2)**2)));
}
export function auditSearch(network: Network, result: SearchResult, settings: Settings) {
  const maxWalk=settings.walkMinutes*60, max=settings.maxMinutes*60;
  const trailing=result.values.map((r,i)=>{
    if(!r)return 0;
    let seconds=0;
    for(const leg of journeyFor(result,i).reverse()) { if(leg.kind!=='walk')break; seconds+=leg.arrival-leg.departure; }
    return seconds;
  });
  const violations=[];
  for(const w of network.walks) {
    const from=result.values[w.from],to=result.values[w.to];
    if(!from || trailing[w.from]+w.seconds>maxWalk || from.seconds+w.seconds>max)continue;
    // This is a feasible extension of the actual winning witness, including its
    // remaining continuous walking budget. Its result must not be worse.
    if(!to || to.seconds>from.seconds+w.seconds)violations.push({from:network.stops[w.from].id,to:network.stops[w.to].id,
      upperBoundSeconds:from.seconds+w.seconds,actualSeconds:to?.seconds??null});
  }
  const bins=new Map<string,number[]>();
  network.stops.forEach((s,i)=>{const key=`${Math.floor(s.lat*400)}|${Math.floor(s.lon*200)}`;bins.set(key,[...(bins.get(key)??[]),i]);});
  const active=new Set(network.connections.flatMap(c=>[c.from,c.to]).concat(network.walks.flatMap(w=>[w.from,w.to])));
  const outliers=[];
  for(let i=0;i<network.stops.length;i++) {
    const a=network.stops[i],r=result.values[i];if(!r)continue;
    const x=Math.floor(a.lat*400),y=Math.floor(a.lon*200);
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(const j of bins.get(`${x+dx}|${y+dy}`)??[]) {
      if(j===i || (!result.values[j]&&!active.has(j)))continue;
      const b=network.stops[j],other=result.values[j],distance=metres(a,b);
      if(distance>250)continue;
      const optimisticWalk=Math.ceil(distance/80*60);
      if(trailing[i]+optimisticWalk>maxWalk || r.seconds+optimisticWalk>max)continue;
      const discrepancy=(other?.seconds??max)-r.seconds-optimisticWalk;
      if(discrepancy<600)continue;
      outliers.push({from:a.id,fromName:a.name,to:b.id,toName:b.name,straightLineMetres:Math.round(distance),
        fromSeconds:r.seconds,toSeconds:other?.seconds??null,discrepancySeconds:discrepancy,
        walkingMissing:a.walking!=='available'||b.walking!=='available'});
    }
  }
  outliers.sort((a,b)=>Number(a.toSeconds===null)-Number(b.toSeconds===null)||b.discrepancySeconds-a.discrepancySeconds||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
  return {violations,outliers,note:'Outliers require review: straight-line distance does not establish a legal walking route. Violations use only existing physical walking edges and feasible witness extensions.'};
}
