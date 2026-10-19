import type { Stop } from './types';
export function searchStations(stops: Stop[], query: string): string[] {
  const normalize=(s:string)=>s.normalize('NFC').trim().toLocaleLowerCase('sv');
  const q=normalize(query);if(!q)return [];
  // Direction descriptions belong to platform choice; they are not origin names.
  return [...new Set(stops.filter(s=>[s.station,s.name].some(n=>normalize(n).includes(q))).map(s=>s.station))].slice(0,8);
}
