import {profiling,acceptProfile,profileStart,profileEnd} from './core/profile';
import { mobileLayout } from './layout';
import { aboutHTML } from './about';
import L from 'leaflet';
import { JourneyView } from './journey-view';
import { MapProgress } from './map-progress';
import { WalkingView } from './walking-view';
import { isPublicStop, searchStations } from './core/stops';
import { walkingExitGap } from './core/result-notice';
import 'leaflet/dist/leaflet.css';
import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import './style.css';
import { cacheAvailable, loadJSON, loadManifest, pruneCache } from './core/data';
import { bandColors, colorFor, defaults, parseHash, shareHash, validateSettings } from './core/settings';
import { addDays, dateBounds, stockholmNow, validateDate } from './core/time';
import { MODES, MODE_NAMES, type Manifest, type SearchResult, type Settings, type Stop, type Reach, type StationProgress } from './core/types';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const escape = (s: string): string => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const arrow='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
$('#app').innerHTML = `
<header class="topbar"><a class="brand" href="/" aria-label="sliso startsida"><span class="brand-icon">s<span>${arrow}</span></span>sliso<span class="brand-dot">.</span></a><span class="tagline">Stockholm, inom räckhåll.</span><button class="text-button" id="about-open">Om kartan <span aria-hidden="true">${arrow}</span></button></header>
<main>
<aside id="search-settings" class="panel" aria-label="Sökinställningar"><div class="mobile-panel-header"><strong>Sökinställningar</strong><button id="mobile-close-search" type="button">Visa kartan ↓</button></div>
<div class="eyebrow"><span class="live-dot"></span> UTFORSKA MED SL</div>
<h1>Hur långt<br>når <em>du?</em></h1>
<p class="intro">En startplats. En stund på vägen.<br>Upptäck vad som finns inom räckhåll.</p>
<div id="data-banner" class="notice">Laddar hållplatser…</div>
<form id="search-form">
<div class="field search-field"><label for="stop-search"><span class="field-icon" aria-hidden="true">◎</span> Var börjar resan?</label><input id="stop-search" placeholder="Sök hållplats eller station" autocomplete="off" role="combobox" aria-controls="stop-options" aria-autocomplete="list" aria-expanded="false" disabled><ul id="stop-options" role="listbox" hidden></ul></div>
<button id="choose-point" class="choose-point" type="button" disabled>⌖ Välj start på kartan</button><p id="start-data-gap" class="notice demo" hidden></p><div class="field" id="platform-field" hidden><label for="platform">Välj hållplatsläge</label><select id="platform"><option value="">Välj namngivet läge…</option></select></div>
<div class="date-row"><div class="field"><label for="date">Datum</label><input id="date" type="date" required></div><div class="field"><label for="time">Avresetid <span class="label-note">Stockholm</span></label><input id="time" type="time" required></div></div>
<p class="time-note">Initial väntan räknas inte. Vi visar den kortaste restiden bland avgångar i ditt avgångsfönster.</p>
<div class="field range-field"><label for="max-time">Hur länge vill du resa? <output id="max-output" for="max-time">60 <small>min</small></output></label><input id="max-time" type="range" min="10" max="120" step="1" value="60"><div class="range-ends"><span>10 min</span><span>120 min</span></div></div>
<details id="options"><summary><span aria-hidden="true">☷</span> Fler alternativ <span class="summary-meta">Gång, byten & trafikslag</span></summary><div class="options-body"><div class="field"><label for="walk">Max gång per sträcka</label><select id="walk">${[5,10,15,20,25,30].map(n=>`<option value="${n}" ${n===15?'selected':''}>${n} minuter</option>`).join('')}</select><p class="hint">Sammanhängande gång, även via flera hållplatser. 4,8 km/h.</p></div><div class="date-row"><div class="field"><label for="transfers">Max byten</label><select id="transfers">${[0,1,2,3,4].map(n=>`<option value="${n}" ${n===3?'selected':''}>${n} byten</option>`).join('')}</select></div><div class="field"><label for="window">Avgångsfönster</label><input id="window" type="number" min="5" max="120" value="30" required><p class="hint">5–120 minuter</p></div></div><p class="hint">Första påstigning måste ske inom fönstret från vald tid. Väntan vid byten ingår alltid.</p><fieldset><legend>Trafikslag</legend><div class="mode-grid">${MODES.map(m=>`<label class="mode-chip"><input type="checkbox" name="mode" value="${m}" checked><span>${MODE_NAMES[m]}</span></label>`).join('')}</div></fieldset></div></details>
<div id="form-error" class="error" role="alert" hidden></div>
<button id="calculate" class="primary" type="submit" disabled>Visa restidskarta <span aria-hidden="true">${arrow}</span></button><button type="button" id="cancel" class="cancel" hidden>Avbryt beräkning</button>
<div id="status" role="status" aria-live="polite">Välj en hållplats för att börja.</div>
</form><div class="panel-foot"><span aria-hidden="true">◷</span> Planerad trafik · Ingen realtid <button id="data-open" class="text-button">Om datan</button></div>
</aside>
<section class="map-section" aria-label="Restidskarta"><div id="map-progress" class="map-progress" hidden><div role="progressbar" aria-label="Beräkning" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="map-progress-fill"></span></div><span class="map-progress-text"></span></div><div id="map"></div><div id="point-picker" class="point-picker" hidden><span>Tryck på en gångväg eller gata.</span><button id="pick-center" type="button">Välj kartans mitt</button><button id="pick-cancel" type="button">Avbryt</button></div><div class="map-heading"><span class="map-heading-dot"></span><span id="map-label">STOCKHOLM & OMKRING</span></div><button id="reset-search" class="reset-search" title="Välj ny startpunkt och behåll restidsinställningarna" hidden>Ny sökning</button><div id="map-demo" class="map-demo" hidden>TESTDATA · Ej för reseplanering</div><button id="mobile-toggle" class="mobile-toggle" aria-controls="search-settings" aria-expanded="true">Dölj sökpanel ↓</button><button id="map-cancel" class="map-cancel" hidden>Avbryt sökning</button><div class="map-actions"><button id="fit" title="Visa hela trafiknätet" aria-label="Visa hela trafiknätet">⌖</button></div><div id="map-empty" class="map-tip"><span aria-hidden="true">◎</span><div><strong>Allt börjar någonstans.</strong><span>Sök en hållplats eller välj en punkt på kartan.</span></div></div><aside id="journey-panel" class="journey-panel" aria-label="Resedetaljer" aria-labelledby="journey-title" hidden></aside><section id="legend" class="legend" aria-label="Restidsintervall" hidden></section><button id="share" class="share-button" aria-label="Kopiera delningslänk" title="Kopiera delningslänk" disabled><span aria-hidden="true">${arrow}</span> Kopiera delningslänk</button><div class="map-source" id="source-note">Hållplatser och ungefärliga gångområden</div></section>
</main>
<dialog id="info-dialog" aria-labelledby="dialog-title"><div class="dialog-head"><h2 id="dialog-title"></h2><button id="dialog-close" aria-label="Stäng">×</button></div><div id="dialog-body"></div></dialog>`;

const map = L.map('map', { zoomControl: false, preferCanvas: false, maxBoundsViscosity: 1 }).setView([59.345,18.065],11);
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
// OSM standard tiles are optional and replaceable. No prefetch, offline tile caching or API key.
const tiles = import.meta.env.VITE_TILE_URL === 'none' ? '' : (import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
if (tiles) {
  const layer = L.tileLayer(tiles, { maxZoom: 19, attribution: import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  let reported = false;
  layer.on('tileerror', () => { if (!reported) { reported = true; $('#source-note').textContent = 'Bakgrundskartan kunde inte laddas. Hållplatser och beräkning fungerar ändå.'; } });
} else map.attributionControl.addAttribution('sliso · Hållplatskarta utan bakgrundskartor');
const markers: (L.CircleMarker|undefined)[] = [], startLayer = L.layerGroup().addTo(map);
let pointOrigin:{lat:number;lon:number}|undefined, pickingPoint=false;
let coverageBounds:L.LatLngBounds|undefined;
let publicStops:Stop[]=[];
let stops: Stop[] = [], manifest: Manifest, selected = -1, worker: Worker | undefined, generation = 0;
let result: SearchResult | undefined, usedSettings: Settings | undefined, dirty = false;
let settings: Settings, runTimer: ReturnType<typeof setTimeout>;
let activeOption = -1, displayMinutes = 0, displayFrame = 0;
const journeyView = new JourneyView(map, markers, index => { map.closePopup(); setStart(index); if(mobileLayout.matches)setMobileSearch(true); });
const mapProgress=new MapProgress($('#map-progress'));
let previewValues: (Reach|null)[] = [], previewActive=false;
const walkingView = new WalkingView(map, text=>{const el=document.querySelector('#walking-status');if(el)el.textContent=text;}, ()=>{}, (completed,total,failed)=>{
  if(!total){mapProgress.reset();return;}
  mapProgress.update(`3/3 · Gångområden i kartvyn: ${completed} av ${total}${failed?` · ${failed} misslyckades`:''}`,completed,total);
});
const modeInputs = () => [...document.querySelectorAll<HTMLInputElement>('input[name=mode]')];
function showError(message: string) { $('#form-error').textContent = message; $('#form-error').hidden = false; if(mobileLayout.matches)setMobileSearch(true); }
function status(message: string) { $('#status').textContent = message; }
function terminate(message?: string) {
  mapProgress.reset();
  generation++; worker?.terminate(); worker = undefined; clearTimeout(runTimer);
  $('#cancel').hidden = true; $('#map-cancel').hidden=true;
  if (message) status(message);
}
function clearResults() {
  journeyView.reset();walkingView.reset();map.closePopup();mapProgress.reset();previewValues=[];previewActive=false;
  cancelAnimationFrame(displayFrame);displayFrame=0;
  result = undefined; usedSettings = undefined; displayMinutes=0; $('#legend').hidden = true; $('#legend').classList.remove('legend-expanded'); $('#map-empty').hidden = false;
  for (const marker of markers) {
    if(!marker)continue;
    (marker.getElement() as SVGElement).style.display = '';
    marker.setStyle({ color: '#52766e', fillColor: '#f5f6f0', fillOpacity: .9, weight: 1.5, radius: 5 });
  }
  $('#fit').setAttribute('title','Visa hela trafiknätet');$('#fit').setAttribute('aria-label','Visa hela trafiknätet');
}
function invalidate(message = 'Inställningarna har ändrats. Visa en ny restidskarta.') {
  const hadResult = !!result || !!worker;
  terminate(); if(hadResult)clearResults(); dirty = true;
  if (hadResult) status(message);
}
function setStart(index: number, recalculate = false) {
  if(!isPublicStop(stops[index]))return;
  stopPointPicking();pointOrigin=undefined;
  invalidate('Ny startpunkt vald. Visa en ny restidskarta.'); selected = index;
  const stop = stops[index];
  $('#stop-search').setAttribute('aria-expanded','false'); $('#stop-options').hidden = true;
  $<HTMLInputElement>('#stop-search').value = stop.station;
  const siblings = stops.map((s,i) => ({s,i})).filter(({s})=>isPublicStop(s)&&s.station === stop.station);
  $('#platform-field').hidden = siblings.length <= 1;
  $<HTMLSelectElement>('#platform').innerHTML = siblings.map(({s,i})=>`<option value="${i}" ${i===index?'selected':''}>${escape(s.platform)}</option>`).join('');
  startLayer.clearLayers();
  L.marker([stop.lat,stop.lon], { icon:L.divIcon({className:'start-pin',html:'<span>◎</span>',iconSize:[36,42],iconAnchor:[18,42]}) }).addTo(startLayer).bindTooltip('Start: '+escape(stop.name)+' · '+escape(stop.platform));
  $('#start-data-gap').textContent=stop.walking==='estimated'?'Gång härifrån är uppskattad mellan hållplatser med samma namn inom 250 meter. Passagerna är inte verifierade.':'Gånganslutningar saknas från detta läge. Välj ett annat läge vid samma hållplats för att få med fler resor.';
  $('#start-data-gap').hidden=manifest.demo||stop.walking==='available'||!!stop.walkingArea;
  $('#map-label').textContent = `FRÅN ${stop.name.toLocaleUpperCase('sv')}`;
  $('#calculate').removeAttribute('disabled'); $('#share').removeAttribute('disabled');$('#reset-search').hidden=false;map.panTo([stop.lat,stop.lon]);
  status(`Start: ${stop.name}, ${stop.platform}. Redo att beräkna.`);
  if (recalculate) void calculate();
}
function stationChoice(station: string) {
  stopPointPicking();pointOrigin=undefined;
  const matches = stops.map((s,i)=>({s,i})).filter(({s})=>isPublicStop(s)&&s.station===station);
  if (matches.length===1) { setStart(matches[0].i); map.panTo([matches[0].s.lat,matches[0].s.lon]); return; }
  invalidate(); selected = -1; startLayer.clearLayers();
  $('#calculate').setAttribute('disabled',''); $('#share').setAttribute('disabled','');
  $<HTMLInputElement>('#stop-search').value=station;
  $('#platform-field').hidden=false;$('#reset-search').hidden=false;
  $<HTMLSelectElement>('#platform').innerHTML='<option value="">Välj namngivet läge…</option>'+matches.map(({s,i})=>`<option value="${i}">${escape(s.platform)}</option>`).join('');
  $('#platform').focus();status('Stationen har flera lägen. Välj ett namngivet hållplatsläge.');
}
function readSettings(): Settings {
  if(!pointOrigin&&(selected<0||!isPublicStop(stops[selected]))) throw new Error('Välj en hållplats och vid behov ett namngivet hållplatsläge.');
  const stop=pointOrigin?{id:'@point',name:'Vald kartpunkt',...pointOrigin}:stops[selected];
  return { ...(pointOrigin?{origin:'point' as const}:{}),v:1, stop:stop.id,name:stop.name,lat:stop.lat,lon:stop.lon, date:$<HTMLInputElement>('#date').value,time:$<HTMLInputElement>('#time').value,maxMinutes:Number($<HTMLInputElement>('#max-time').value),walkMinutes:Number($<HTMLSelectElement>('#walk').value),maxTransfers:Number($<HTMLSelectElement>('#transfers').value),windowMinutes:Number($<HTMLInputElement>('#window').value),modes:modeInputs().filter(i=>i.checked).map(i=>i.value as Settings['modes'][number]) };
}
function applySettings(s: Settings) {
  $<HTMLInputElement>('#date').value=s.date;$<HTMLInputElement>('#time').value=s.time;
  $<HTMLInputElement>('#max-time').value=String(s.maxMinutes);$('#max-output').innerHTML=`${s.maxMinutes} <small>min</small>`;
  $<HTMLSelectElement>('#walk').value=String(s.walkMinutes);$<HTMLSelectElement>('#transfers').value=String(s.maxTransfers);$<HTMLInputElement>('#window').value=String(s.windowMinutes);
  modeInputs().forEach(i=>i.checked=s.modes.includes(i.value as Settings['modes'][number]));
}
function renderPreview(p: StationProgress) {
  if(!previewActive)return;
  for(const {stop,value} of p.changes){
    previewValues[stop]=value;
    const marker=markers[stop];if(!marker)continue;
    (marker.getElement() as SVGElement).style.display='';
    marker.setStyle({color:'#fff',fillColor:colorFor(value.seconds,settings.maxMinutes),fillOpacity:1,weight:2,radius:7});
  }
  const found=previewValues.filter((value,index)=>value&&isPublicStop(stops[index])).length;
  mapProgress.update(`2/3 · Stationer: ${p.completedRounds} av ${p.totalRounds} steg · ${found} funna`,p.completedRounds,p.totalRounds);
  status(`Beräknar · ${found} hållplatslägen hittills. Färger och restider är preliminära tills sökningen är klar.`);
}
function renderResults(r: SearchResult,s: Settings) {
  previewActive=false;previewValues=[];
  const origin=r.origin;
  const journeyStops=origin?[...stops,{id:'@point',name:'Vald kartpunkt',lat:origin.lat,lon:origin.lon,station:'Vald kartpunkt',platform:'Start på kartlagd gångväg'}]:stops;
  journeyView.setData(r,s,journeyStops);
  if(origin){
    startLayer.clearLayers();addPointPin(origin,true);
    $('#start-data-gap').hidden=false;
    $('#start-data-gap').textContent=`Gångstart på kartlagd väg${origin.snapMetres>=1?`, ${Math.round(origin.snapMetres)} m från vald punkt`:''}. Gången till hållplats räknas in i restid och gånggräns.`;
  }
  result=r; usedSettings=s; dirty=false;$('#map-empty').hidden=true;
  const exitGap=walkingExitGap(r,s,stops);
  const exitWarning='Ingen kollektivresa hittades. De nådda hållplatslägena saknar koppling till kartans gångnät. Resultatet kan därför missa möjliga resor. Prova en närliggande hållplats eller ett annat avgångsfönster.';
  displayMinutes=0;
  $('#legend').innerHTML=`<div class="legend-top"><div><span class="eyebrow">DIN RESTIDSKARTA</span><h2 id="result-count"></h2></div><span class="complete-badge ${exitGap?'exit-gap-badge':''}">${exitGap?'Gångdata saknas':'Färdig'}</span><button id="legend-toggle" class="legend-toggle" aria-expanded="false" aria-controls="legend-details" aria-label="Visa färgskala och kartalternativ">⌃</button></div><div class="legend-scale" aria-hidden="true">${bandColors(s.maxMinutes).map((color,i)=>`<i data-band-end="${Math.min((i+1)*10,s.maxMinutes)}" style="background:${color}"></i>`).join('')}</div><div class="legend-range" aria-hidden="true"><span>0 min</span><span>${s.maxMinutes} min</span></div><div id="legend-details" class="legend-details">${exitGap?`<p class="exit-warning">${exitWarning}</p>`:''}<div class="display-time-control"><label for="display-time">Visa inom <output id="display-output" for="display-time">${s.maxMinutes} min</output></label><input id="display-time" type="range" min="1" max="${s.maxMinutes}" step="1" value="${s.maxMinutes}" aria-describedby="display-hint"><p id="display-hint">Utforska resultatet utan att söka igen.</p><button id="show-all-results" type="button" hidden>Visa alla ${s.maxMinutes} minuter</button></div><div class="bands" role="group" aria-label="Filtrera kartan efter restid">${Array.from({length:Math.ceil(s.maxMinutes/10)},(_,i)=>`<button type="button" data-from="${i*10}" data-minutes="${Math.min((i+1)*10,s.maxMinutes)}" aria-pressed="${i===Math.ceil(s.maxMinutes/10)-1}" aria-label="Visa inom ${Math.min((i+1)*10,s.maxMinutes)} minuter"><i style="background:${bandColors(s.maxMinutes)[i]}"></i>${i*10}–${Math.min((i+1)*10,s.maxMinutes)} min</button>`).join('')}</div><p>Utan initial väntan · Väntan vid byten ingår${s.modes.length===0?' · Endast gång':''}</p><p class="legend-muted">Visar bara hållplatser med känd resa.${!manifest.demo&&!manifest.walkingCoverage?.reviewed?' Saknade gångkopplingar kan ge längre restider och dölja nåbara hållplatser.':''} Övre bandgränsen ingår.</p><p>Hovra för resväg · Klicka eller tryck för att fästa resan.</p><button id="fit-result" class="fit-result">Anpassa kartvyn</button><label class="walking-toggle"><input id="walking-toggle" type="checkbox" ${walkingView.enabled?'checked':''}> Visa gångområden</label><p id="walking-status" class="walking-status" role="status"></p>${r.values.some(v=>v?.requestStop)?'<p>Stopp på signal kan ingå – se hållplatsens restid.</p>':''}</div>`;
  $('#legend').hidden=false;$('#fit-result').onclick=fitCurrentStops;
  $('#legend-toggle').onclick=()=>{
    const open=$('#legend').classList.toggle('legend-expanded');
    $('#legend-toggle').setAttribute('aria-expanded',String(open));
    $('#legend-toggle').setAttribute('aria-label',open?'Dölj färgskala och kartalternativ':'Visa färgskala och kartalternativ');
    $('#legend-toggle').textContent=open?'⌄':'⌃';
    if(open&&mobileLayout.matches){journeyView.close();setMobileSearch(false);}
  };
  $<HTMLInputElement>('#walking-toggle').onchange=()=>walkingView.toggle($<HTMLInputElement>('#walking-toggle').checked);
  walkingView.setData(r,s,manifest,stops);
  setDisplayMinutes(s.displayMinutes??s.maxMinutes);
  $<HTMLInputElement>('#display-time').oninput=e=>{
    const minutes=Number((e.target as HTMLInputElement).value);
    $('#display-output').textContent=`${minutes} min`;
    cancelAnimationFrame(displayFrame);displayFrame=requestAnimationFrame(()=>setDisplayMinutes(minutes));
  };
  $('#show-all-results').onclick=()=>setDisplayMinutes(s.maxMinutes);
  document.querySelectorAll<HTMLButtonElement>('.bands button').forEach(button=>button.onclick=()=>{
    const minutes=Number(button.dataset.minutes);
    setDisplayMinutes(displayMinutes===minutes?s.maxMinutes:minutes);
  });
  const count=r.values.filter((value,i)=>value&&i!==selected&&isPublicStop(stops[i])).length;
  status(exitGap ? exitWarning : count ? `Färdigt. ${count} hållplatslägen nås på högst ${s.maxMinutes} minuter. Beräkning: ${Math.round(r.elapsed)} ms.` : 'Inga andra hållplatslägen nås inom gränserna. Det kan saknas gånganslutningar i underlaget.');
  if (mobileLayout.matches) setMobileSearch(false);
  $('#fit').setAttribute('title','Visa hela resultatet');$('#fit').setAttribute('aria-label','Visa hela resultatet');
}

function setDisplayMinutes(minutes:number) {
  if(!result||!usedSettings)return;
  cancelAnimationFrame(displayFrame);displayFrame=0;
  const initialized=displayMinutes>0;
  displayMinutes=Math.max(1,Math.min(usedSettings.maxMinutes,Math.floor(minutes)));
  journeyView.setCutoff(displayMinutes);
  let count=0;
  result.values.forEach((value,i)=>{
    const marker=markers[i];if(!marker)return;
    const visible=!!value&&value.seconds<=displayMinutes*60;
    const element=marker.getElement() as SVGElement,wasHidden=element.style.display==='none';
    if(wasHidden===visible)element.style.display=visible?'':'none';
    if(visible){
      if(i!==selected)count++;
      if(!initialized||wasHidden)marker.setStyle({color:'#fff',fillColor:colorFor(value!.seconds,usedSettings!.maxMinutes),fillOpacity:1,weight:2,radius:7});
    }else marker.closeTooltip();
  });
  const filtered=displayMinutes<usedSettings.maxMinutes;
  $('#result-count').textContent=`${count} nåbara hållplatslägen${filtered?` · ≤${displayMinutes} min`:''}`;
  $<HTMLInputElement>('#display-time').value=String(displayMinutes);
  $('#display-output').textContent=`${displayMinutes} min`;
  $('#display-time').setAttribute('aria-valuetext',`${displayMinutes} minuter av ${usedSettings.maxMinutes} beräknade`);
  $('#show-all-results').hidden=!filtered;
  document.querySelectorAll<HTMLButtonElement>('.bands button').forEach(button=>{
    const end=Number(button.dataset.minutes);
    button.setAttribute('aria-pressed',String(end===displayMinutes));
    button.classList.toggle('band-outside',Number(button.dataset.from)>=displayMinutes);
  });
  document.querySelectorAll<HTMLElement>('.legend-scale i').forEach((segment,i)=>{
    const start=i*10,end=Number(segment.dataset.bandEnd);
    const portion=Math.max(0,Math.min(1,(displayMinutes-start)/(end-start)));
    segment.style.opacity=portion===0?'.18':'1';
    segment.style.clipPath=portion>0&&portion<1?`inset(0 ${(1-portion)*100}% 0 0)`:'';
  });
  walkingView.setCutoff(displayMinutes);
}

async function calculate(display?:number) {
  $('#form-error').hidden=true;
  try {
    settings=readSettings();if(display!==undefined)settings.displayMinutes=display;validateSettings(settings,manifest.walkingMaxMinutes);validateDate(settings.date,manifest.validFrom,manifest.validTo);
    terminate();clearResults();dirty=false;const id=generation;
    $('#cancel').hidden=false;$('#map-cancel').hidden=false;
    if(mobileLayout.matches)setMobileSearch(false);
    $('#map-empty').hidden=true;previewActive=true;previewValues=stops.map(()=>null);
    markers.forEach((marker,i)=>{if(marker)(marker.getElement() as SVGElement).style.display=i===selected?'':'none';});
    mapProgress.update('1/3 · Laddar och verifierar data',0,1);
    status('Laddar tidtabell och gånganslutningar…');
    worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.id!==generation)return;
      acceptProfile(data.profileEvents);
      if(data.type==='status')status(data.message);
      if(data.type==='progress')mapProgress.update(`1/3 · Data: ${data.completed} av ${data.total} filer`,data.bytesCompleted,data.bytesTotal);
      if(data.type==='access-progress'){mapProgress.update(`1/3 · Gångnät nära startpunkten: ${data.completed} av ${data.total} delar`,data.completed,data.total);status('Söker gångvägar från kartpunkten till närliggande hållplatser…');}
      if(data.type==='stations'){const start=profileStart();renderPreview(data);profileEnd('main.stationBatch',start);}
      if(data.type==='error'){terminate();clearResults();status('Sökningen slutfördes inte. Hållplatsernas nåbarhet är okänd.');showError(data.message);}
      if(data.type==='result'){const start=profileStart(),s=settings;terminate();renderResults(data.result,s);profileEnd('main.results',start);}
    };
    worker.onerror=()=>{terminate();clearResults();showError('Beräkningsprocessen kunde inte köras. Försök igen.');status('Ofärdigt resultat. Nåbarheten är okänd.');};
    worker.postMessage({id,manifest,settings,profiling:profiling()});
    runTimer=setTimeout(()=>{if(worker)status('Beräkningen pågår fortfarande. Kartan kan flyttas och sökningen kan avbrytas.');},10000);
  }catch(e){showError((e as Error).message);}
}
function popup(index: number) {
  const stop=stops[index],value=result?.values[index]??previewValues[index];
  const box=document.createElement('div');box.className='stop-popup';
  const title=document.createElement('h3');title.textContent=stop.name;box.append(title);
  const platform=document.createElement('p');platform.textContent=stop.platform;box.append(platform);
  const detail=document.createElement('p');
  detail.textContent = previewActive ? value ? `Preliminärt ${Math.ceil(value.seconds/60)} min · Beräkningen pågår` : 'Beräkningen pågår. Nåbarheten är ännu okänd.' : result ? value ? `${Math.ceil(value.seconds/60)} min · ${value.kind==='walk'?'Gång':`${Math.max(0,value.boardings-1)} byten`}${value.requestStop?' · Stopp på signal – meddela föraren':''} · Färdig beräkning` : (!manifest.demo&&!manifest.walkingCoverage?.reviewed?'Ingen känd resa. Gångunderlaget är ofullständigt, så nåbarheten är osäker.':'Ej nåbar inom valda gränser i tillgänglig data.') : 'Restid okänd – ingen färdig beräkning.';
  box.append(detail);
  if(value){const note=document.createElement('small');note.textContent='Utan initial väntan. Restiden gäller detta hållplatsläge.';box.append(note);}
  const button=document.createElement('button');button.textContent='Res härifrån ↗';button.className='popup-start';button.onclick=()=>{map.closePopup();setStart(index);};box.append(button);
  L.popup().setLatLng([stop.lat,stop.lon]).setContent(box).openOn(map);
}

function stopPointPicking(){
  pickingPoint=false;$('#point-picker').hidden=true;map.getContainer().classList.remove('picking-point');$('#choose-point').setAttribute('aria-pressed','false');
}
function addPointPin(point:{lat:number;lon:number},mapped=false){
  L.marker([point.lat,point.lon],{icon:L.divIcon({className:'start-pin',html:'<span>◎</span>',iconSize:[36,42],iconAnchor:[18,42]})}).addTo(startLayer).bindTooltip(mapped?'Start på kartlagd gångväg':'Vald startpunkt · gångvägen kontrolleras vid sökning');
}
function setPointStart(point:{lat:number;lon:number}){
  if(!manifest.footpaths){showError('Gångnät för kartstart saknas i denna dataversion.');return;}
  stopPointPicking();invalidate('Ny kartpunkt vald. Visa en ny restidskarta.');selected=-1;
  pointOrigin={lat:Math.round(point.lat*1e7)/1e7,lon:Math.round(point.lon*1e7)/1e7};
  $('#stop-options').hidden=true;$('#stop-search').setAttribute('aria-expanded','false');
  $<HTMLInputElement>('#stop-search').value='Vald kartpunkt';$('#platform-field').hidden=true;
  $('#start-data-gap').hidden=false;$('#start-data-gap').textContent='Gång följer kartlagda vägar. Starten läggs på närmaste gångväg inom 25 m och visas på kartan. Saknas väg får du välja en ny punkt. Gången ingår i restid och gånggräns.';
  startLayer.clearLayers();addPointPin(pointOrigin);$('#calculate').removeAttribute('disabled');$('#share').removeAttribute('disabled');$('#reset-search').hidden=false;
  $('#map-label').textContent='FRÅN VALD KARTPUNKT';$('#form-error').hidden=true;status('Kartpunkt vald. Redo att beräkna gångvägar och resor.');
  if(mobileLayout.matches)setMobileSearch(true);
}
$('#choose-point').onclick=()=>{
  pickingPoint=true;$('#point-picker').hidden=false;map.getContainer().classList.add('picking-point');$('#choose-point').setAttribute('aria-pressed','true');
  journeyView.close();map.closePopup();collapseLegend();$('#stop-options').hidden=true;
  if(mobileLayout.matches)setMobileSearch(false);
  status('Välj start på en gångväg eller gata. Du kan också välja kartans mittpunkt.');
  map.getContainer().focus();
};
$('#pick-center').onclick=()=>{const p=map.getCenter();setPointStart({lat:p.lat,lon:p.lng});};
$('#pick-cancel').onclick=()=>{stopPointPicking();if(mobileLayout.matches)setMobileSearch(true);status('Val av kartpunkt avbrutet.');};
map.on('click',(event:L.LeafletMouseEvent)=>{if(pickingPoint)setPointStart({lat:event.latlng.lat,lon:event.latlng.lng});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pickingPoint)$('#pick-cancel').click();});

$('#search-form').addEventListener('submit',e=>{e.preventDefault();void calculate();});
$('#cancel').onclick=()=>{terminate();clearResults();status('Avbruten. Hållplatsernas nåbarhet är okänd tills en ny sökning är färdig.');if(mobileLayout.matches)setMobileSearch(true);};
$('#map-cancel').onclick=()=>$('#cancel').click();
$('#max-time').addEventListener('input',()=>{$('#max-output').innerHTML=`${$<HTMLInputElement>('#max-time').value} <small>min</small>`;invalidate();});
$('#platform').addEventListener('change',()=>{const value=$<HTMLSelectElement>('#platform').value;if(value!=='')setStart(Number(value));});
$('#search-form').addEventListener('input',e=>{const target=e.target as HTMLInputElement;if(['date','time','window'].includes(target.id))invalidate();});
$('#search-form').addEventListener('change',e=>{const target=e.target as HTMLInputElement;if(['date','time','walk','transfers','window'].includes(target.id)||target.name==='mode'){invalidate();if(target.id==='window'&&(selected>=0||pointOrigin)&&$<HTMLInputElement>('#window').checkValidity())void calculate();}});
$('#stop-search').addEventListener('input',()=>{
  stopPointPicking();pointOrigin=undefined;invalidate();selected=-1;startLayer.clearLayers();$('#calculate').setAttribute('disabled','');$('#share').setAttribute('disabled','');$('#platform-field').hidden=true;$('#start-data-gap').hidden=true;
  const query=$<HTMLInputElement>('#stop-search').value.trim().toLocaleLowerCase('sv');
  const names=searchStations(stops,query);
  const list=$('#stop-options');list.replaceChildren();activeOption=-1;
  if(query)for(const [i,n] of names.entries()){
    const li=document.createElement('li');li.role='option';li.id=`stop-option-${i}`;li.setAttribute('aria-selected','false');
    const b=document.createElement('button');b.type='button';b.textContent=n;b.tabIndex=-1;b.onclick=()=>{stationChoice(n);list.hidden=true;$('#stop-search').setAttribute('aria-expanded','false');};li.append(b);list.append(li);
  }
  if(query&&!names.length){const li=document.createElement('li');li.textContent='Inga hållplatser matchar din sökning.';list.append(li);}
  list.hidden=!query;$('#stop-search').setAttribute('aria-expanded',String(!!query));
});
$('#stop-search').addEventListener('keydown',e=>{
  const choices=[...document.querySelectorAll<HTMLElement>('#stop-options [role=option]')];
  if(e.key==='Escape'){$('#stop-options').hidden=true;$('#stop-search').setAttribute('aria-expanded','false');return;}
  if(['ArrowDown','ArrowUp'].includes(e.key)&&choices.length){e.preventDefault();activeOption=(activeOption+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices.forEach((li,i)=>li.setAttribute('aria-selected',String(i===activeOption)));$('#stop-search').setAttribute('aria-activedescendant',choices[activeOption].id);}
  if(e.key==='Enter'&&choices.length&&!$('#stop-options').hidden){e.preventDefault();choices[Math.max(activeOption,0)].querySelector('button')!.click();}
});
function mapFitPadding() {
  const bottom=result?$('#legend').offsetHeight+(mobileLayout.matches?40:80):40;
  // A short landscape map must still have space left after reserving controls.
  const scale=Math.min(1,Math.max(0,map.getSize().y-80)/(130+bottom));
  return {paddingTopLeft:L.point(30,130*scale),paddingBottomRight:L.point(30,bottom*scale)};
}
function updateMapMinZoom() {
  if(!coverageBounds)return;
  const padding=mapFitPadding();
  // Leaflet clamps getBoundsZoom to the current minimum. Ignore that limit
  // during calculation so a smaller viewport can lower its regional minimum.
  const previous=map.options.minZoom;map.options.minZoom=0;
  let minimum:number;
  try{minimum=map.getBoundsZoom(coverageBounds,false,padding.paddingTopLeft.add(padding.paddingBottomRight));}
  finally{map.options.minZoom=previous;}
  map.setMinZoom(Math.max(0,minimum));
}
function constrainMapToStops() {
  const extent=L.latLngBounds(publicStops.map(stop=>[stop.lat,stop.lon]));
  // At least ~2.8 km accommodates the supported 30-minute walking areas and
  // gives even single-stop datasets a non-degenerate navigable extent.
  const lat=Math.max((extent.getNorth()-extent.getSouth())*.04,.025);
  const lon=Math.max((extent.getEast()-extent.getWest())*.04,.025/Math.max(.1,Math.cos(extent.getCenter().lat*Math.PI/180)));
  coverageBounds=L.latLngBounds([extent.getSouth()-lat,extent.getWest()-lon],[extent.getNorth()+lat,extent.getEast()+lon]);
  map.setMaxBounds(coverageBounds);updateMapMinZoom();
  map.on('resize',updateMapMinZoom);
}
function fitCurrentStops() {
  const visible=stops.filter((stop,i)=>isPublicStop(stop)&&(previewActive?previewValues[i]:!result||(result.values[i]&&result.values[i]!.seconds<=displayMinutes*60)));if(!visible.length)return;
  map.invalidateSize({pan:false});updateMapMinZoom();
  const bounds=L.latLngBounds(visible.map(s=>[s.lat,s.lon]));if(pointOrigin)bounds.extend([pointOrigin.lat,pointOrigin.lon]);const walkingBounds=walkingView.bounds();if(walkingBounds)bounds.extend(walkingBounds);
  map.fitBounds(bounds,{animate:false,maxZoom:14,...mapFitPadding()});
}
$('#fit').onclick=fitCurrentStops;
function resetSearch() {
  stopPointPicking();pointOrigin=undefined;terminate();clearResults();selected=-1;dirty=false;startLayer.clearLayers();
  $<HTMLInputElement>('#stop-search').value='';$('#stop-search').setAttribute('aria-expanded','false');$('#stop-search').removeAttribute('aria-activedescendant');
  $('#stop-options').replaceChildren();$('#stop-options').hidden=true;activeOption=-1;
  $('#platform-field').hidden=true;$('#start-data-gap').hidden=true;$('#form-error').hidden=true;$('#reset-search').hidden=true;
  $('#calculate').setAttribute('disabled','');$('#share').setAttribute('disabled','');$('#map-label').textContent='VÄLJ EN NY STARTPUNKT';
  history.replaceState(null,'',location.pathname+location.search);
  document.body.classList.remove('panel-collapsed');updateMobile();
  status('Välj en ny startpunkt på kartan eller i sökfältet. Dina restidsinställningar är kvar.');
  if(matchMedia('(pointer: fine)').matches)$('#stop-search').focus();
}
$('#reset-search').onclick=resetSearch;
$('#share').onclick=async()=>{
  try{const s=readSettings();if(result&&!dirty&&displayMinutes<s.maxMinutes)s.displayMinutes=displayMinutes;validateSettings(s,manifest.walkingMaxMinutes);validateDate(s.date,manifest.validFrom,manifest.validTo);const hash=shareHash(s);history.replaceState(null,'',hash);await navigator.clipboard.writeText(location.origin+location.pathname+hash);status('Länken är kopierad. Den delar startplats och inställningar, inte ett sparat resultat.');}
  catch(e){showError(`Kunde inte kopiera länken: ${(e as Error).message} Om länken syns i adressfältet kan du kopiera den därifrån.`);}
};
function collapseLegend(){
  $('#legend').classList.remove('legend-expanded');
  const toggle=document.querySelector<HTMLElement>('#legend-toggle');
  if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Visa färgskala och kartalternativ');toggle.textContent='⌃';}
}
function updateMobile(){
  const collapsed=document.body.classList.contains('panel-collapsed');
  $('#mobile-toggle').textContent=collapsed?(pointOrigin?'Kartpunkt · Ändra':selected>=0?stops[selected].name+' · Ändra':'Sök hållplats'):'Visa kartan';
  $('#mobile-toggle').setAttribute('aria-expanded',String(!collapsed));
  setTimeout(()=>map.invalidateSize({pan:true}),0);
}
function setMobileSearch(open:boolean){
  if(open){journeyView.close();map.closePopup();collapseLegend();}
  document.body.classList.toggle('panel-collapsed',!open);updateMobile();
}
$('#mobile-toggle').onclick=()=>setMobileSearch(document.body.classList.contains('panel-collapsed'));
$('#mobile-close-search').onclick=()=>setMobileSearch(false);
$('#journey-panel').addEventListener('journeyopen',()=>{
  if(mobileLayout.matches){setMobileSearch(false);collapseLegend();}
});
mobileLayout.addEventListener('change',()=>updateMobile());
function dialog(title:string,html:string){$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$<HTMLDialogElement>('#info-dialog').showModal();}
$('#dialog-close').onclick=()=>$<HTMLDialogElement>('#info-dialog').close();
$('#about-open').onclick=()=>dialog('Så fungerar sliso',aboutHTML);
$('#data-open').onclick=()=>{if(manifest)dialog('Data & begränsningar',`<p><strong>${manifest.demo?'Syntetisk testdata – ej reseplanering':'Planerad SL-trafik'}</strong></p><p>Uppdaterad: ${escape(manifest.sourceUpdated||manifest.updated.slice(0,10))}<br>Giltighet: ${manifest.validFrom} – ${manifest.validTo}<br>Gång: ${manifest.walkingMaxMinutes} minuter, ${manifest.walkingSpeedKmh} km/h<br>Gångversion: ${escape(manifest.walkingVersion)}${manifest.walkingCoverage?`<br>Gångkopplade lägen: ${manifest.walkingCoverage.boundStops} / ${manifest.walkingCoverage.totalStops}<br>Förberäknade gångpar: ${manifest.walkingCoverage.pairs}`:''}</p><ul>${manifest.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul><p>${manifest.attribution.map(escape).join('<br>')}</p><p>Bakgrundskarta: OpenStreetMap. Ingen analys eller central sökhistorik. Gång mellan hållplatser med samma namn inom 250 meter och granskade stationspassager kan ha uppskattad tid och längd; sådana sträckor märks i resedetaljerna.</p>`);};
async function restoreLink() {
  invalidate('Delningsinställningar laddas.');
  $('#form-error').hidden=true;
  const s=parseHash(location.hash);if(!s)return;
  applySettings(s);
  if(s.origin==='point'){setPointStart(s);map.setView([s.lat,s.lon],16);validateSettings(s,manifest.walkingMaxMinutes);validateDate(s.date,manifest.validFrom,manifest.validTo);await calculate(s.displayMinutes);return;}
  const index=stops.findIndex(stop=>stop.id===s.stop);
  if(index<0||!isPublicStop(stops[index])){invalidate();selected=-1;$('#calculate').setAttribute('disabled','');$('#share').setAttribute('disabled','');startLayer.clearLayers();$<HTMLInputElement>('#stop-search').value=s.name;$('#platform-field').hidden=true;$('#start-data-gap').hidden=true;throw new Error(`Hållplatsläget ”${s.name}” (${s.stop}) ${index<0?'finns inte längre':'har utgått'}. Sök och välj ett aktivt läge; startpunkten har inte flyttats.`);}
  setStart(index);map.setView([stops[index].lat,stops[index].lon],13);
  validateSettings(s,manifest.walkingMaxMinutes);validateDate(s.date,manifest.validFrom,manifest.validTo);
  await calculate(s.displayMinutes);
}
async function init(){
  try{
    manifest=await loadManifest();stops=await loadJSON<Stop[]>(manifest.stops);
    if(!stops.length)throw new Error('Hållplatsdata är tom.');
    publicStops=stops.filter(isPublicStop);
    if(!publicStops.length)throw new Error('Inga aktuella hållplatslägen finns i detta dataset.');
    constrainMapToStops();
    settings=defaults(publicStops[0]);applySettings(settings);
    const [min,max]=dateBounds(manifest.validFrom,manifest.validTo);$<HTMLInputElement>('#date').min=min;$<HTMLInputElement>('#date').max=max;
    $<HTMLSelectElement>('#walk').querySelectorAll('option').forEach(o=>{if(Number(o.value)>manifest.walkingMaxMinutes)o.remove();});
    const banner=$('#data-banner');
    banner.classList.toggle('demo',manifest.demo);$('#map-demo').hidden=!manifest.demo;
    banner.textContent=manifest.demo?'TESTLÄGE · Syntetiska avgångar och gångtider. Ej för reseplanering.':`Tidtabell uppdaterad ${manifest.sourceUpdated||manifest.updated.slice(0,10)} · Giltig t.o.m. ${manifest.validTo}`;
    if(!manifest.demo&&(manifest.sourceUpdated||manifest.updated.slice(0,10))<addDays(stockholmNow().date,-2))banner.textContent+=' · Äldre data: uppdateringen kan ha misslyckats.';
    if(manifest.warnings.length&&!manifest.demo)banner.textContent+=' · Databegränsningar finns, se Om datan.';
    if(!manifest.demo&&!manifest.walkingCoverage?.reviewed){banner.classList.add('demo');banner.textContent=`UTVECKLINGSLÄGE · Tidtabell ${manifest.sourceUpdated||manifest.updated.slice(0,10)}. Ofullständigt gångunderlag kan underskatta nåbarheten.`;$('#map-demo').hidden=false;$('#map-demo').textContent='UTVECKLING · Gångdata ofullständiga';}
    markers.length=stops.length;
    stops.forEach((s,i)=>{if(!isPublicStop(s))return;const m=L.circleMarker([s.lat,s.lon],{radius:5,color:'#52766e',fillColor:'#f5f6f0',fillOpacity:.9,weight:1.5}).addTo(map);m.bindTooltip(escape(s.name)+' · '+escape(s.platform));m.on('mouseover',()=>{if(!pickingPoint&&matchMedia('(hover: hover)').matches)journeyView.hover(i);});m.on('mouseout',()=>journeyView.leave());m.on('click',()=>{if(pickingPoint){setPointStart(s);return;}if(result?.values[i]){map.closePopup();journeyView.pin(i);}else{journeyView.close();if(!result&&!previewActive){setStart(i);if(mobileLayout.matches){setMobileSearch(true);return;}}popup(i);}});const el=m.getElement();if(el){el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',s.name+' · '+s.platform);el.addEventListener('focus',()=>{if(!pickingPoint)journeyView.hover(i);});el.addEventListener('blur',()=>journeyView.leave());el.addEventListener('keydown',e=>{if(['Enter',' '].includes((e as KeyboardEvent).key)){e.preventDefault();if(pickingPoint){setPointStart(s);return;}if(result?.values[i]){map.closePopup();journeyView.pin(i,true);}else{journeyView.close();if(!result&&!previewActive){setStart(i);if(mobileLayout.matches){setMobileSearch(true);return;}}popup(i);}}});}markers[i]=m;});
    $('#stop-search').removeAttribute('disabled');
    if(manifest.footpaths)$('#choose-point').removeAttribute('disabled');
    if(!await cacheAvailable()){const p=document.createElement('p');p.className='hint';p.textContent='Lokal lagring är inte tillgänglig. Data hämtas på nytt vid behov.';banner.after(p);}
    void pruneCache(manifest);
    await restoreLink();
  }catch(e){showError((e as Error).message);status(stops.length?'Kontrollera inställningarna.':'Data kunde inte laddas. Ladda om sidan för att försöka igen.');if(!stops.length)$('#data-banner').textContent='Kontrollera datatillgång och nätverk.';}
}
window.addEventListener('hashchange',()=>{void restoreLink().catch(e=>showError(e.message));});
void init();
