import type { Stop } from './types';
/** Presentation only: never filter/reindex the routing network with this helper.
 * Scheduled service is checked across the complete published period, independent
 * of the current search/mode. OLD is a legacy fallback when no retirement flag
 * exists. A deployment-time index also covers older immutable data releases.
 */
export function isPublicStop(stop: Stop): boolean {
  return stop.retired !== undefined ? !stop.retired : !/^Läge OLD\S*(?:$|\s+·)/i.test(stop.platform);
}
/** Service visibility must not prune routing labels, contours or footpath bindings. */
export function isMapStop(stop:Stop):boolean{return stop.scheduled!==false&&isPublicStop(stop);}
export function searchStations(stops: Stop[], query: string): string[] {
  const normalize=(s:string)=>s.normalize('NFC').trim().toLocaleLowerCase('sv');
  const q=normalize(query);if(!q)return [];
  // Direction descriptions belong to platform choice; they are not origin names.
  return [...new Set(stops.filter(s=>isMapStop(s)&&[s.station,s.name].some(n=>normalize(n).includes(q))).map(s=>s.station))].slice(0,8);
}
