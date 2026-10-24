import {validateSettings} from './settings';
import {search} from './router';
import {stockholmInstant} from './time';
import type {Network,Walk,WalkingClosureTable,Settings,SearchResult,StationProgress} from './types';

const reverseWalk=(w:Walk):Walk=>({...w,from:w.to,to:w.from,...(w.path?{path:[...w.path].reverse()}:{})});

/** Transpose the exact distance table, retaining the original directional witnesses.
 * Typed indices avoid materializing millions of walking-edge objects. */
export function reverseClosure(table:WalkingClosureTable,n:number):WalkingClosureTable {
 const rows=new Uint32Array(n+1),sources=new Uint32Array(table.pairs),entries=new Uint32Array(table.pairs);
 for(let from=0;from<n;from++)for(let i=table.begin(from);i<table.end(from);i++)rows[table.destination(i)+1]++;
 for(let i=1;i<=n;i++)rows[i]+=rows[i-1];
 const cursor=rows.slice();
 for(let from=0;from<n;from++)for(let i=table.begin(from);i<table.end(from);i++){
  const at=cursor[table.destination(i)]++;sources[at]=from;entries[at]=i;
 }
 return {maxSeconds:table.maxSeconds,pairs:table.pairs,begin:s=>rows[s],end:s=>rows[s+1],destination:i=>sources[i],seconds:i=>table.seconds(entries[i]),path:(from,to)=>table.path(to,from).reverse().map(reverseWalk)};
}

/** Time reversal lets the same exact route scanner enforce directional walking,
 * pickup/dropoff and trip-specific transfer rules. A fixed anchor charges all
 * time before the deadline, including the margin after an early arrival.
 * Minimizing that cost is equivalent to finding the latest feasible departure. */
export function searchArriveBy(network:Network,settings:Settings,options:Parameters<typeof search>[2]={}):SearchResult {
 validateSettings(settings);const started=performance.now();
 const epoch=2*stockholmInstant(settings.date,settings.time),mirror=(t:number)=>epoch-t;
 const reversed:Network={...network,
  connections:network.connections.map(c=>({...c,from:c.to,to:c.from,departure:mirror(c.arrival),arrival:mirror(c.departure),sequence:-c.sequence,pickup:c.dropoff,dropoff:c.pickup,pickupRequest:c.dropoffRequest,dropoffRequest:c.pickupRequest})),
  walks:network.walks.map(reverseWalk),
  transfers:network.transfers.map(r=>({...r,from:r.to,to:r.from,fromTrip:r.toTrip,toTrip:r.fromTrip,fromRoute:r.toRoute,toRoute:r.fromRoute})),
  walkingClosure:network.walkingClosure?reverseClosure(network.walkingClosure,network.stops.length):undefined,
 };
 const progress=options.onProgress;
 const onProgress=progress?(p:StationProgress)=>progress({...p,changes:p.changes.map(c=>({...c,value:{...c.value,arrival:mirror(c.value.arrival)}}))}):undefined;
 const result=search(reversed,{...settings,direction:undefined,windowMinutes:settings.maxMinutes},{...options,fixedAnchor:true,onProgress});
 // In reverse results `arrival` is the time at the queried stop: its latest
 // departure. The DAG stays mirrored and is decoded once per inspected journey.
 return {...result,elapsed:performance.now()-started,reverseEpoch:epoch,values:result.values.map(v=>v?{...v,arrival:mirror(v.arrival)}:null),destinationSources:result.destinationSources?.map(s=>({...s,arrival:mirror(s.arrival)}))};
}
