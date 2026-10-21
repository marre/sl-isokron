"""Flag missing or implausibly long walking links for nearby stops, irrespective of names.
Air distance is diagnostic only; it never creates or shortens a walking edge.
"""
from collections import defaultdict
import math
from osm_walks import distance, normalize


def audit(stops, anchors, edges, references=()):
    bound={s['id'] for s in anchors}; pairs={(e['from'],e['to']):e for e in edges}
    bins=defaultdict(list); findings=[]; checked_pairs=0
    for s in stops:bins[(math.floor(s['lat']*400),math.floor(s['lon']*200))].append(s)
    for a in stops:
        cell=(math.floor(a['lat']*400),math.floor(a['lon']*200))
        for dx in range(-2,3):
            for dy in range(-2,3):
                for b in bins.get((cell[0]+dx,cell[1]+dy),[]):
                    if a['id']>=b['id']:continue
                    metres=distance((a['lat'],a['lon']),(b['lat'],b['lon']))
                    if metres>250:continue
                    checked_pairs+=1;missing=[];detours=[]
                    for source,target in [(a,b),(b,a)]:
                        e=pairs.get((source['id'],target['id']))
                        if not e:missing.append([source['id'],target['id']])
                        elif e.get('metres',0)>max(500,metres*10):detours.append({'from':source['id'],'to':target['id'],'metres':e['metres'],'seconds':e['seconds']})
                    if missing or detours:
                        unbound=[s['id'] for s in (a,b) if s['id'] not in bound]
                        findings.append({'name':a['name'],'names':[a['name'],b['name']],'sameName':normalize(a['name'])==normalize(b['name']),
                            'stops':[a['id'],b['id']],'straightLineMetres':round(metres),'reason':'unbound-endpoint' if unbound else 'network-gap-or-detour',
                            'unboundStops':unbound,'missingDirections':missing,'longNetworkDetours':detours})
    available={s['id'] for s in stops};failures=[];skipped=[];checked=0
    for case in references:
        a,b=case['stops']
        if not {a,b}<=available:skipped.append(case);continue
        checked+=2
        for source,target in [(a,b),(b,a)]:
            e=pairs.get((source,target))
            if not e or e['seconds']>case['maxSeconds']:
                failures.append({'name':case['name'],'from':source,'to':target,'seconds':e['seconds'] if e else None,'maxSeconds':case['maxSeconds']})
    return {'surfaceStops':len(stops),'boundStops':len(bound),'nearbyStopPairFindings':len(findings),'checkedNearbyPairs':checked_pairs,
        'differentNameFindings':sum(not f['sameName'] for f in findings),
        'note':'Diagnostics require review. Nearby coordinates do not prove a legal passage. No connections are invented.',
        'findings':findings,'referenceFailures':failures,'checkedReferenceDirections':checked,'skippedReferences':skipped}
