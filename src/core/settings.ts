import { MODES, type Settings, type Stop } from './types';
import { stockholmInstant, stockholmNow } from './time';
export function defaults(stop: Stop): Settings { return { v: 1, stop: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, ...stockholmNow(), maxMinutes: 60, walkMinutes: 15, modes: [...MODES], maxTransfers: 3, windowMinutes: 30 }; }
export function validateSettings(s: Settings, walkingMax = 30): void {
  if(s?.direction!==undefined&&s.direction!=='arrive')throw new Error('Okänd sökriktning.');
  if (s?.origin!==undefined&&s.origin!=='point')throw new Error('Okänd typ av startpunkt.');
  if(s?.origin==='point'&&s.stop!=='@point')throw new Error('Ogiltig kartstart.');
  if (!s || s.v !== 1) throw new Error('Delningslänkens formatversion stöds inte.');
  for (const [key, min, max] of [['maxMinutes', 10, 120], ['walkMinutes', 5, Math.min(walkingMax, 30)], ['maxTransfers', 0, 4], ['windowMinutes', 5, 120]] as const) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw new Error(`${key}: värdet måste vara ${min}–${max}. Inställningarna ändras inte automatiskt.`);
  }
  if (typeof s.stop !== 'string' || !s.stop || typeof s.name !== 'string' || !Number.isFinite(s.lat) || Math.abs(s.lat) > 90 || !Number.isFinite(s.lon) || Math.abs(s.lon) > 180) throw new Error('Delningslänken saknar giltig hållplatsidentitet.');
  if (!Array.isArray(s.modes) || s.modes.some(m => !MODES.includes(m)) || new Set(s.modes).size !== s.modes.length) throw new Error('Delningslänken innehåller okända eller dubbla trafikslag.');
  if(s.displayMinutes!==undefined&&(!Number.isInteger(s.displayMinutes)||s.displayMinutes<1||s.displayMinutes>s.maxMinutes))throw new Error('Visningsgränsen måste vara 1 minut till sökningens maxtid.');
  stockholmInstant(s.date, s.time);
}
export function shareHash(s: Settings): string { validateSettings(s); return '#s=' + encodeURIComponent(JSON.stringify(s)); }
export function parseHash(hash: string): Settings | null {
  if (!hash || hash === '#') return null;
  if (!hash.startsWith('#s=') || hash.length > 5000) throw new Error('Ogiltig delningslänk.');
  let s: Settings;
  try { s = JSON.parse(decodeURIComponent(hash.slice(3))); } catch { throw new Error('Delningslänken kunde inte läsas.'); }
  validateSettings(s); return s;
}
export const BAND_COLORS = ['#d9f0a3', '#c2df8a', '#d3da78', '#e6d16a', '#f3c35c', '#f8ad50', '#f89441', '#ef7535', '#df542c', '#c83526', '#a61c22', '#7f0000'];
export function bandIndex(seconds: number): number { return Math.max(0, Math.ceil(seconds / 600) - 1); }
export function bandColors(maxMinutes = 120): string[] {
  const count = Math.ceil(maxMinutes / 10);
  return Array.from({ length: count }, (_, i) => BAND_COLORS[count === 1 ? 0 : Math.round(i * (BAND_COLORS.length - 1) / (count - 1))]);
}
export function colorFor(seconds: number, maxMinutes = 120): string {
  const colors = bandColors(maxMinutes);
  return colors[Math.min(colors.length - 1, bandIndex(seconds))];
}
