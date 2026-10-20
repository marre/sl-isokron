"""Bounded one-to-one OSM bus-stop assignment and physical junction validation."""
from collections import defaultdict
import heapq
from osm_walks import blocked_node, distance, normalize


def match_bus_stops(stops, features, margin=5):
    by_name=defaultdict(list)
    for feature in features:
        if feature['tags'].get('highway')=='bus_stop' and not blocked_node(feature['tags']):
            by_name[normalize(feature['tags'].get('name',''))].append(feature)
    candidates={}; reverse=defaultdict(set); nodes={f['id']:f for f in features}
    for stop in stops:
        if not stop.get('busOnly'):continue
        options=[]
        for f in by_name[normalize(stop['name'])]:
            if stop.get('platform') and stop['platform'] not in (f['tags'].get('local_ref'),f['tags'].get('ref')):continue
            metres=distance((stop['lat'],stop['lon']),(f['lat'],f['lon']))
            if metres<=25:
                options.append((f['id'],metres));reverse[f['id']].add(stop['id'])
        if options:candidates[stop['id']]=options
    matched={}; unseen=set(candidates)
    while unseen:
        component={unseen.pop()}; frontier=list(component); feature_ids=set()
        while frontier:
            for fid,_ in candidates[frontier.pop()]:
                feature_ids.add(fid)
                for sid in reverse[fid]-component:
                    component.add(sid);unseen.discard(sid);frontier.append(sid)
        # Crowded/complex groups require review instead of an unbounded search.
        if len(component)>8 or len(feature_ids)>8:continue
        ordered=sorted(component,key=lambda sid:(len(candidates[sid]),sid))
        solutions=[]; best_count=-1; best_cost=float('inf'); visits=0
        def visit(at,used,assignment,cost):
            nonlocal best_count,best_cost,solutions,visits
            visits+=1
            if visits>100_000:return
            if len(assignment)+len(ordered)-at<best_count:return
            if at==len(ordered):
                count=len(assignment)
                if count>best_count:best_count=count;best_cost=cost;solutions=[]
                if count<best_count:return
                if cost<best_cost:
                    best_cost=cost;solutions=[(c,a) for c,a in solutions if c<=cost+margin]
                if cost<=best_cost+margin:solutions.append((cost,dict(assignment)))
                return
            sid=ordered[at]
            for fid,metres in candidates[sid]:
                if fid in used:continue
                assignment[sid]=fid;visit(at+1,used|{fid},assignment,cost+metres);del assignment[sid]
            visit(at+1,used,assignment,cost)
        visit(0,set(),{},0)
        if visits>100_000 or not solutions:continue
        # Only assignments invariant across all near-optimal maximum matchings
        # are accepted. Equal-cost swapped sides remain explicitly unresolved.
        for sid in ordered:
            options={a.get(sid) for c,a in solutions if c<=best_cost+margin}
            if len(options)==1 and None not in options:matched[sid]=nodes[options.pop()]
    return matched


def way_id(edge):
    return edge.get('way_id',edge.get('edge_info',{}).get('way_id'))


def junction_edge(stop, result, tolerance=5, max_metres=15):
    """Accept nearby branches only with short paths through real graph node IDs.

    Uses Valhalla verbose correlation's directed edge endpoints. Equal coordinates
    never join graph nodes; disconnected sidewalks/bridge levels stay separate.
    """
    edges=[e for e in result.get('edges') or [] if distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon']))<=tolerance]
    if not edges:return None
    key=lambda e:(way_id(e),e.get('edge_info',{}).get('shape'))
    groups=defaultdict(list)
    for e in edges:groups[key(e)].append(e)
    graph=defaultdict(list); ends={}
    for group, entries in groups.items():
        if group[0] is None or not group[1] or len(entries)!=2:continue
        if not all(e.get('edge',{}).get('access',{}).get('pedestrian') for e in entries):continue
        if {e['edge'].get('forward') for e in entries}!={True,False}:continue
        if abs(sum(e['percent_along'] for e in entries)-1)>.001:continue
        ids=[e['edge']['end_node']['value'] for e in entries]
        if len(set(ids))!=2:continue
        length=max(e['edge']['geo_attributes']['length'] for e in entries)
        if length<=0:continue
        graph[ids[0]].append((ids[1],length));graph[ids[1]].append((ids[0],length))
        ends[group]=[(e['edge']['end_node']['value'],(1-e['percent_along'])*length) for e in entries]
    nearest=min(edges,key=lambda e:distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon'])))
    best_distance=distance((stop['lat'],stop['lon']),(nearest['correlated_lat'],nearest['correlated_lon']))
    # At a named OSM stop, a clearly closer walkway is a better positional
    # match than a separate adjacent street. Ties still need physical topology.
    plausible={key(e) for e in edges if
        distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon']))-best_distance<2
        or distance((stop['lat'],stop['lon']),(e['correlated_lat'],e['correlated_lon']))<best_distance*2}
    origin=key(nearest)
    if origin not in ends:return None
    costs=dict(ends[origin]);queue=[(c,n) for n,c in costs.items()];heapq.heapify(queue)
    while queue:
        cost,node=heapq.heappop(queue)
        if cost!=costs[node] or cost>max_metres:continue
        for target,metres in graph[node]:
            total=cost+metres
            if total<costs.get(target,float('inf')):costs[target]=total;heapq.heappush(queue,(total,target))
    for group in plausible:
        if group==origin:continue
        if group not in ends:return None
        if min(costs.get(n,float('inf'))+c for n,c in ends[group])>max_metres:return None
    return nearest
