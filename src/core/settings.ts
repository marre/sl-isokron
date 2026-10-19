import { MODES, type Settings, type Stop } from './types';
import { stockholmInstant, stockholmNow } from './time';
export function defaults(stop: Stop): Settings { return { v: 1, stop: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, ...stockholmNow(), maxMinutes: 60, walkMinutes: 15, modes: [...MODES], maxTransfers: 3, windowMinutes: 30 }; }
export function validateSettings(s: Settings, walkingMax = 30): void {
  if (!s || s.v !== 1) throw new Error('Delningslänkens formatversion stöds inte.');
  for (const [key, min, max] of [['maxMinutes', 10, 120], ['walkMinutes', 5, Math.min(walkingMax, 30)], ['maxTransfers', 0, 4], ['windowMinutes', 5, 120]] as const) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw new Error(`${key}: värdet måste vara ${min}–${max}. Inställningarna ändras inte automatiskt.`);
  }
  if (typeof s.stop !== 'string' || !s.stop || typeof s.name !== 'string' || !Number.isFinite(s.lat) || Math.abs(s.lat) > 90 || !Number.isFinite(s.lon) || Math.abs(s.lon) > 180) throw new Error('Delningslänken saknar giltig hållplatsidentitet.');
  if (!Array.isArray(s.modes) || s.modes.some(m => !MODES.includes(m)) || new Set(s.modes).size !== s.modes.length) throw new Error('Delningslänken innehåller okända eller dubbla trafikslag.');
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
export const BAND_COLORS = ['#2166ac', '#4393c3', '#80cdc1', '#dfc27d', '#bf812d', '#8c510a', '#7b3294', '#a36db3', '#cf9fcf', '#c94d65', '#a41636', '#67001f'];
export function bandIndex(seconds: number): number { return Math.max(0, Math.ceil(seconds / 600) - 1); }
export function colorFor(seconds: number): string { return BAND_COLORS[Math.min(BAND_COLORS.length - 1, bandIndex(seconds))]; }
