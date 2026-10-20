import L from 'leaflet';
import { journeyFor, journeyTime } from './core/journey';
import { distanceText } from './core/walking';
import { colorFor } from './core/settings';
import { MODE_NAMES, type JourneyLeg, type Mode, type SearchResult, type Settings, type Stop } from './core/types';

const COLORS: Record<Mode, string> = { bus: '#245e49', metro: '#15516d', rail: '#724f8a', tram: '#946013', boat: '#156b72' };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const minutes = (seconds: number) => `${Math.ceil(seconds / 60)} min`;

export class JourneyView {
  private layer: L.LayerGroup;
  private result?: SearchResult;
  private settings?: Settings;
  private stops: Stop[] = [];
  private active: number | null = null;
  private pinned: number | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private panel = document.querySelector<HTMLElement>('#journey-panel')!;

  constructor(private map: L.Map, private markers: L.CircleMarker[], private onStart: (index: number) => void) {
    const pane = map.createPane('journey'); pane.style.zIndex = '450'; pane.style.pointerEvents = 'none';
    this.layer = L.layerGroup().addTo(map);
    this.panel.addEventListener('mouseenter', () => clearTimeout(this.timer));
    this.panel.addEventListener('mouseleave', () => this.leave());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.panel.hidden && !document.querySelector('dialog[open]')) {
        this.close(); this.map.getContainer().focus();
      }
    });
  }

  setData(result: SearchResult, settings: Settings, stops: Stop[]) {
    this.reset(); this.result = result; this.settings = settings; this.stops = stops;
  }

  reset() { this.close(); this.result = undefined; this.settings = undefined; }

  close() {
    clearTimeout(this.timer); this.pinned = null; this.hide();
  }

  hover(index: number) {
    clearTimeout(this.timer);
    if (this.pinned === null) this.show(index);
  }

  pin(index: number, focus = false) {
    clearTimeout(this.timer); this.pinned = index; this.show(index);
    if (focus && !this.panel.hidden) this.panel.querySelector<HTMLButtonElement>('#journey-pin')!.focus({ preventScroll: true });
  }

  leave() {
    clearTimeout(this.timer);
    if (this.pinned === null) this.timer = setTimeout(() => this.hide(), 180);
  }

  private hide() {
    if (this.active !== null && this.result && this.settings) {
      const value = this.result.values[this.active];
      if (value) this.markers[this.active].setStyle({ color: '#fff', fillColor: colorFor(value.seconds, this.settings.maxMinutes), weight: 2, radius: 7 });
    }
    this.active = null; this.layer.clearLayers(); this.panel.hidden = true;
    this.panel.closest('.map-section')!.classList.remove('journey-open');
  }

  private show(index: number) {
    const result = this.result, settings = this.settings, value = result?.values[index];
    if (!result || !settings || !value) { this.hide(); return; }
    if (this.active === index && !this.panel.hidden) {
      const button = this.panel.querySelector<HTMLButtonElement>('#journey-pin')!;
      button.textContent = this.pinned === index ? 'Fäst ✓' : 'Fäst resan';
      button.setAttribute('aria-pressed', String(this.pinned === index)); return;
    }
    this.hide(); this.active = index;
    const legs = journeyFor(result, index), destination = this.stops[index];
    const point = (i: number): L.LatLngTuple => [this.stops[i].lat, this.stops[i].lon];
    for (const leg of legs) {
      const coords = leg.stops.map(point), color = leg.kind === 'walk' ? '#55645f' : COLORS[result.routes[leg.route!].mode];
      L.polyline(coords, { pane: 'journey', interactive: false, color: '#fff', weight: 9, opacity: .95, className: 'journey-halo' }).addTo(this.layer);
      L.polyline(coords, { pane: 'journey', interactive: false, color, weight: 4, opacity: 1, dashArray: leg.kind === 'walk' ? '5 7' : undefined, className: `journey-line journey-${leg.kind}` }).addTo(this.layer);
      for (const stop of leg.stops) L.circleMarker(point(stop), { pane: 'journey', interactive: false, radius: 3, color, fillColor: '#fff', fillOpacity: 1, weight: 1.5 }).addTo(this.layer);
    }
    this.markers[index].setStyle({ radius: 10, weight: 3, color: '#183e36' });
    L.circleMarker(point(index), { pane: 'journey', interactive: false, radius: 10, weight: 3, color: '#183e36', fillColor: colorFor(value.seconds, settings.maxMinutes), fillOpacity: 1 }).addTo(this.layer);
    const time = (epoch: number) => `<time datetime="${new Date(epoch * 1000).toISOString()}">${journeyTime(epoch, settings.date)}</time>`;
    const stopRow = (at: number, epoch: number) => `<div class="journey-stop">${time(epoch)}<div><strong>${escape(this.stops[at].name)}</strong><small>${escape(this.stops[at].platform)}</small></div></div>`;
    const rows = legs.map((leg, i) => {
      const route = leg.kind === 'transit' ? result.routes[leg.route!] : undefined;
      const color = route ? COLORS[route.mode] : '#55645f';
      const previous = legs[i - 1], wait = previous ? leg.departure - previous.arrival : 0;
      return `${wait > 0 ? `<li class="journey-wait">Väntan vid byte · ${minutes(wait)}</li>` : ''}<li class="journey-leg" style="--leg-color:${color}"><div class="journey-leg-head"><span class="journey-step">${i + 1}</span><div><strong>${route ? escape(MODE_NAMES[route.mode]) + ' · ' + escape(route.name) : 'Gång'}</strong><span>${minutes(leg.arrival - leg.departure)}${leg.kind === 'walk' ? ' · '+distanceText(leg.metres) : ''}${leg.kind === 'transit' && leg.stops.length > 2 ? ` · via ${leg.stops.length - 2} hållplatser` : ''}</span></div></div>${stopRow(leg.from, leg.departure)}${stopRow(leg.to, leg.arrival)}${leg.requestStop ? '<p class="journey-request">Stopp på signal – meddela föraren.</p>' : ''}</li>`;
    }).join('');
    const walks=legs.filter(l=>l.kind==='walk'),walkingSeconds=walks.reduce((sum,l)=>sum+l.arrival-l.departure,0);
    const walkingMetres=walks.every(l=>l.metres!==undefined)?walks.reduce((sum,l)=>sum+l.metres!,0):undefined;
    this.panel.innerHTML = `<div class="journey-header"><div><span class="eyebrow">RESAN TILL</span><h2 id="journey-title">${escape(destination.name)}</h2><p>${escape(destination.platform)}</p></div><button id="journey-close" aria-label="Stäng resedetaljer">×</button></div><div class="journey-scroll"><div class="journey-summary"><strong>${minutes(value.seconds)}</strong><span>${value.kind === 'walk' ? 'Gång' : `${Math.max(0, value.boardings - 1)} ${value.boardings === 2 ? 'byte' : 'byten'}`}</span><button id="journey-pin" aria-pressed="${this.pinned === index}">${this.pinned === index ? 'Fäst ✓' : 'Fäst resan'}</button></div>${legs.length ? `<p class="journey-times">Avgång ${time(legs[0].departure)}<br>Ankomst ${time(legs.at(-1)!.arrival)}</p>${walks.length?`<p class="journey-walking">Gång totalt: ${minutes(walkingSeconds)} · ${distanceText(walkingMetres)}</p>`:''}<ol class="journey-legs">${rows}</ol>` : '<p>Du är redan vid starthållplatsen.</p>'}<p class="journey-note">Planerade tider i Stockholmstid. Initial väntan räknas inte; väntan vid byten ingår.</p><p class="journey-note">Schematisk resväg via hållplatserna. Linjerna visar inte exakt spår- eller gånggeometri. Streckad linje betyder gång.</p><div class="journey-actions"><button id="journey-fit" ${legs.length ? '' : 'disabled'}>Visa hela resvägen</button><button id="journey-start">Res härifrån</button></div></div>`;
    this.panel.hidden = false; this.panel.closest('.map-section')!.classList.add('journey-open');
    this.panel.querySelector<HTMLButtonElement>('#journey-close')!.onclick = () => { this.close(); this.map.getContainer().focus(); };
    this.panel.querySelector<HTMLButtonElement>('#journey-pin')!.onclick = () => { this.pinned = this.pinned === index ? null : index; this.show(index); };
    this.panel.querySelector<HTMLButtonElement>('#journey-start')!.onclick = () => this.onStart(index);
    this.panel.querySelector<HTMLButtonElement>('#journey-fit')!.onclick = () => this.fit(legs);
  }

  private fit(legs: JourneyLeg[]) {
    const coords = legs.flatMap(leg => leg.stops.map(i => [this.stops[i].lat, this.stops[i].lon] as L.LatLngTuple));
    if (!coords.length) return;
    const mobile = window.innerWidth <= 760;
    // Mobile search-panel collapse changes the map size before its delayed resize.
    this.map.invalidateSize({ pan: false });
    const legend = document.querySelector<HTMLElement>('#legend')!;
    const bottom = getComputedStyle(legend).visibility === 'hidden' ? 30 : legend.offsetHeight + 80;
    this.map.fitBounds(L.latLngBounds(coords), { animate: false, maxZoom: 15, paddingTopLeft: [24, 110], paddingBottomRight: mobile ? [24, this.panel.offsetHeight + 45] : [Math.min(this.map.getSize().x * .45, this.panel.offsetWidth + 100), bottom] });
  }
}
