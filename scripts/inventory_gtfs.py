"""Inspect a real SL GTFS feed before walking bindings exist. Does not publish app data."""
import argparse
import csv
import io
import json
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from build_data import MODE_TYPES, active_services, gtfs_seconds, rows


def inventory(feed, output):
    output = Path(output)
    with zipfile.ZipFile(feed) as z:
        stops = rows(z, 'stops.txt', True)
        routes = rows(z, 'routes.txt', True)
        trips = rows(z, 'trips.txt', True)
        transfers = rows(z, 'transfers.txt')
        calendar = rows(z, 'calendar.txt')
        exceptions = rows(z, 'calendar_dates.txt')
        agencies = rows(z, 'agency.txt', True)
        pathways = rows(z, 'pathways.txt')
        feed_info = rows(z, 'feed_info.txt')
        services = active_services(calendar, exceptions)
        used_services = {t['service_id'] for t in trips}
        days = {d.isoformat(): len(s & used_services) for d, s in services.items() if s & used_services}
        if not days:
            raise ValueError('Feed has no actual traffic dates for its trips')
        count, over_24, missing_times, maximum = 0, 0, 0, 0
        # stop_times can be large; inspect it in a streaming pass, never list all rows.
        with io.TextIOWrapper(z.open('stop_times.txt'), encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                count += 1
                if not row.get('departure_time') or not row.get('arrival_time'):
                    missing_times += 1
                    continue
                seconds = gtfs_seconds(row['departure_time'])
                over_24 += seconds >= 86400
                maximum = max(maximum, seconds)
        by_route = Counter(t['route_id'] for t in trips)
        route_inventory = [dict(id=r['route_id'], shortName=r.get('route_short_name',''), longName=r.get('route_long_name',''), agency=r.get('agency_id',''), gtfsType=r['route_type'], suggestedMode=MODE_TYPES.get(int(r['route_type']),'UNMAPPED'), trips=by_route[r['route_id']]) for r in routes]
        boarding = [s for s in stops if s.get('location_type','0') in ('','0')]
        stop_inventory = [dict(id=s['stop_id'], name=s['stop_name'], lat=float(s['stop_lat']), lon=float(s['stop_lon']), parent=s.get('parent_station',''), platform=s.get('platform_code','')) for s in boarding]
        report = {
            'schema': 1, 'inspectedAt': datetime.now(timezone.utc).isoformat(),
            'source': 'Provided GTFS archive; verify SL identity and licenses before distribution',
            'agencies': agencies, 'feedInfo': feed_info,
            'counts': {'stops':len(stops),'boardingStops':len(boarding),'routes':len(routes),'trips':len(trips),'stopTimes':count,'transferRows':len(transfers),'pathways':len(pathways)},
            'rawRouteTypes': dict(Counter(r['route_type'] for r in routes)),
            'agencyInventory': [dict(id=a['agency_id'], name=a['agency_name'], routes=sum(r.get('agency_id', '') == a['agency_id'] for r in routes), trips=sum(by_route[r['route_id']] for r in routes if r.get('agency_id', '') == a['agency_id'])) for a in agencies],
            'unmappedRouteTypes': sorted({r['gtfsType'] for r in route_inventory if r['suggestedMode']=='UNMAPPED'}),
            'validFrom': min(days), 'validTo': max(days), 'activeServicesPerDate':dict(sorted(days.items())),
            'over24StopTimes':over_24,'maximumGtfsSeconds':maximum,'missingStopTimes':missing_times,
            'transferTypes':dict(Counter(r.get('transfer_type') or '0' for r in transfers)),
            'scopedTransferFields':{field:sum(bool(r.get(field)) for r in transfers) for field in ['from_trip_id','to_trip_id','from_route_id','to_route_id']},
            'minimumTransferRows':sum(bool(r.get('min_transfer_time')) for r in transfers),
            'transferSamples':transfers[:50],
            'walkingStatus':'NOT_VERIFIED: transfer minimums are not physical walking durations; no walking edges created',
            'coverageStatus':'NOT_REVIEWED: route inventory alone does not establish full SL coverage',
            'pathwayModeCounts':dict(Counter(p.get('pathway_mode','unknown') for p in pathways)),
            'frequenciesPresent':'frequencies.txt' in z.namelist(),
        }
    output.mkdir(parents=True,exist_ok=True)
    for name, data in [('report.json',report),('stops.json',stop_inventory),('routes.json',route_inventory)]:
        (output/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f"Inventory: {len(boarding)} boarding stops, {len(routes)} routes, {len(trips)} trips, {len(transfers)} transfer rules; no app data published.")
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--gtfs',required=True)
    p.add_argument('--output',default='.data-build/inventory')
    a=p.parse_args()
    inventory(a.gtfs,a.output)
