import L from 'leaflet';
import { JourneyView } from './journey-view';
import { WalkingView } from './walking-view';
import { searchStations } from './core/stops';
import 'leaflet/dist/leaflet.css';
import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import './style.css';
import { cacheAvailable, loadJSON, loadManifest, pruneCache } from './core/data';
import { bandColors, colorFor, defaults, parseHash, shareHash, validateSettings } from './core/settings';
import { addDays, dateBounds, stockholmNow, validateDate } from './core/time';
import { MODES, MODE_NAMES, type Manifest, type SearchResult, type Settings, type Stop } from './core/types';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const escape = (s: string): string => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const arrow='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
$('#app').innerHTML = `
<header class="topbar"><a class="brand" href="/" aria-label="sliso startsida"><span class="brand-icon">s<span>${arrow}</span></span>sliso<span class="brand-dot">.</span></a><span class="tagline">Stockholm, inom räckhåll.</span><button class="text-button" id="about-open">Om kartan <span aria-hidden="true">${arrow}</span></button></header>
<main>
<aside class="panel" aria-label="Sökinställningar">
<div class="eyebrow"><span class="live-dot"></span> UTFORSKA MED SL</div>
<h1>Hur långt<br>når <em>du?</em></h1>
<p class="intro">En startplats. En stund på vägen.<br>Upptäck vad som finns inom räckhåll.</p>
<div id="data-banner" class="notice">Laddar hållplatser…</div>
<form id="search-form">
<div class="field search-field"><label for="stop-search"><span class="field-icon" aria-hidden="true">◎</span> Var börjar resan?</label><input id="stop-search" placeholder="Sök hållplats eller station" autocomplete="off" role="combobox" aria-controls="stop-options" aria-autocomplete="list" aria-expanded="false" disabled><ul id="stop-options" role="listbox" hidden></ul></div>
<p id="start-data-gap" class="notice demo" hidden></p><div class="field" id="platform-field" hidden><label for="platform">Välj hållplatsläge</label><select id="platform"><option value="">Välj namngivet läge…</option></select></div>
<div class="date-row"><div class="field"><label for="date">Datum</label><input id="date" type="date" required></div><div class="field"><label for="time">Avresetid <span class="label-note">Stockholm</span></label><input id="time" type="time" required></div></div>
<p class="time-note">Initial väntan räknas inte. Vi visar den kortaste restiden bland avgångar i ditt avgångsfönster.</p>
<div class="field range-field"><label for="max-time">Hur länge vill du resa? <output id="max-output" for="max-time">60 <small>min</small></output></label><input id="max-time" type="range" min="10" max="120" step="1" value="60"><div class="range-ends"><span>10 min</span><span>120 min</span></div></div>
<details id="options"><summary><span aria-hidden="true">☷</span> Fler alternativ <span class="summary-meta">Gång, byten & trafikslag</span></summary><div class="options-body"><div class="field"><label for="walk">Max gång per sträcka</label><select id="walk">${[5,10,15,20,25,30].map(n=>`<option value="${n}" ${n===15?'selected':''}>${n} minuter</option>`).join('')}</select><p class="hint">Sammanhängande gång, även via flera hållplatser. 4,8 km/h.</p></div><div class="date-row"><div class="field"><label for="transfers">Max byten</label><select id="transfers">${[0,1,2,3,4].map(n=>`<option value="${n}" ${n===3?'selected':''}>${n} byten</option>`).join('')}</select></div><div class="field"><label for="window">Avgångsfönster</label><input id="window" type="number" min="5" max="120" value="30" required><p class="hint">5–120 minuter</p></div></div><p class="hint">Första påstigning måste ske inom fönstret från vald tid. Väntan vid byten ingår alltid.</p><fieldset><legend>Trafikslag</legend><div class="mode-grid">${MODES.map(m=>`<label class="mode-chip"><input type="checkbox" name="mode" value="${m}" checked><span>${MODE_NAMES[m]}</span></label>`).join('')}</div></fieldset></div></details>
<div id="form-error" class="error" role="alert" hidden></div>
<button id="calculate" class="primary" type="submit" disabled>Visa restidskarta <span aria-hidden="true">${arrow}</span></button><button type="button" id="cancel" class="cancel" hidden>Avbryt beräkning</button>
<div id="status" role="status" aria-live="polite">Välj en hållplats för att börja.</div>
</form><div class="panel-foot"><span aria-hidden="true">◷</span> Planerad trafik · Ingen realtid <button id="data-open" class="text-button">Om datan</button></div>
</aside>
<section class="map-section" aria-label="Restidskarta"><div id="map"></div><div class="map-heading"><span class="map-heading-dot"></span><span id="map-label">STOCKHOLM & OMKRING</span></div><button id="reset-search" class="reset-search" title="Välj ny startpunkt och behåll restidsinställningarna" hidden>Ny sökning</button><div id="map-demo" class="map-demo" hidden>TESTDATA · Ej för reseplanering</div><button id="mobile-toggle" class="mobile-toggle" aria-expanded="true">Dölj sökpanel ↓</button><div class="map-actions"><button id="fit" title="Visa hela trafiknätet" aria-label="Visa hela trafiknätet">⌖</button></div><div id="map-empty" class="map-tip"><span aria-hidden="true">◎</span><div><strong>Allt börjar någonstans.</strong><span>Sök en hållplats eller välj en punkt på kartan.</span></div></div><aside id="journey-panel" class="journey-panel" aria-label="Resedetaljer" aria-labelledby="journey-title" hidden></aside><section id="legend" class="legend" aria-label="Restidsintervall" hidden></section><button id="share" class="share-button" disabled><span aria-hidden="true">${arrow}</span> Kopiera delningslänk</button><div class="map-source" id="source-note">Hållplatser och ungefärliga gångområden</div></section>
</main>
<dialog id="info-dialog"><div class="dialog-head"><h2 id="dialog-title"></h2><button id="dialog-close" aria-label="Stäng">×</button></div><div id="dialog-body"></div></dialog>`;

const map = L.map('map', { zoomControl: false, preferCanvas: false }).setView([59.345,18.065],11);
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
// OSM standard tiles are optional and replaceable. No prefetch, offline tile caching or API key.
const tiles = import.meta.env.VITE_TILE_URL === 'none' ? '' : (import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
if (tiles) {
  const layer = L.tileLayer(tiles, { maxZoom: 19, attribution: import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  let reported = false;
  layer.on('tileerror', () => { if (!reported) { reported = true; $('#source-note').textContent = 'Bakgrundskartan kunde inte laddas. Hållplatser och beräkning fungerar ändå.'; } });
} else map.attributionControl.addAttribution('sliso · Hållplatskarta utan bakgrundskartor');
const markers: L.CircleMarker[] = [], startLayer = L.layerGroup().addTo(map);
let stops: Stop[] = [], manifest: Manifest, selected = -1, worker: Worker | undefined, generation = 0;
let result: SearchResult | undefined, usedSettings: Settings | undefined, dirty = false;
let settings: Settings, runTimer: ReturnType<typeof setTimeout>;
let activeOption = -1;
const journeyView = new JourneyView(map, markers, index => { map.closePopup(); setStart(index); });
const walkingView = new WalkingView(map, text=>{const el=document.querySelector('#walking-status');if(el)el.textContent=text;}, ()=>{});
const modeInputs = () => [...document.querySelectorAll<HTMLInputElement>('input[name=mode]')];
function showError(message: string) { $('#form-error').textContent = message; $('#form-error').hidden = false; }
function status(message: string) { $('#status').textContent = message; }
function terminate(message?: string) {
  generation++; worker?.terminate(); worker = undefined; clearTimeout(runTimer);
  $('#cancel').hidden = true;
  if (message) status(message);
}
function clearResults() {
  journeyView.reset();walkingView.reset();map.closePopup();
  result = undefined; usedSettings = undefined; $('#legend').hidden = true; $('#map-empty').hidden = false;
  for (const marker of markers) {
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
  invalidate('Ny startpunkt vald. Visa en ny restidskarta.'); selected = index;
  const stop = stops[index];
  $('#stop-search').setAttribute('aria-expanded','false'); $('#stop-options').hidden = true;
  $<HTMLInputElement>('#stop-search').value = stop.station;
  const siblings = stops.map((s,i) => ({s,i})).filter(({s})=>s.station === stop.station);
  $('#platform-field').hidden = siblings.length <= 1;
  $<HTMLSelectElement>('#platform').innerHTML = siblings.map(({s,i})=>`<option value="${i}" ${i===index?'selected':''}>${escape(s.platform)}</option>`).join('');
  startLayer.clearLayers();
  L.marker([stop.lat,stop.lon], { icon:L.divIcon({className:'start-pin',html:'<span>◎</span>',iconSize:[36,42],iconAnchor:[18,42]}) }).addTo(startLayer).bindTooltip('Start: '+escape(stop.name)+' · '+escape(stop.platform));
  $('#start-data-gap').hidden=manifest.demo||stop.walking==='available'||!!stop.walkingArea;
  $('#start-data-gap').textContent='Gånganslutningar saknas från detta läge. Resultatet kan sakna gångresor och byten.';
  $('#map-label').textContent = `FRÅN ${stop.name.toLocaleUpperCase('sv')}`;
  $('#calculate').removeAttribute('disabled'); $('#share').removeAttribute('disabled');$('#reset-search').hidden=false;map.panTo([stop.lat,stop.lon]);
  status(`Start: ${stop.name}, ${stop.platform}. Redo att beräkna.`);
  if (recalculate) void calculate();
}
function stationChoice(station: string) {
  const matches = stops.map((s,i)=>({s,i})).filter(({s})=>s.station===station);
  if (matches.length===1) { setStart(matches[0].i); map.panTo([matches[0].s.lat,matches[0].s.lon]); return; }
  invalidate(); selected = -1; startLayer.clearLayers();
  $('#calculate').setAttribute('disabled',''); $('#share').setAttribute('disabled','');
  $<HTMLInputElement>('#stop-search').value=station;
  $('#platform-field').hidden=false;$('#reset-search').hidden=false;
  $<HTMLSelectElement>('#platform').innerHTML='<option value="">Välj namngivet läge…</option>'+matches.map(({s,i})=>`<option value="${i}">${escape(s.platform)}</option>`).join('');
  $('#platform').focus();status('Stationen har flera lägen. Välj ett namngivet hållplatsläge.');
}
function readSettings(): Settings {
  if(selected<0) throw new Error('Välj en hållplats och vid behov ett namngivet hållplatsläge.');
  const stop=stops[selected];
  return { v:1, stop:stop.id,name:stop.name,lat:stop.lat,lon:stop.lon, date:$<HTMLInputElement>('#date').value,time:$<HTMLInputElement>('#time').value,maxMinutes:Number($<HTMLInputElement>('#max-time').value),walkMinutes:Number($<HTMLSelectElement>('#walk').value),maxTransfers:Number($<HTMLSelectElement>('#transfers').value),windowMinutes:Number($<HTMLInputElement>('#window').value),modes:modeInputs().filter(i=>i.checked).map(i=>i.value as Settings['modes'][number]) };
}
function applySettings(s: Settings) {
  $<HTMLInputElement>('#date').value=s.date;$<HTMLInputElement>('#time').value=s.time;
  $<HTMLInputElement>('#max-time').value=String(s.maxMinutes);$('#max-output').innerHTML=`${s.maxMinutes} <small>min</small>`;
  $<HTMLSelectElement>('#walk').value=String(s.walkMinutes);$<HTMLSelectElement>('#transfers').value=String(s.maxTransfers);$<HTMLInputElement>('#window').value=String(s.windowMinutes);
  modeInputs().forEach(i=>i.checked=s.modes.includes(i.value as Settings['modes'][number]));
}
function renderResults(r: SearchResult,s: Settings) {
  journeyView.setData(r,s,stops);
  result=r; usedSettings=s; dirty=false;$('#map-empty').hidden=true;
  let count=0;
  r.values.forEach((v,i)=>{
    if (v && i!==selected) count++;
    (markers[i].getElement() as SVGElement).style.display=v?'':'none';
    if(v)markers[i].setStyle({color:'#fff',fillColor:colorFor(v.seconds,s.maxMinutes),fillOpacity:1,weight:2,radius:7});
  });
  $('#legend').innerHTML=`<div class="legend-top"><div><span class="eyebrow">DIN RESTIDSKARTA</span><h2>${count} nåbara hållplatslägen</h2></div><span class="complete-badge">Färdig</span></div><div class="bands">${Array.from({length:Math.ceil(s.maxMinutes/10)},(_,i)=>`<span><i style="background:${bandColors(s.maxMinutes)[i]}"></i>${i*10}–${Math.min((i+1)*10,s.maxMinutes)} min</span>`).join('')}</div><p>Utan initial väntan · Väntan vid byten ingår${s.modes.length===0?' · Endast gång':''}</p><p class="legend-muted">Visar bara hållplatser med känd resa.${!manifest.demo&&!manifest.walkingCoverage?.reviewed?' Dolda hållplatser kan sakna gångdata.':''} Övre bandgränsen ingår.</p><p>Hovra för resväg · Klicka eller tryck för att fästa resan.</p><button id="fit-result" class="fit-result">Visa hela resultatet</button><label class="walking-toggle"><input id="walking-toggle" type="checkbox" ${walkingView.enabled?'checked':''}> Visa gångområden</label><p id="walking-status" class="walking-status" role="status"></p>${r.values.some(v=>v?.requestStop)?'<p>Stopp på signal kan ingå – se hållplatsens restid.</p>':''}`;
  $('#legend').hidden=false;$('#fit-result').onclick=fitCurrentStops;
  $<HTMLInputElement>('#walking-toggle').onchange=()=>walkingView.toggle($<HTMLInputElement>('#walking-toggle').checked);
  walkingView.setData(r,s,manifest,stops);
  status(count ? `Färdigt. ${count} hållplatslägen nås på högst ${s.maxMinutes} minuter. Beräkning: ${Math.round(r.elapsed)} ms.` : 'Inga andra hållplatslägen nås inom gränserna. Det kan saknas gånganslutningar i underlaget.');
  if (window.innerWidth<760) { document.body.classList.add('panel-collapsed'); updateMobile(); }
  $('#fit').setAttribute('title','Visa hela resultatet');$('#fit').setAttribute('aria-label','Visa hela resultatet');
}

async function calculate() {
  $('#form-error').hidden=true;
  try {
    settings=readSettings();validateSettings(settings,manifest.walkingMaxMinutes);validateDate(settings.date,manifest.validFrom,manifest.validTo);
    terminate();clearResults();dirty=false;const id=generation;
    $('#cancel').hidden=false;$('#map-empty').hidden=true;
    status('Laddar tidtabell och gånganslutningar…');
    worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.id!==generation)return;
      if(data.type==='status')status(data.message);
      if(data.type==='error'){terminate();clearResults();status('Sökningen slutfördes inte. Hållplatsernas nåbarhet är okänd.');showError(data.message);}
      if(data.type==='result'){const s=settings;terminate();renderResults(data.result,s);}
    };
    worker.onerror=()=>{terminate();clearResults();showError('Beräkningsprocessen kunde inte köras. Försök igen.');status('Ofärdigt resultat. Nåbarheten är okänd.');};
    worker.postMessage({id,manifest,settings});
    runTimer=setTimeout(()=>{if(worker)status('Beräkningen pågår fortfarande. Kartan kan flyttas och sökningen kan avbrytas.');},10000);
  }catch(e){showError((e as Error).message);}
}
function popup(index: number) {
  const stop=stops[index],value=result?.values[index];
  const box=document.createElement('div');box.className='stop-popup';
  const title=document.createElement('h3');title.textContent=stop.name;box.append(title);
  const platform=document.createElement('p');platform.textContent=stop.platform;box.append(platform);
  const detail=document.createElement('p');
  detail.textContent = result ? value ? `${Math.ceil(value.seconds/60)} min · ${value.kind==='walk'?'Gång':`${Math.max(0,value.boardings-1)} byten`}${value.requestStop?' · Stopp på signal – meddela föraren':''} · Färdig beräkning` : (!manifest.demo&&!manifest.walkingCoverage?.reviewed?'Ingen känd resa. Gångunderlaget är ofullständigt, så nåbarheten är osäker.':'Ej nåbar inom valda gränser i tillgänglig data.') : 'Restid okänd – ingen färdig beräkning.';
  box.append(detail);
  if(value){const note=document.createElement('small');note.textContent='Utan initial väntan. Restiden gäller detta hållplatsläge.';box.append(note);}
  const button=document.createElement('button');button.textContent='Res härifrån ↗';button.className='popup-start';button.onclick=()=>{map.closePopup();setStart(index);};box.append(button);
  L.popup().setLatLng([stop.lat,stop.lon]).setContent(box).openOn(map);
}
$('#search-form').addEventListener('submit',e=>{e.preventDefault();void calculate();});
$('#cancel').onclick=()=>{terminate();clearResults();status('Avbruten. Hållplatsernas nåbarhet är okänd tills en ny sökning är färdig.');};
$('#max-time').addEventListener('input',()=>{$('#max-output').innerHTML=`${$<HTMLInputElement>('#max-time').value} <small>min</small>`;invalidate();});
$('#platform').addEventListener('change',()=>{const value=$<HTMLSelectElement>('#platform').value;if(value!=='')setStart(Number(value));});
$('#search-form').addEventListener('input',e=>{const target=e.target as HTMLInputElement;if(['date','time','window'].includes(target.id))invalidate();});
$('#search-form').addEventListener('change',e=>{const target=e.target as HTMLInputElement;if(['date','time','walk','transfers','window'].includes(target.id)||target.name==='mode'){invalidate();if(target.id==='window'&&selected>=0&&$<HTMLInputElement>('#window').checkValidity())void calculate();}});
$('#stop-search').addEventListener('input',()=>{
  invalidate();selected=-1;startLayer.clearLayers();$('#calculate').setAttribute('disabled','');$('#share').setAttribute('disabled','');$('#platform-field').hidden=true;$('#start-data-gap').hidden=true;
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
function fitCurrentStops() {
  const visible=stops.filter((_,i)=>!result||result.values[i]);if(!visible.length)return;
  map.invalidateSize({pan:false});
  const bounds=L.latLngBounds(visible.map(s=>[s.lat,s.lon]));const walkingBounds=walkingView.bounds();if(walkingBounds)bounds.extend(walkingBounds);
  map.fitBounds(bounds,{animate:false,maxZoom:14,paddingTopLeft:[30,130],paddingBottomRight:[30,result?$('#legend').offsetHeight+80:40]});
}
$('#fit').onclick=fitCurrentStops;
function resetSearch() {
  terminate();clearResults();selected=-1;dirty=false;startLayer.clearLayers();
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
  try{const s=readSettings();validateSettings(s,manifest.walkingMaxMinutes);validateDate(s.date,manifest.validFrom,manifest.validTo);const hash=shareHash(s);history.replaceState(null,'',hash);await navigator.clipboard.writeText(location.origin+location.pathname+hash);status('Länken är kopierad. Den delar startplats och inställningar, inte ett sparat resultat.');}
  catch(e){showError(`Kunde inte kopiera länken: ${(e as Error).message} Om länken syns i adressfältet kan du kopiera den därifrån.`);}
};
function updateMobile(){const collapsed=document.body.classList.contains('panel-collapsed');$('#mobile-toggle').textContent=collapsed?'Visa sökpanel ↑':'Dölj sökpanel ↓';$('#mobile-toggle').setAttribute('aria-expanded',String(!collapsed));setTimeout(()=>map.invalidateSize(),200);}
$('#mobile-toggle').onclick=()=>{document.body.classList.toggle('panel-collapsed');updateMobile();};
function dialog(title:string,html:string){$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$<HTMLDialogElement>('#info-dialog').showModal();}
$('#dialog-close').onclick=()=>$<HTMLDialogElement>('#info-dialog').close();
$('#about-open').onclick=()=>dialog('En annan sorts restidskarta',`<p>sliso visar minsta restid till varje hållplatsläge, bland tillåtna avgångar i ditt avgångsfönster. Olika hållplatser kan bygga på olika avgångar.</p><p>Väntan före första påstigning räknas inte. All färd, gång och väntan vid byten ingår. Exempel: gång 5 min + färd 20 min + byte 7 min + färd 10 min = <strong>42 minuter</strong>.</p><p>Kartan visar hållplatser och, där gångunderlag finns, ungefärliga gångområden. Ytorna uppskattas från ett gångnät och kan innehålla otillgängliga delar. De garanterar inte tillträde till alla entréer. Uppgifterna är planerade; realtid saknas.</p><p>Delningslänken innehåller startplatsens ID, namn och koordinater samt datum, tid och alla filter. Alla som har länken kan läsa dem. Resultat kan förändras när data uppdateras.</p>`);
$('#data-open').onclick=()=>{if(manifest)dialog('Data & begränsningar',`<p><strong>${manifest.demo?'Syntetisk testdata – ej reseplanering':'Planerad SL-trafik'}</strong></p><p>Uppdaterad: ${escape(manifest.sourceUpdated||manifest.updated.slice(0,10))}<br>Giltighet: ${manifest.validFrom} – ${manifest.validTo}<br>Gång: ${manifest.walkingMaxMinutes} minuter, ${manifest.walkingSpeedKmh} km/h<br>Gångversion: ${escape(manifest.walkingVersion)}${manifest.walkingCoverage?`<br>Gångkopplade lägen: ${manifest.walkingCoverage.boundStops} / ${manifest.walkingCoverage.totalStops}<br>Förberäknade gångpar: ${manifest.walkingCoverage.pairs}`:''}</p><ul>${manifest.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul><p>${manifest.attribution.map(escape).join('<br>')}</p><p>Bakgrundskarta: OpenStreetMap. Ingen analys eller central sökhistorik. Saknade gångvägar fylls aldrig med raka linjer.</p>`);};
async function restoreLink() {
  invalidate('Delningsinställningar laddas.');
  $('#form-error').hidden=true;
  const s=parseHash(location.hash);if(!s)return;
  applySettings(s);
  const index=stops.findIndex(stop=>stop.id===s.stop);
  if(index<0){invalidate();selected=-1;$('#calculate').setAttribute('disabled','');$('#share').setAttribute('disabled','');startLayer.clearLayers();$<HTMLInputElement>('#stop-search').value=s.name;throw new Error(`Hållplatsen ”${s.name}” (${s.stop}) finns inte längre. Sök och välj en ersättare; startpunkten har inte flyttats.`);}
  setStart(index);map.setView([stops[index].lat,stops[index].lon],13);
  validateSettings(s,manifest.walkingMaxMinutes);validateDate(s.date,manifest.validFrom,manifest.validTo);
  await calculate();
}
async function init(){
  try{
    manifest=await loadManifest();stops=await loadJSON<Stop[]>(manifest.stops);
    if(!stops.length)throw new Error('Hållplatsdata är tom.');
    settings=defaults(stops[0]);applySettings(settings);
    const [min,max]=dateBounds(manifest.validFrom,manifest.validTo);$<HTMLInputElement>('#date').min=min;$<HTMLInputElement>('#date').max=max;
    $<HTMLSelectElement>('#walk').querySelectorAll('option').forEach(o=>{if(Number(o.value)>manifest.walkingMaxMinutes)o.remove();});
    const banner=$('#data-banner');
    banner.classList.toggle('demo',manifest.demo);$('#map-demo').hidden=!manifest.demo;
    banner.textContent=manifest.demo?'TESTLÄGE · Syntetiska avgångar och gångtider. Ej för reseplanering.':`Tidtabell uppdaterad ${manifest.sourceUpdated||manifest.updated.slice(0,10)} · Giltig t.o.m. ${manifest.validTo}`;
    if(!manifest.demo&&(manifest.sourceUpdated||manifest.updated.slice(0,10))<addDays(stockholmNow().date,-2))banner.textContent+=' · Äldre data: uppdateringen kan ha misslyckats.';
    if(manifest.warnings.length&&!manifest.demo)banner.textContent+=' · Databegränsningar finns, se Om datan.';
    if(!manifest.demo&&!manifest.walkingCoverage?.reviewed){banner.classList.add('demo');banner.textContent=`UTVECKLINGSLÄGE · Tidtabell ${manifest.sourceUpdated||manifest.updated.slice(0,10)}. Ofullständigt gångunderlag kan underskatta nåbarheten.`;$('#map-demo').hidden=false;$('#map-demo').textContent='UTVECKLING · Gångdata ofullständiga';}
    stops.forEach((s,i)=>{const m=L.circleMarker([s.lat,s.lon],{radius:5,color:'#52766e',fillColor:'#f5f6f0',fillOpacity:.9,weight:1.5}).addTo(map);m.bindTooltip(escape(s.name)+' · '+escape(s.platform));m.on('mouseover',()=>{if(matchMedia('(hover: hover)').matches)journeyView.hover(i);});m.on('mouseout',()=>journeyView.leave());m.on('click',()=>{if(result?.values[i]){map.closePopup();journeyView.pin(i);}else{journeyView.close();if(!result)setStart(i);popup(i);}});const el=m.getElement();if(el){el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',s.name+' · '+s.platform);el.addEventListener('focus',()=>journeyView.hover(i));el.addEventListener('blur',()=>journeyView.leave());el.addEventListener('keydown',e=>{if(['Enter',' '].includes((e as KeyboardEvent).key)){e.preventDefault();if(result?.values[i]){map.closePopup();journeyView.pin(i,true);}else{journeyView.close();if(!result)setStart(i);popup(i);}}});}markers.push(m);});
    $('#stop-search').removeAttribute('disabled');
    if(!await cacheAvailable()){const p=document.createElement('p');p.className='hint';p.textContent='Lokal lagring är inte tillgänglig. Data hämtas på nytt vid behov.';banner.after(p);}
    void pruneCache(manifest);
    await restoreLink();
  }catch(e){showError((e as Error).message);status(stops.length?'Kontrollera inställningarna.':'Data kunde inte laddas. Ladda om sidan för att försöka igen.');if(!stops.length)$('#data-banner').textContent='Kontrollera datatillgång och nätverk.';}
}
window.addEventListener('hashchange',()=>{void restoreLink().catch(e=>showError(e.message));});
void init();
