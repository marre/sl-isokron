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
  private renderers: L.Renderer[] = [];
  private panes: HTMLElement[] = [];
  private pane: HTMLElement;

  constructor(private map: L.Map, private status: (text: string) => void, private ready: () => void) {
    this.pane = map.createPane('walking-areas');
    this.pane.style.zIndex = '250'; this.pane.style.opacity = '.4'; this.pane.style.pointerEvents = 'none';
    this.layer.addTo(map);
  }

  private clear() {
    this.controller?.abort(); this.layer.clearLayers();
    for (const renderer of this.renderers) this.map.removeLayer(renderer);
    for (const pane of this.panes) pane.remove();
    this.renderers = []; this.panes = [];
  }
  reset() { this.clear(); this.data = undefined; }
  bounds() { const bounds = this.layer.getBounds(); return bounds.isValid() ? bounds : undefined; }
  setData(result: SearchResult, settings: Settings, manifest: Manifest, stops: Stop[]) {
    this.reset(); this.data = { result, settings, manifest, stops };
    void this.draw();
  }
  toggle(enabled: boolean) { this.enabled = enabled; this.clear(); void this.draw(); }

  private async draw() {
    if (!this.data || !this.enabled) { this.status('Gångområden är dolda.'); return; }
    const { result, settings, manifest, stops } = this.data, areas = manifest.walkingAreas;
    if (!areas) { this.status('Gångområden saknas i detta dataset.'); return; }
    const available = walkingMinutes(result.walkSources, settings.maxMinutes * 60, settings.walkMinutes * 60);
    const files = [...new Set([...available.keys()].map(i => areas.index[stops[i].id]).filter(i => i !== undefined))];
    if (!files.length) { this.status('Inga gångområden finns för de nådda lägena. Gångtäckningen är ofullständig.'); return; }
    const controller = this.controller = new AbortController();
    // Fixed band order makes the fastest color win even when files arrive out of
    // order. All opaque canvases share one translucent parent, avoiding dark seams.
    const needed = new Map<string, { minutes: number; band: number; renderer: L.Renderer }[]>();
    for (let i = 0; i < Math.ceil(settings.maxMinutes / 10); i++) {
      const band = Math.min((i + 1) * 10, settings.maxMinutes);
      const name = `walking-band-${i}`, pane = this.map.createPane(name, this.pane);
      pane.style.zIndex = String(100 - i); this.panes.push(pane);
      const renderer = L.canvas({ pane: name, padding: .2 }); this.renderers.push(renderer);
      for (const [index, minutes] of walkingMinutes(result.walkSources, band * 60, settings.walkMinutes * 60)) {
        const id = stops[index].id, entries = needed.get(id) ?? [];
        // A contour repeated in a slower band adds no visible information.
        if (!entries.some(entry => entry.minutes === minutes)) entries.push({ minutes, band, renderer });
        needed.set(id, entries);
      }
    }
    let cursor = 0, completed = 0, failed = 0;
    const progress = () => this.status(`Laddar och visar gångområden: ${completed} av ${files.length} (${Math.floor(completed / files.length * 100)} %)${failed ? ` · ${failed} kunde inte laddas` : ''}…`);
    progress();
    await Promise.all(Array.from({ length: Math.min(6, files.length) }, async () => {
      while (cursor < files.length && !controller.signal.aborted) {
        const file = files[cursor++];
        try {
          const profiles = await loadJSON<Profiles>(areas.files[file], controller.signal);
          if (controller.signal.aborted) return;
          for (const [id, contours] of Object.entries(profiles)) {
            for (const { minutes, band, renderer } of needed.get(id) ?? []) {
              const contour = contours.find(c => c.minutes === minutes);
              if (contour) L.geoJSON(contour.geometry, {
                interactive: false,
                style: { renderer, stroke: false, fillOpacity: 1, fillColor: colorFor(band * 60, settings.maxMinutes) },
              }).addTo(this.layer);
            }
          }
        } catch {
          if (controller.signal.aborted) return;
          failed++;
        }
        completed++; progress();
        // Let the browser paint each batch and handle input before loading more.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }));
    if (controller.signal.aborted) return;
    this.status(failed
      ? `Gångområden visas delvis · ${failed} av ${files.length} underlag kunde inte laddas. Slå av och på gångområden för att försöka igen.`
      : 'Ungefärliga gångområden · ofullständig täckning. En färgad yta garanterar inte tillträde överallt.');
    this.ready();
  }
}
