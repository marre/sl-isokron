"""Generate explicitly SYNTHETIC data. No claim of SL or walking-path accuracy."""
from datetime import datetime, timedelta, timezone
from build_data import TZ, gtfs_epoch, publish
import argparse
import json

PLACES = [
 ('Slussen',59.3194,18.0725), ('Gamla stan',59.3230,18.0674), ('T-Centralen',59.3310,18.0592),
 ('Östermalmstorg',59.3347,18.0740), ('Tekniska högskolan',59.3457,18.0719), ('Universitetet',59.3656,18.0547),
 ('Danderyds sjukhus',59.3912,18.0415), ('Mörby centrum',59.3985,18.0368), ('Odenplan',59.3428,18.0495),
 ('Stockholm City',59.3314,18.0579), ('Solna station',59.3665,18.0100), ('Helenelund',59.4090,17.9620),
 ('Södertälje centrum',59.1928,17.6256), ('Liljeholmen',59.3107,18.0220), ('Alvik',59.3335,17.9803),
 ('Nacka strand',59.3165,18.1628), ('Nybroplan',59.3330,18.0780), ('Lidingö',59.3550,18.1540),
 ('Vaxholm',59.4028,18.3526), ('Södermalmstorg',59.3199,18.0705), ('Mörby station',59.3887,18.0507),
 ('Kårsta',59.6567,18.2675), ('Nynäshamn',58.9030,17.9560), ('Bålsta',59.5697,17.5318),
]

def generate(output):
    today = datetime.now(TZ).date()
    stops = [dict(id='demo-' + str(i), name=n, station=n, platform='Testläge A', lat=lat, lon=lon) for i,(n,lat,lon) in enumerate(PLACES)]
    stops.append(dict(id='demo-24',name='Slussen',station='Slussen',platform='Testläge B',lat=59.3188,lon=18.0730))
    routes = [dict(id='red',name='14',mode='metro'),dict(id='green',name='19',mode='metro'),dict(id='commuter',name='40',mode='rail'),dict(id='local',name='27',mode='tram'),dict(id='boat',name='80',mode='boat'),dict(id='bus',name='474',mode='bus')]
    paths = [(0,[0,1,2,3,4,5,6,7],[3,3,3,4,4,6,3]), (1,[13,0,1,2,8,14],[6,3,3,4,10]), (2,[12,9,8,10,11,23],[34,4,6,7,18]),(3,[4,20,21],[15,25]),(4,[16,15,17,18],[14,12,20]),(5,[24,15],[16]),(2,[22,12],[37])]
    walks = []
    for a,b,sec in [(0,24,180),(0,19,120),(2,9,240),(3,16,300),(6,20,600)]:
        for x,y in [(a,b),(b,a)]: walks.append({'from':x,'to':y,'seconds':sec,'metres':round(sec*4.8/3.6),'source':'Syntetisk testkant – ej verifierad gångväg'})
    days, trips = {}, []
    for offset in range(-1,10):
        day = today + timedelta(days=offset)
        for route,path,durations in paths:
            for reverse in [False,True]:
                nodes = list(reversed(path)) if reverse else path
                mins = list(reversed(durations)) if reverse else durations
                for minute in range(0,26*60,15 if route != 4 else 30):
                    trip = len(trips); trips.append(f'{day}:{route}:{reverse}:{minute}')
                    t = gtfs_epoch(day, minute*60)
                    for seq,(a,b,duration) in enumerate(zip(nodes,nodes[1:],mins)):
                        arr = t + duration*60
                        bucket = datetime.fromtimestamp(t,timezone.utc).date().isoformat()
                        days.setdefault(bucket,[]).append((a,b,t,arr,trip,route,seq,3 if route==5 else 1,3 if route==5 else 1))
                        t = arr + 30
    meta = dict(demo=True,updated=datetime.now(timezone.utc).isoformat(),validFrom=today.isoformat(),validTo=(today+timedelta(days=7)).isoformat(),walkingMaxMinutes=30,walkingSpeedKmh=4.8,walkingVersion='synthetic-1',warnings=['Endast syntetiska avgångar och gångtider. Använd inte för reseplanering. Verklig SL-täckning och gångvägar har inte verifierats.'],attribution=['Syntetisk testdata · ortnamn för orientering'])
    # Explicitly synthetic polygons exercise the area renderer, not real walkability.
    profiles={}
    for index in (0,2,9):
        stop=stops[index];stop['walkingArea']=True;profiles[stop['id']]=[]
        for minute in range(1,31):
            lat,lon=stop['lat'],stop['lon'];d=minute*.0004
            profiles[stop['id']].append({'minutes':minute,'geometry':{'type':'Polygon','coordinates':[[[lon-d,lat-d],[lon+d,lat-d],[lon+d,lat+d],[lon-d,lat+d],[lon-d,lat-d]]]}})
    areas={'files':{'areas-demo.json':json.dumps(profiles,separators=(',',':')).encode()},'index':{sid:0 for sid in profiles}}
    publish(output,stops,routes,walks,[],trips,days,meta,{'stops':len(stops),'walkingEdges':len(walks),'synthetic':True},areas)
    # Explicitly synthetic physical geometry for map-origin browser tests.
    import tempfile
    from footpath_tiles import write_tiles
    from attach_footpaths import attach
    with tempfile.TemporaryDirectory(prefix='sliso-demo-footpaths-') as temp:
        nodes={0:(59.331,18.057),1:(59.331,18.0592),2:(59.332,18.0592),3:(59.319,18.0725),4:(59.3194,18.0725)}
        write_tiles(nodes,[(0,1,125,94,False),(1,2,111,84,False),(3,4,44.5,33.4,False)],{1:[['demo-2',0,0,stops[2]['lat'],stops[2]['lon']]],4:[['demo-0',0,0,stops[0]['lat'],stops[0]['lon']]]},temp,'synthetic-fixture')
        attach(output,temp)


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',default='public/data');generate(p.parse_args().output)
