"""Flag missing or implausibly long walking links for nearby same-name stops.
Air distance is diagnostic only; it never creates or shortens a walking edge.
"""
from collections import defaultdict
from osm_walks import distance, normalize


def audit(stops, anchors, edges, references=()):
    bound={s['id'] for s in anchors}; pairs={(e['from'],e['to']):e for e in edges}
    names=defaultdict(list); findings=[]
    for s in stops:names[normalize(s['name'])].append(s)
    for siblings in names.values():
        for i,a in enumerate(siblings):
            for b in siblings[i+1:]:
                metres=distance((a['lat'],a['lon']),(b['lat'],b['lon']))
                if metres>250:continue
                missing=[];detours=[]
                for source,target in [(a,b),(b,a)]:
                    e=pairs.get((source['id'],target['id']))
                    if not e:missing.append([source['id'],target['id']])
                    elif e.get('metres',0)>max(500,metres*10):detours.append({'from':source['id'],'to':target['id'],'metres':e['metres'],'seconds':e['seconds']})
                if missing or detours:findings.append({'name':a['name'],'stops':[a['id'],b['id']],'straightLineMetres':round(metres),
                    'unboundStops':[s['id'] for s in (a,b) if s['id'] not in bound], 'missingDirections':missing,'longNetworkDetours':detours})
    available={s['id'] for s in stops};failures=[];skipped=[];checked=0
    for case in references:
        a,b=case['stops']
        if not {a,b}<=available:skipped.append(case);continue
        checked+=2
        for source,target in [(a,b),(b,a)]:
            e=pairs.get((source,target))
            if not e or e['seconds']>case['maxSeconds']:
                failures.append({'name':case['name'],'from':source,'to':target,'seconds':e['seconds'] if e else None,'maxSeconds':case['maxSeconds']})
    return {'surfaceStops':len(stops),'boundStops':len(bound),'nearbyStopPairFindings':len(findings),
        'note':'Diagnostics require review. Nearby coordinates do not prove a legal passage. No connections are invented.',
        'findings':findings,'referenceFailures':failures,'checkedReferenceDirections':checked,'skippedReferences':skipped}
