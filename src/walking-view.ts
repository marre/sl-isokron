import L from 'leaflet';
import type { Polygon, MultiPolygon } from 'geojson';
import { loadJSON } from './core/data';
import { colorFor } from './core/settings';
import { walkingMinutes } from './core/walking';
import type { Manifest, SearchResult, Settings, Stop } from './core/types';

type Contour = { minutes: number; geometry: Polygon | MultiPolygon };
type Profiles = Record<string, Contour[]>;

export class WalkingView {
  enabled = true;
  private layer = L.featureGroup();
  private controller?: AbortController;
  private data?: { result: SearchResult; settings: Settings; manifest: Manifest; stops: Stop[] };
  private renderer: L.Renderer;

  constructor(map: L.Map, private status: (text: string) => void, private ready: () => void) {
    const pane = map.createPane('walking-areas'); pane.style.zIndex = '250'; pane.style.opacity = '.4'; pane.style.pointerEvents = 'none';
    this.renderer = L.canvas({ pane: 'walking-areas', padding: .2 });
    this.layer.addTo(map);
  }

  reset() { this.controller?.abort(); this.layer.clearLayers(); this.data = undefined; }
  bounds() { const bounds = this.layer.getBounds(); return bounds.isValid() ? bounds : undefined; }
  setData(result: SearchResult, settings: Settings, manifest: Manifest, stops: Stop[]) {
    this.reset(); this.data = { result, settings, manifest, stops };
    void this.draw();
  }
  toggle(enabled: boolean) { this.enabled = enabled; this.controller?.abort(); this.layer.clearLayers(); void this.draw(); }

  private async draw() {
    if (!this.data || !this.enabled) { this.status('Gångområden är dolda.'); return; }
    const { result, settings, manifest, stops } = this.data, areas = manifest.walkingAreas;
    if (!areas) { this.status('Gångområden saknas i detta dataset.'); return; }
    const available = walkingMinutes(result.walkSources, settings.maxMinutes * 60, settings.walkMinutes * 60);
    const files = [...new Set([...available.keys()].map(i => areas.index[stops[i].id]).filter(i => i !== undefined))];
    if (!files.length) { this.status('Inga gångområden finns för de nådda lägena. Gångtäckningen är ofullständig.'); return; }
    const controller = this.controller = new AbortController();
    this.status('Laddar gångområden från gångnätet…');
    try {
      const profiles: Profiles = {};
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(6, files.length) }, async () => {
        while (cursor < files.length && !controller.signal.aborted) {
          const file = files[cursor++]; Object.assign(profiles, await loadJSON<Profiles>(areas.files[file], controller.signal));
        }
      }));
      if (controller.signal.aborted) return;
      const bands = Array.from({ length: Math.ceil(settings.maxMinutes / 10) }, (_, i) => Math.min((i+1)*10, settings.maxMinutes)).reverse();
      // Opaque fills on one translucent canvas preserve the fastest band's color
      // across overlapping contours. No darker color from repeated alpha blending.
      for (const band of bands) {
        for (const [index, minutes] of walkingMinutes(result.walkSources, band * 60, settings.walkMinutes * 60)) {
          const contour = profiles[stops[index].id]?.find(c => c.minutes === minutes);
          if (!contour) continue;
          L.geoJSON(contour.geometry, {
            pane: 'walking-areas', interactive: false,
            style: { renderer: this.renderer, stroke: false, fillOpacity: 1, fillColor: colorFor(band * 60, settings.maxMinutes) },
          }).addTo(this.layer);
        }
      }
      this.status('Ungefärliga gångområden · ofullständig täckning. En färgad yta garanterar inte tillträde överallt.');
      this.ready();
    } catch (error) {
      if (!controller.signal.aborted) { controller.abort(); this.layer.clearLayers(); this.status('Gångområden kunde inte laddas. Hållplatsresultatet visas fortfarande.'); }
    }
  }
}
