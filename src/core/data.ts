import type { Connection, FileRef, Manifest, Network, Walk } from './types';
const memory = new Map<string, ArrayBuffer>();
export async function loadManifest(signal?: AbortSignal): Promise<Manifest> {
  const response = await fetch('/data/manifest.json', { cache: 'no-cache', signal });
  if (!response.ok) throw new Error('Tidtabell saknas. Data kunde inte laddas från servern.');
  const m = await response.json() as Manifest;
  if (m.schema !== 2 || !m.version || !m.days || !m.stops || m.walkingMaxMinutes < 5) throw new Error('Dataversionen stöds inte.');
  return m;
}
export async function verified(ref: FileRef, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!/^\/data\/[a-zA-Z0-9._/-]+$/.test(ref.url) || ref.url.includes('..')) throw new Error('Ogiltig dataadress.');
  const key = ref.url + ':' + ref.sha256;
  const fromMemory = memory.get(key); if (fromMemory) return fromMemory;
  let cache: Cache | undefined;
  try { cache = await caches.open('sliso-data-v1'); } catch { /* In-memory fallback is intentional. */ }
  let bytes: ArrayBuffer | undefined;
  try { const saved = await cache?.match(ref.url); if (saved) bytes = await saved.arrayBuffer(); } catch { /* Cache is optional. */ }
  const matches = async (b: ArrayBuffer) => b.byteLength === ref.bytes && Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), b => b.toString(16).padStart(2, '0')).join('') === ref.sha256;
  if (bytes && !await matches(bytes)) { try { await cache?.delete(ref.url); } catch { /* Storage may be revoked after reading. */ } bytes = undefined; }
  if (!bytes) {
    const response = await fetch(ref.url, { signal });
    if (!response.ok) throw new Error(response.status === 429 ? 'Datakvoten är uppnådd. Försök senare; ingen betald reservtjänst används.' : 'Nätverksfel vid hämtning av trafikdata.');
    bytes = await response.arrayBuffer();
    if (!await matches(bytes)) throw new Error('Datakontrollen misslyckades. Versionerna får inte blandas.');
    try { await cache?.put(ref.url, new Response(bytes)); } catch { /* Full/denied cache: continue without persistence. */ }
  }
  // Bound in-memory retention. A query owns its already loaded buffers independently.
  if (memory.size > 24) memory.clear();
  memory.set(key, bytes); return bytes;
}
export async function loadJSON<T>(ref: FileRef, signal?: AbortSignal): Promise<T> { return JSON.parse(new TextDecoder().decode(await verified(ref, signal))) as T; }
export function decodeConnections(buffer: ArrayBuffer, trips: string[]): Connection[] {
  if (buffer.byteLength % 36) throw new Error('Tidtabellspaketet är skadat.');
  const view = new DataView(buffer), result: Connection[] = [];
  for (let at = 0; at < view.byteLength; at += 36) {
    const v = Array.from({ length: 9 }, (_, i) => view.getUint32(at + i * 4, true));
    if (!trips[v[4]]) throw new Error('Turindex saknas i dataversionen.');
    result.push({ from: v[0], to: v[1], departure: v[2], arrival: v[3], trip: trips[v[4]], route: v[5], sequence: v[6], pickup: !!(v[7]&1), dropoff: !!(v[8]&1), pickupRequest: !!(v[7]&2), dropoffRequest: !!(v[8]&2) });
  }
  return result;
}
// Large datasets share repeated provenance strings and omit repeated field names.
// Existing immutable JSON arrays remain supported for older releases.
export function decodeWalks(payload: unknown): Walk[] {
  if (Array.isArray(payload)) return payload as Walk[];
  const data = payload as { schema?: number; sources?: unknown; edges?: unknown } | null;
  if (!data || data.schema !== 1 || !Array.isArray(data.sources) || !data.sources.every(s => typeof s === 'string' && s.length) || !Array.isArray(data.edges)) throw new Error('Gångpaketet har ett ogiltigt format.');
  const sources = data.sources as string[];
  return data.edges.map((r: unknown) => {
    if (!Array.isArray(r) || r.length !== 5 || !Number.isInteger(r[0]) || r[0] < 0 || !Number.isInteger(r[1]) || r[1] < 0 || !Number.isFinite(r[2]) || r[2] <= 0 || (r[3] !== null && (!Number.isFinite(r[3]) || r[3] < 0)) || !Number.isInteger(r[4]) || !sources[r[4]]) throw new Error('Gångpaketet innehåller en ogiltig förbindelse.');
    return { from:r[0],to:r[1],seconds:r[2],...(r[3] === null ? {} : { metres:r[3] }),source:sources[r[4]] };
  });
}

export async function loadNetwork(m: Manifest, t0: number, end: number, signal?: AbortSignal): Promise<Network> {
  const [stops, walks, routes, transfers, trips] = await Promise.all([loadJSON<Network['stops']>(m.stops, signal), loadJSON<unknown>(m.walks, signal).then(decodeWalks), loadJSON<Network['routes']>(m.routes, signal), loadJSON<Network['transfers']>(m.transfers, signal), loadJSON<string[]>(m.trips, signal)]);
  // Daily packages are bucketed by ACTUAL UTC departure, not service-day label.
  const first = new Date(t0 * 1000).toISOString().slice(0,10), last = new Date(end * 1000).toISOString().slice(0,10);
  const selected = Object.entries(m.days).filter(([d]) => d >= first && d <= last);
  const wanted = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
  if (selected.length !== wanted) throw new Error('Tidtabell saknas för hela resan, inklusive trafik efter midnatt. Välj ett annat datum.');
  const connections = (await Promise.all(selected.flatMap(([, refs]) => refs.filter(ref => ref.from <= end && ref.until > t0)).map(async ref => decodeConnections(await verified(ref, signal), trips)))).flat().filter(c => c.departure >= t0 && c.departure <= end);
  return { stops, walks, routes, transfers, connections };
}
export async function cacheAvailable(): Promise<boolean> {
  try { const cache = await caches.open('sliso-data-v1'); await cache.put('/data/cache-test', new Response('ok')); await cache.delete('/data/cache-test'); return true; } catch { return false; }
}
export async function pruneCache(m: Manifest): Promise<void> {
  try {
    const cache = await caches.open('sliso-data-v1');
    const keep = new Set([m.stops, m.walks, m.routes, m.transfers, m.trips, ...Object.values(m.days).flat(), ...(m.walkingAreas?.files ?? [])].map(f => new URL(f.url, location.origin).href));
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
  } catch { /* Cache access is optional. */ }
}
