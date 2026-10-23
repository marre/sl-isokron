import type {Mode,Route} from './types';

export const MODE_COLORS:Record<Mode|'walk',string>={bus:'#d71d24',metro:'#008b43',rail:'#c74185',tram:'#b66b18',boat:'#087a98',walk:'#55645f'};
const BLUE='#007db8',RED='#d71d24',GREEN='#008b43';
// Current pinned SL release predates preservation of route_desc. Verified against
// that feed's explicit blåbuss classification, including express variants.
const LEGACY_BLUE_BUSES=new Set('1 2 3 4 5 6 172 173 175 176 176E 176X 177 177E 178 179 471 474 670 670X 676 676X 677 873 875'.split(' '));
const hex=(value?:string)=>value&&/^#?[0-9a-f]{6}$/i.test(value)?'#'+value.replace('#','').toLowerCase():undefined;
export function routeColor(route:Route):string{
 const explicit=hex(route.color);if(explicit)return explicit;
 const description=route.description?.toLocaleLowerCase('sv')??'',line=route.shortName??route.name.split(' · ')[0];
 const sl=route.agencyId?route.agencyId==='14010000000001001':/^9011001\d{9}$/.test(route.id);
 if(route.mode==='bus'){
  if(description.includes('blåbuss'))return BLUE;
  if(sl)return route.description===undefined&&LEGACY_BLUE_BUSES.has(line)?BLUE:RED;
  return '#526e79';
 }
 if(route.mode==='metro'){
  if(description.includes('gröna'))return GREEN;
  if(description.includes('röda'))return RED;
  if(description.includes('blå'))return BLUE;
  if(sl){if(['17','18','19'].includes(line))return GREEN;if(['13','14'].includes(line))return RED;if(['10','11'].includes(line))return BLUE;}
 }
 if(route.mode==='tram'){
  if(description==='roslagsbanan'||(sl&&['27','28','29','27S','28S'].includes(line)))return '#8d549f';
  if(description==='saltsjöbanan'||(sl&&['25','26'].includes(line)))return '#008c95';
  if(description==='spårväg city'||(sl&&line==='7'))return '#676b70';
 }
 return MODE_COLORS[route.mode];
}

export function routeTextColor(route:Route):string{
 const explicit=hex(route.textColor);if(explicit)return explicit;
 const color=routeColor(route),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
 return luminance>.179?'#132c26':'#ffffff';
}

const paths:Record<Mode|'walk',string>={
 bus:'<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M9 6h6"/><circle cx="8" cy="15.5" r=".6"/><circle cx="16" cy="15.5" r=".6"/>',
 metro:'<circle cx="12" cy="12" r="9"/><path d="M7 16V8l5 5 5-5v8"/>',
 rail:'<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M12 3v7M8 18l-2 3m10-3 2 3M8 15h.1m7.9 0h.1"/>',
 tram:'<rect x="5" y="6" width="14" height="13" rx="3"/><path d="m10 6 4-4H9M5 12h14M8 19l-2 3m10-3 2 3M8 16h.1m7.9 0h.1"/>',
 boat:'<path d="M4 12h16l-3 6H7l-3-6Zm3 0V7h10v5M10 7V3h4v4M3 21q3-3 6 0 3-3 6 0 3-3 6 0"/>',
 walk:'<circle cx="13" cy="4" r="2"/><path d="m9 21 3-7m5 7-3-8 1-5m-8 5 3-5h5l3 5h3M9 9l3 5"/>'
};
export function transportIcon(mode:Mode|'walk'):string{
 return `<svg class="transport-icon" data-transport="${mode}" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[mode]}</svg>`;
}
