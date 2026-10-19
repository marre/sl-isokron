"""Explicit operator selection: unknown actors fail rather than silently changing coverage."""

def select_routes(routes, agencies, scope=None):
    known_agencies = {a['agency_id'] for a in agencies}
    def agency(r):
        if r.get('agency_id'):
            return r['agency_id']
        if len(known_agencies) == 1:
            return next(iter(known_agencies))
        raise ValueError('Route agency_id missing in a mixed-agency feed')
    used = {agency(r) for r in routes}
    if scope is None:
        if len(used) > 1:
            raise ValueError('Mixed-agency feed requires an explicit --scope policy before compilation')
        return routes, {'version':'single-agency', 'description':'Single-agency feed', 'includedAgencies':sorted(used), 'excludedRoutes':[]}
    if scope.get('includeAll') is True:
        if used - known_agencies or not scope.get('version') or not scope.get('description'):
            raise ValueError('Invalid all-feed policy or unknown route agencies')
        return routes, {'version':scope['version'], 'description':scope['description'], 'includedAgencies':sorted(used), 'excludedRoutes':[]}
    include, exclude = set(scope['includeAgencies']), set(scope['excludeAgencies'])
    if not include or include & exclude or not scope.get('version') or not scope.get('description'):
        raise ValueError('Invalid or overlapping agency policy')
    missing = include - known_agencies
    unknown = used - include - exclude
    if missing or unknown:
        raise ValueError(f'Agency policy needs review: missing included={sorted(missing)}, unclassified={sorted(unknown)}')
    selected = [r for r in routes if agency(r) in include]
    if not selected:
        raise ValueError('Agency policy selected no routes')
    return selected, {'version':scope['version'], 'description':scope['description'], 'includedAgencies':sorted(include), 'excludedRoutes':[{'id':r['route_id'],'agency':agency(r)} for r in routes if agency(r) not in include]}
