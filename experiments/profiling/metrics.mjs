export function cpuSummary(profile){
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();
 for(let i=0;i<(profile.samples?.length??0);i++){const node=nodes.get(profile.samples[i]),name=node.callFrame.functionName||'(anonymous)',key=name+' @ '+node.callFrame.url;times.set(key,(times.get(key)??0)+(profile.timeDeltas?.[i]??1000)/1000)}
 const entries=[...times].sort((a,b)=>b[1]-a[1]);return {durationMs:(profile.endTime-profile.startTime)/1000,top:entries.slice(0,25).map(([name,ms])=>({name,ms}))};
}
export function summarize(events,start,end){
 const filtered=events.filter(e=>e.at>=start&&e.at<=end),stages={};
 for(const e of filtered){const s=stages[e.name]??={count:0,sumMs:0,maxMs:0};s.count++;s.sumMs+=e.ms;s.maxMs=Math.max(s.maxMs,e.ms);if(e.name==='raster.add')for(const [k,v] of Object.entries(e.detail??{}))s[k]=(s[k]??0)+v}
 const canvas=filtered.filter(e=>e.name==='main.canvas'),loads=filtered.filter(e=>e.name==='data.verified');
 return {stages,events:filtered.length,firstPaintMs:canvas.length?Math.min(...canvas.map(e=>e.at+e.ms))-start:null,lastPaintMs:canvas.length?Math.max(...canvas.map(e=>e.at+e.ms))-start:null,loadedFiles:loads.length,loadedBytes:loads.reduce((n,e)=>n+e.detail.bytes,0),cacheFiles:loads.filter(e=>e.detail.source==='cache').length,memoryFiles:filtered.filter(e=>e.name==='data.memory').length};
}
