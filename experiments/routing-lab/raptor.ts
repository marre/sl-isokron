/** Research-only multicriteria route-pattern scanner. Shared semantics copied from the exact router; no production imports. */
import type { Connection, JourneyNode, Network, Reach, SearchResult, Settings, TransferRule, Walk, WalkSource, StationProgress } from '../../src/core/types';
import { stockholmInstant } from '../../src/core/time';
import { validateSettings } from '../../src/core/settings';
interface Label {
  stop: number; time: number; anchor: number | null; walk: number; boardings: number;
  requestStop: boolean; lastTrip: string; lastRoute: string; alightStop: number; alightTime: number;
  previous: Label | null; via: Connection | Walk | null; alight: Connection | null;
}
function baseTrip(id: string): string { return /^\d{4}-\d{2}-\d{2}:/.test(id) ? id.slice(11) : id; }
function applicable(r: TransferRule, l: Label, c: Connection, network: Network): boolean {
  return r.from === l.alightStop && r.to === c.from && (!r.fromTrip || (r.fromTrip === l.lastTrip || r.fromTrip === baseTrip(l.lastTrip))) && (!r.toTrip || (r.toTrip === c.trip || r.toTrip === baseTrip(c.trip))) && (!r.fromRoute || r.fromRoute === l.lastRoute) && (!r.toRoute || r.toRoute === network.routes[c.route].id);
}
export function canTransfer(l: Label, c: Connection, network: Network, candidates = network.transfers): boolean {
  if (!l.boardings) return true;
  const rules = candidates.filter(r => applicable(r, l, c, network));
  // Trip-specific rules supersede route-specific rules, which supersede stop-only rules.
  const rank = (r: TransferRule) => (r.fromTrip ? 4 : 0) + (r.toTrip ? 4 : 0) + (r.fromRoute ? 1 : 0) + (r.toRoute ? 1 : 0);
  const best = Math.max(-1, ...rules.map(rank));
  return rules.filter(r => rank(r) === best).every(r => r.type !== 3 && c.departure >= l.alightTime + r.seconds);
}
function lowerBound(a: Connection[], time: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid].departure < time) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Exact label search. Retains time AND displayed-cost alternatives. No heuristic truncation.
 * Each boarding follows the whole trip; staying seated never requires a legal alight/reboard.
 * Distinct GTFS trips count as distinct vehicles (conservative; block_id is not continuity proof).
 */
export function search(network: Network, settings: Settings, options: { prune?: boolean; maxLabels?: number; walkingHeap?: boolean; onProgress?: (progress: StationProgress) => void } = {}): SearchResult {
  validateSettings(settings);
  const started = performance.now(), t0 = stockholmInstant(settings.date, settings.time);
  const start = network.stops.findIndex(s => s.id === settings.stop);
  if (start < 0) throw new Error('Starthållplatsen saknas i datan. Välj en ersättare.');
  const max = settings.maxMinutes * 60, maxWalk = settings.walkMinutes * 60;
  const windowEnd = t0 + settings.windowMinutes * 60, latest = windowEnd + max;
  const departures: Connection[][] = network.stops.map(() => []);
  const walking = network.stops.map(() => [] as Network['walks']);
  const trips = new Map<string, Connection[]>();
  for (const c of network.connections) {
    if (c.departure < t0 || c.departure > latest) continue;
    departures[c.from].push(c);
    const trip = trips.get(c.trip) ?? []; trip.push(c); trips.set(c.trip, trip);
  }
  for (const a of departures) a.sort((a,b) => a.departure - b.departure);
  for (const a of trips.values()) a.sort((a,b) => a.sequence - b.sequence);
  for (const w of network.walks) walking[w.from].push(w);
  const ruleIndex = new Map<string, TransferRule[]>();
  const tripSpecific = new Set<string>();
  const transferDelay = network.stops.map(() => 0);
  const transferBlocked = new Set<number>();
  const routeSpecific = network.transfers.some(r => r.fromRoute);
  for (const r of network.transfers) {
    transferDelay[r.from] = Math.max(transferDelay[r.from], r.seconds);
    if (r.type === 3) transferBlocked.add(r.from);
    const key = `${r.from}|${r.to}`;
    const list = ruleIndex.get(key) ?? []; list.push(r); ruleIndex.set(key,list);
    if (r.fromTrip) tripSpecific.add(r.fromTrip);
  }
  // Once every minimum transfer time from an alighting event has elapsed,
  // its stop/time cannot restrict any future boarding. Forget only that spent
  // context, retaining trip/route distinctions and all prohibited transfers.
  function settled(l: Label): boolean {
    return !transferBlocked.has(l.alightStop) && l.time >= l.alightTime + transferDelay[l.alightStop];
  }
  function contextKey(l: Label): string {
    const trip = (tripSpecific.has(l.lastTrip) || tripSpecific.has(baseTrip(l.lastTrip))) ? l.lastTrip : '*';
    return `${l.stop}|${l.boardings}|${trip}|${routeSpecific ? l.lastRoute : '*'}|${settled(l) ? '*' : l.alightStop}`;
  }
  const values: (Reach | null)[] = network.stops.map(() => null);
  const witnesses: (Label | null)[] = network.stops.map(() => null);
  const finalWalking: WalkSource[][] = network.stops.map(() => []);
  const queues: Label[][] = Array.from({length: settings.maxTransfers+2},()=>[]);
  const heaps:Label[][]=queues.map(()=>[]);
  const priority=(a:Label,b:Label)=>cost(a)-cost(b)||a.walk-b.walk||a.time-b.time;
  function heapPush(l:Label){const heap=heaps[l.boardings];let i=heap.length;heap.push(l);while(i){const p=(i-1)>>>1;if(priority(heap[p],l)<=0)break;heap[i]=heap[p];i=p}heap[i]=l;}
  function heapPop(round:number){const heap=heaps[round],best=heap[0],last=heap.pop();if(heap.length&&last){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&priority(heap[child+1],heap[child])<0)child++;if(priority(last,heap[child])<=0)break;heap[i]=heap[child];i=child}heap[i]=last}return best;}
  let labels=0, processed=0, lastProgress=performance.now();
  const changes=new Map<number,Reach>();
  function report(completedRounds: number) {
    if (!options.onProgress) return;
    options.onProgress({completedRounds,totalRounds:queues.length,processedLabels:processed,queuedLabels:labels,changes:[...changes].map(([stop,value])=>({stop,value:{...value}}))});
    changes.clear(); lastProgress=performance.now();
  }
  const frontiers = new Map<string, Label[]>();
  function cost(l: Label): number { return l.time - (l.anchor ?? t0); }
  function push(l: Label): void {
    if (cost(l) > max || l.walk > maxWalk || l.time > latest) return;
    const old = values[l.stop], seconds = cost(l);
    if (network.stops[l.stop].walkingArea && seconds < max && l.walk < maxWalk) {
      const list = finalWalking[l.stop];
      if (!list.some(a => a.seconds <= seconds && a.walked <= l.walk)) {
        finalWalking[l.stop] = [...list.filter(a => !(seconds <= a.seconds && l.walk <= a.walked)), { stop: l.stop, seconds, walked: l.walk }];
      }
    }
    if (!old || seconds < old.seconds || (seconds === old.seconds && l.time < old.arrival)) {
      values[l.stop] = { seconds, arrival: l.time, kind: l.boardings ? 'transit' : 'walk', boardings: l.boardings, requestStop: l.requestStop, journey: null };
      witnesses[l.stop] = l;
      if(options.onProgress)changes.set(l.stop,values[l.stop]!);
    }
    // Context must match: transfer constraints refer to the actual previous trip/alighting event.
    const key = contextKey(l);
    const list = frontiers.get(key) ?? [];
    const dominates = (a: Label, b: Label) => a.time <= b.time && (settled(a) && settled(b) || a.alightTime <= b.alightTime) && a.walk <= b.walk && (a.anchor ?? t0) >= (b.anchor ?? t0);
    if (options.prune !== false && list.some(a => dominates(a, l))) return;
    frontiers.set(key, [...list.filter(a => !dominates(l, a)), l]); queues[l.boardings].push(l);if(options.walkingHeap)heapPush(l); labels++;
    if (labels > (options.maxLabels ?? 2_000_000)) throw new Error('Beräkningen överskred minnesbudgeten. Resultatet är ofärdigt; begränsa sökningen.');
  }
  push({ stop: start, time: t0, anchor: null, walk: 0, boardings: 0, requestStop: false, lastTrip: '', lastRoute: '', alightStop: start, alightTime: t0, previous: null, via: null, alight: null });
  report(0);
  // A route pattern has the same route and ordered connection endpoints/sequences.
  // Trips can overtake: retain a separate onboard state for every trip instance.
  // Never choose just the earliest departure and discard later, shorter-cost anchors.
  interface Pattern { trips: Connection[][] }
  const patterns=new Map<string,Pattern>(),atStop: Set<Pattern>[]=network.stops.map(()=>new Set());
  for(const trip of trips.values()){
    const key=JSON.stringify([trip[0].route,trip.map(c=>[c.from,c.to,c.sequence])]);
    let pattern=patterns.get(key);
    if(!pattern){pattern={trips:[]};patterns.set(key,pattern);for(const c of trip)atStop[c.from].add(pattern);}
    pattern.trips.push(trip);
  }
  for(let round=0;round<queues.length;round++){
    const queue=queues[round];
    // Complete the continuous-walking closure before scanning vehicle routes.
    for(let head=0;options.walkingHeap?heaps[round].length>0:head<queue.length;){
      const l=options.walkingHeap?heapPop(round):queue[head++];processed++;
      if(options.onProgress&&(processed&127)===0&&performance.now()-lastProgress>=100)report(round);
      if(options.prune!==false&&!frontiers.get(contextKey(l))?.includes(l))continue;
      for(const w of walking[l.stop])push({...l,stop:w.to,time:l.time+w.seconds,walk:l.walk+w.seconds,previous:l,via:w,alight:null});
    }
    if(round<queues.length-1){
      const active:Label[][]=network.stops.map(()=>[]),marked=new Set<Pattern>();
      for(const l of queue){
        if(options.prune!==false&&!frontiers.get(contextKey(l))?.includes(l))continue;
        active[l.stop].push(l);for(const p of atStop[l.stop])marked.add(p);
      }
      for(const pattern of marked){
        if(!settings.modes.includes(network.routes[pattern.trips[0][0].route].mode))continue;
        const onboard:({label:Label;boarding:Connection;anchor:number}|undefined)[]=Array(pattern.trips.length);
        for(let position=0;position<pattern.trips[0].length;position++){
          for(let t=0;t<pattern.trips.length;t++){
            const c=pattern.trips[t][position];
            if(c.pickup)for(const l of active[c.from]){
              if(c.departure<l.time||(!round&&c.departure>windowEnd)||l.lastTrip===c.trip)continue;
              const anchor=l.anchor??c.departure-l.walk;
              if(c.departure-anchor>max||(onboard[t]&&onboard[t]!.anchor>=anchor))continue;
              if(!canTransfer(l,c,network,ruleIndex.get(`${l.alightStop}|${c.from}`)??[]))continue;
              onboard[t]={label:l,boarding:c,anchor};
            }
            const state=onboard[t];if(!state||!c.dropoff||c.arrival-state.anchor>max)continue;
            push({stop:c.to,time:c.arrival,anchor:state.anchor,walk:0,boardings:round+1,requestStop:state.label.requestStop||!!state.boarding.pickupRequest||!!c.dropoffRequest,lastTrip:c.trip,lastRoute:network.routes[c.route].id,alightStop:c.to,alightTime:c.arrival,previous:state.label,via:state.boarding,alight:c});
          }
        }
      }
    }
    report(round+1);
  }
  // Serialize only the predecessor chains that actually explain a displayed value.
  // Shared nodes avoid copying a complete itinerary for every reachable destination.
  const journeys: JourneyNode[] = [], ids = new Map<Label, number>();
  witnesses.forEach((witness, stop) => {
    if (!witness?.previous) return;
    const pending: Label[] = [];
    for (let l: Label | null = witness; l?.previous && !ids.has(l); l = l.previous) pending.push(l);
    while (pending.length) {
      const l = pending.pop()!, via = l.via!, previous = ids.get(l.previous!) ?? null;
      let node: JourneyNode;
      if ('seconds' in via) {
        node = { previous, kind: 'walk', from: via.from, to: via.to, departure: l.previous!.time, arrival: l.time, stops: [via.from, via.to], metres: via.metres, estimated: via.source.startsWith('Assumed ') || undefined };
      } else {
        const path = trips.get(via.trip)!.filter(c => c.sequence >= via.sequence && c.sequence <= l.alight!.sequence);
        node = { previous, kind: 'transit', from: via.from, to: l.stop, departure: via.departure, arrival: l.time, route: via.route, stops: [via.from, ...path.map(c => c.to)], requestStop: !!via.pickupRequest || !!l.alight!.dropoffRequest };
      }
      ids.set(l, journeys.length); journeys.push(node);
    }
    values[stop]!.journey = ids.get(witness)!;
  });
  return { values, journeys, routes: network.routes, walkSources: finalWalking.flat(), labels, elapsed: performance.now() - started, complete: true };
}

/** Same exact route scan with priority-ordered, multi-source walking closure. */
export const searchHeap=(network:Network,settings:Settings,options:Parameters<typeof search>[2]={})=>search(network,settings,{...options,walkingHeap:true});
