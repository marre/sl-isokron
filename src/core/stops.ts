import type { Stop } from './types';
/** Presentation only: never filter/reindex the routing network with this helper.
 * New builds explicitly mark unused OLD platform codes after expanding service
 * dates. The pinned legacy release was audited: all OLD platforms are unused.
 */
export function isPublicStop(stop: Stop): boolean {
  return stop.retired !== undefined ? !stop.retired : !/^Läge OLD\S*(?:$|\s+·)/i.test(stop.platform);
}
export function searchStations(stops: Stop[], query: string): string[] {
  const normalize=(s:string)=>s.normalize('NFC').trim().toLocaleLowerCase('sv');
  const q=normalize(query);if(!q)return [];
  // Direction descriptions belong to platform choice; they are not origin names.
  return [...new Set(stops.filter(s=>isPublicStop(s)&&[s.station,s.name].some(n=>normalize(n).includes(q))).map(s=>s.station))].slice(0,8);
}
