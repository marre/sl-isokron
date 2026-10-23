import type { JourneyLeg, SearchResult, Stop } from './types';
import { stockholmNow } from './time';

/** Recover the witness for this destination, never another stop's best label. */
export function journeyFor(result: SearchResult, destination: number, stops?:Stop[]): JourneyLeg[] {
  return journeyFromNode(result,result.values[destination]?.journey??null,undefined,stops);
}

/** Recover an alternate witness and optionally append a final mapped walk. */
export function journeyFromNode(result:SearchResult,at:number|null,tail?:JourneyLeg,stops?:Stop[]):JourneyLeg[]{
  const legs:JourneyLeg[]=tail?[{...tail,stops:[...tail.stops]}]:[];
  while (at !== null) {
    const { previous, ...leg } = result.journeys[at];
    legs.push({ ...leg, ...(stops&&leg.kind==='walk'?{path:leg.path??leg.stops.map(i=>[stops[i].lat,stops[i].lon] as [number,number])}:{}), stops: [...leg.stops] }); at = previous;
  }
  legs.reverse();
  // Initial waiting is excluded from R. Place access walking immediately before
  // the first boarding so the displayed clock times also span exactly R.
  const firstTransit = legs.findIndex(l => l.kind === 'transit');
  if (firstTransit > 0) {
    const shift = legs[firstTransit].departure - legs[firstTransit - 1].arrival;
    for (let i = 0; i < firstTransit; i++) { legs[i].departure += shift; legs[i].arrival += shift; }
  }
  const grouped: JourneyLeg[] = [];
  for (const leg of legs) {
    const last = grouped.at(-1);
    if (last?.kind === 'walk' && leg.kind === 'walk' && last.to === leg.from && last.arrival === leg.departure) {
      if(last.path&&leg.path)last.path=[...last.path,...leg.path.slice(1)];else delete last.path;
      last.to = leg.to; last.arrival = leg.arrival; last.stops.push(...leg.stops.slice(1));
      last.metres = last.metres === undefined || leg.metres === undefined ? undefined : last.metres + leg.metres;
      last.estimated = last.estimated || leg.estimated || undefined;
    } else grouped.push(leg);
  }
  return grouped;
}

export function journeyTime(epoch: number, searchDate: string): string {
  const local = stockholmNow(new Date(epoch * 1000));
  const seconds = Math.floor(epoch) % 60;
  const clock = local.time + (seconds ? ':' + String(seconds).padStart(2, '0') : '');
  return local.date === searchDate ? clock : `${clock} (${local.date})`;
}
