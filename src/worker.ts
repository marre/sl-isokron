/// <reference lib="webworker" />
import {configureProfile,profileStart,profileEnd,drainProfile} from './core/profile';
import { loadNetwork } from './core/data';
import { search } from './core/router';
import { stockholmInstant } from './core/time';
import type { Manifest, Settings } from './core/types';
self.onmessage = async (event: MessageEvent<{ id: number; manifest: Manifest; settings: Settings; profiling?:boolean }>) => {
  const { id, manifest, settings } = event.data;
  configureProfile(!!event.data.profiling,'routing-worker');
  try {
    self.postMessage({ id, type: 'status', message: 'Laddar tidtabell och gånganslutningar…' });
    const t0 = stockholmInstant(settings.date, settings.time);
    let stage=profileStart();
    const network = await loadNetwork(manifest, t0, t0 + (settings.windowMinutes + settings.maxMinutes) * 60, undefined, progress=>self.postMessage({id,type:'progress',phase:'data',...progress}));
    profileEnd('routing.loadNetwork',stage);stage=profileStart();
    self.postMessage({ id, type: 'status', message: 'Beräknar bästa restid utan initial väntan…' });
    const result = search(network, settings, {onProgress:progress=>self.postMessage({id,type:'stations',...progress})});
    profileEnd('routing.search',stage,{labels:result.labels,connections:network.connections.length,walks:network.walks.length});
    self.postMessage({ id, type: 'result', result,profileEvents:drainProfile() });
  } catch (error) { self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Beräkningen misslyckades.' }); }
};
