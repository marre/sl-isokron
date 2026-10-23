import {stockholmInstant} from './time';
import {journeyFromNode} from './journey';
import type {Settings,SearchResult,Stop,OriginAccess,PointJourney,DestinationSource,JourneyLeg} from './types';

export function choosePointJourney(result:SearchResult,settings:Settings,stops:Stop[],access:OriginAccess,cutoffMinutes=settings.maxMinutes):PointJourney|null{
  const walks=new Map(access.walks.map(w=>[w.to,w]));
  let best:{source:DestinationSource;walk:OriginAccess['walks'][number];seconds:number;arrival:number}|undefined;
  const sources=result.destinationSources??[];
  const direct:DestinationSource={stop:stops.length,seconds:0,walked:0,arrival:stockholmInstant(settings.date,settings.time),boardings:0,journey:null};
  for(const source of settings.origin==='point'?[...sources,direct]:sources){
    const walk=walks.get(source.stop);if(!walk||source.walked+walk.seconds>settings.walkMinutes*60)continue;
    const seconds=source.seconds+walk.seconds,arrival=source.arrival+walk.seconds;
    if(seconds>Math.min(cutoffMinutes,settings.maxMinutes)*60)continue;
    if(!best||seconds<best.seconds||(seconds===best.seconds&&(arrival<best.arrival||(arrival===best.arrival&&source.boardings<best.source.boardings))))best={source,walk,seconds,arrival};
  }
  if(!best)return null;
  const {source,walk,seconds,arrival}=best;
  const displayStops=[...stops];
  if(settings.origin==='point')displayStops.push({id:'@point',name:'Vald kartpunkt',station:'Vald kartpunkt',platform:'Start på kartlagd väg',lat:result.origin!.lat,lon:result.origin!.lon});
  const to=displayStops.length;displayStops.push({id:'@destination',name:'Vald målpunkt',station:'Vald målpunkt',platform:'Gångmål på kartlagd väg',lat:access.lat,lon:access.lon});
  const tail:JourneyLeg={kind:'walk',from:source.stop,to,departure:source.arrival,arrival,stops:[source.stop,to],metres:walk.metres,path:walk.path};
  return {destination:{lat:access.lat,lon:access.lon,snapMetres:access.snapMetres},source,value:{seconds,arrival,kind:source.boardings?'transit':'walk',boardings:source.boardings,journey:null,requestStop:source.requestStop},legs:journeyFromNode(result,source.journey,tail,displayStops)};
}
