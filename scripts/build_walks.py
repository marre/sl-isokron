"""Bounded shortest paths over an audited pedestrian graph (not straight-line distances).
Graph inputs are prepared offline from OSM/local station surveys; see docs/data.md.
No implicit snapping: a stop must bind to an explicitly verified walk node.
"""
import argparse
import hashlib
import heapq
import json
import math
from pathlib import Path


def build(graph, max_minutes=30):
    if not 5 <= max_minutes <= 30 or not graph.get('version') or not graph.get('attribution'):
        raise ValueError('Graph needs version, attribution and maximum duration 5–30')
    nodes = set(graph['nodes'])
    adjacency = {n: [] for n in nodes}
    omitted = 0
    for e in graph['edges']:
        # Known gates/opening hours are excluded; absence of a restriction is not a guarantee.
        if e.get('restricted') or (e.get('openingHours') and e['openingHours'] != '24/7') or e.get('foot') in ('no','private','customers'):
            omitted += 1
            continue
        if e['from'] not in nodes or e['to'] not in nodes or not e.get('source'):
            raise ValueError('Edge lacks nodes or provenance')
        metres = e['metres']
        if not isinstance(metres, (int, float)) or not math.isfinite(metres) or metres <= 0:
            raise ValueError('Edge needs positive physical length')
        seconds = metres / (4.8 / 3.6) + e.get('extraSeconds', 0)
        if seconds <= 0 or not math.isfinite(seconds) or e.get('extraSeconds',0) < 0:
            raise ValueError('Invalid physical walking cost')
        adjacency[e['from']].append((e['to'], seconds))
        if not e.get('oneWay', False):
            adjacency[e['to']].append((e['from'], seconds))
    bindings = graph['stops']
    if len({s['id'] for s in bindings}) != len(bindings):
        raise ValueError('Duplicate stop binding')
    by_node = {}
    for s in bindings:
        if s['node'] not in nodes or s.get('verified') is not True or not s.get('source'):
            raise ValueError('Every stop-to-graph binding must be explicitly verified')
        by_node.setdefault(s['node'], []).append(s['id'])
    edges = []
    for s in bindings:
        distances = {s['node']: 0.0}
        queue = [(0.0, s['node'])]
        while queue:
            seconds, node = heapq.heappop(queue)
            if seconds > distances[node]:
                continue
            for target in by_node.get(node, []):
                if target != s['id']:
                    # Conservative rounding and a non-zero cost even for co-located bindings.
                    edges.append({'from':s['id'],'to':target,'seconds':max(1,math.ceil(seconds)), 'source':graph['version'] + ' / ' + s['source']})
            for target, cost in adjacency[node]:
                new = seconds + cost
                if new <= max_minutes * 60 and new < distances.get(target, float('inf')):
                    distances[target] = new
                    heapq.heappush(queue, (new, target))
    canonical = json.dumps(graph,sort_keys=True,separators=(',',':')).encode()
    return {'version': graph['version'] + '-' + hashlib.sha256(canonical).hexdigest()[:16], 'speedKmh':4.8, 'maxMinutes':max_minutes, 'stops':[{k:s[k] for k in ('id','lat','lon')} for s in bindings], 'edges':edges, 'attribution':graph['attribution'], 'warnings':[f'{omitted} kända tids-/tillträdesbegränsade kanter uteslutna. Okända öppettider och ej inventerade hållplatser är databegränsningar.']}

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--graph', required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--max-minutes',type=int,default=30)
    a=p.parse_args()
    result=build(json.loads(Path(a.graph).read_text()),a.max_minutes)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    print(f"Built {len(result['edges'])} directed walking pairs; no network APIs used")
