import type { Connection, Network, Reach, SearchResult, Settings, TransferRule } from './types';
import { stockholmInstant } from './time';
import { validateSettings } from './settings';
interface Label {
  stop: number; time: number; anchor: number | null; walk: number; boardings: number;
  lastTrip: string; lastRoute: string; alightStop: number; alightTime: number;
}
function applicable(r: TransferRule, l: Label, c: Connection, network: Network): boolean {
  return r.from === l.alightStop && r.to === c.from && (!r.fromTrip || r.fromTrip === l.lastTrip) && (!r.toTrip || r.toTrip === c.trip) && (!r.fromRoute || r.fromRoute === l.lastRoute) && (!r.toRoute || r.toRoute === network.routes[c.route].id);
}
export function canTransfer(l: Label, c: Connection, network: Network): boolean {
  if (!l.boardings) return true;
  const rules = network.transfers.filter(r => applicable(r, l, c, network));
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
export function search(network: Network, settings: Settings, options: { prune?: boolean; maxLabels?: number } = {}): SearchResult {
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
  const values: (Reach | null)[] = network.stops.map(() => null);
  const queue: Label[] = [], frontiers = new Map<string, Label[]>();
  function cost(l: Label): number { return l.time - (l.anchor ?? t0); }
  function push(l: Label): void {
    if (cost(l) > max || l.walk > maxWalk || l.time > latest) return;
    const old = values[l.stop], seconds = cost(l);
    if (!old || seconds < old.seconds || (seconds === old.seconds && l.time < old.arrival)) values[l.stop] = { seconds, arrival: l.time, kind: l.boardings ? 'transit' : 'walk', boardings: l.boardings };
    // Context must match: transfer constraints refer to the actual previous trip/alighting event.
    const key = `${l.stop}|${l.boardings}|${l.lastTrip}|${l.alightStop}|${l.alightTime}`;
    const list = frontiers.get(key) ?? [];
    const dominates = (a: Label, b: Label) => a.time <= b.time && a.walk <= b.walk && (a.anchor ?? t0) >= (b.anchor ?? t0);
    if (options.prune !== false && list.some(a => dominates(a, l))) return;
    frontiers.set(key, [...list.filter(a => !dominates(l, a)), l]); queue.push(l);
    if (queue.length > (options.maxLabels ?? 2_000_000)) throw new Error('Beräkningen överskred minnesbudgeten. Resultatet är ofärdigt; begränsa sökningen.');
  }
  push({ stop: start, time: t0, anchor: null, walk: 0, boardings: 0, lastTrip: '', lastRoute: '', alightStop: start, alightTime: t0 });
  for (let head = 0; head < queue.length; head++) {
    const l = queue[head];
    for (const w of walking[l.stop]) push({ ...l, stop: w.to, time: l.time + w.seconds, walk: l.walk + w.seconds });
    if (l.boardings >= settings.maxTransfers + 1) continue;
    const ds = departures[l.stop];
    for (let k = lowerBound(ds, l.time); k < ds.length; k++) {
      const c = ds[k];
      if (!l.boardings && c.departure > windowEnd) break;
      if (!c.pickup || !settings.modes.includes(network.routes[c.route].mode) || !canTransfer(l, c, network)) continue;
      const anchor = l.anchor ?? c.departure - l.walk;
      if (c.departure - anchor > max) continue;
      // Do not reboard the same trip after alighting: remaining seated was already explored.
      if (l.lastTrip === c.trip) continue;
      for (const leg of trips.get(c.trip)!) {
        if (leg.sequence < c.sequence || leg.arrival - anchor > max || !leg.dropoff) continue;
        push({ stop: leg.to, time: leg.arrival, anchor, walk: 0, boardings: l.boardings + 1, lastTrip: c.trip, lastRoute: network.routes[c.route].id, alightStop: leg.to, alightTime: leg.arrival });
      }
    }
  }
  return { values, labels: queue.length, elapsed: performance.now() - started, complete: true };
}
