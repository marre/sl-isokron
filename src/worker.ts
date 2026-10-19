/// <reference lib="webworker" />
import { loadNetwork } from './core/data';
import { search } from './core/router';
import { stockholmInstant } from './core/time';
import type { Manifest, Settings } from './core/types';
self.onmessage = async (event: MessageEvent<{ id: number; manifest: Manifest; settings: Settings }>) => {
  const { id, manifest, settings } = event.data;
  try {
    self.postMessage({ id, type: 'status', message: 'Laddar tidtabell och gånganslutningar…' });
    const t0 = stockholmInstant(settings.date, settings.time);
    const network = await loadNetwork(manifest, t0, t0 + (settings.windowMinutes + settings.maxMinutes) * 60);
    self.postMessage({ id, type: 'status', message: 'Beräknar bästa restid utan initial väntan…' });
    const result = search(network, settings);
    self.postMessage({ id, type: 'result', result });
  } catch (error) { self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Beräkningen misslyckades.' }); }
};
