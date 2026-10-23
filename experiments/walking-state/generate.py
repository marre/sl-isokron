"""Generate isolated, reviewable variants from the production router. Never edits src/."""
from pathlib import Path

out = Path('.data-build/walking-state')
out.mkdir(parents=True, exist_ok=True)
source = Path('src/core/router.ts').read_text()
source = source.replace("from './", "from '../../src/core/")
(out/'baseline.ts').write_text(source)

cached = source.replace('  stop: number;', '  _key?: string; _settled?: boolean; _active?: boolean;\n  stop: number;', 1)
cached = cached.replace('  function contextKey(l: Label): string {', '  const tripContexts = new Map<string,string>();\n  function contextKey(l: Label): string {')
cached = cached.replace("    const trip = (tripSpecific.has(l.lastTrip) || tripSpecific.has(baseTrip(l.lastTrip))) ? l.lastTrip : '*';", "    let trip = tripContexts.get(l.lastTrip);\n    if(trip === undefined){trip = (tripSpecific.has(l.lastTrip) || tripSpecific.has(baseTrip(l.lastTrip))) ? l.lastTrip : '*';tripContexts.set(l.lastTrip,trip);}")
cached = cached.replace("${settled(l) ? '*' : l.alightStop}", "${l._settled ? '*' : l.alightStop}")
cached = cached.replace('    const key = contextKey(l);', '    l._settled=settled(l); l._key=contextKey(l); l._active=true;\n    const key = l._key;')
cached = cached.replace('settled(a) && settled(b)', 'a._settled && b._settled')
cached = cached.replace('!frontiers.get(contextKey(l))?.includes(l)', '!l._active')
cached = cached.replace('...list.filter(a => !dominates(l, a))', '...list.filter(a => {if(dominates(l,a)){a._active=false;return false}return true})')
(out/'cached.ts').write_text(cached)

compact = cached.replace("    frontiers.set(key, [...list.filter(a => {if(dominates(l,a)){a._active=false;return false}return true}), l]); queues[l.boardings].push(l);labels++;", "    let kept=0;for(const a of list){if(dominates(l,a))a._active=false;else list[kept++]=a;}list.length=kept;list.push(l);\n    frontiers.set(key,list); queues[l.boardings].push(l);labels++;")
assert compact != cached
(out/'compact.ts').write_text(compact)

# A scratch candidate can be overwritten until a witness or frontier retains it.
# Predecessors and accepted labels are still immutable independent objects.
lazy = compact.replace('  function push(l: Label): void {', '  function push(l: Label, transient=false): void {')
lazy = lazy.replace('      witnesses[l.stop] = l;', '      if(transient){l={...l};transient=false;}\n      witnesses[l.stop] = l;')
lazy = lazy.replace('    let kept=0;', '    if(transient)l={...l};\n    let kept=0;')
walk = '      for(const w of walking[l.stop])push({...l,stop:w.to,time:l.time+w.seconds,walk:l.walk+w.seconds,previous:l,via:w,alight:null});'
replacement = '''      for(const w of walking[l.stop]){
        const time=l.time+w.seconds,walk=l.walk+w.seconds;
        if(time-(l.anchor??t0)>max||walk>maxWalk||time>latest)continue;
        scratch.stop=w.to;scratch.time=time;scratch.anchor=l.anchor;scratch.walk=walk;scratch.boardings=l.boardings;
        scratch.requestStop=l.requestStop;scratch.lastTrip=l.lastTrip;scratch.lastRoute=l.lastRoute;
        scratch.alightStop=l.alightStop;scratch.alightTime=l.alightTime;scratch.previous=l;scratch.via=w;scratch.alight=null;
        push(scratch,true);
      }'''
assert walk in lazy
lazy = lazy.replace(walk,replacement)
lazy = lazy.replace('  for(let round=0;', '  const scratch={} as Label;\n  for(let round=0;',1)
(out/'lazy.ts').write_text(lazy)

# Intern a transfer-context prefix once per alighting event. Walking inherits it;
# multiplying by stop count makes a collision-free numeric (context,stop) key.
numeric = cached.replace('_key?: string;', '_context?: {ready:number;pending:number;threshold:number;blocked:boolean}; _key?: number;')
numeric = numeric.replace('  const tripContexts = new Map<string,string>();', '''  const groupIds=new Map<string,number>();
  function group(key:string){let id=groupIds.get(key);if(id===undefined){id=groupIds.size;groupIds.set(key,id);}return id;}
  function prepareContext(l:Label){
    if(l._context)return;
    const trip=(tripSpecific.has(l.lastTrip)||tripSpecific.has(baseTrip(l.lastTrip)))?l.lastTrip:'*';
    const prefix=`${l.boardings}|${trip}|${routeSpecific?l.lastRoute:'*'}|`;
    l._context={ready:group(prefix+'*'),pending:group(prefix+l.alightStop),threshold:l.alightTime+transferDelay[l.alightStop],blocked:transferBlocked.has(l.alightStop)};
  }''')
start=numeric.index('  function contextKey(')
end=numeric.index('  const values:',start)
numeric=numeric[:start]+'''  function contextKey(l:Label):number {return (l._settled?l._context!.ready:l._context!.pending)*network.stops.length+l.stop;}
'''+numeric[end:]
numeric=numeric.replace('new Map<string, Label[]>()','new Map<number, Label[]>()')
numeric=numeric.replace('    l._settled=settled(l);', '    prepareContext(l);l._settled=!l._context!.blocked&&l.time>=l._context!.threshold;')
(out/'numeric.ts').write_text(numeric)

# A dominating retained label has already supplied an equal/better display value
# AND walking frontier. Reject a walking candidate by its scalars before allocating.
guarded=numeric.replace(walk,'''      for(const w of walking[l.stop]){
        const time=l.time+w.seconds,walk=l.walk+w.seconds;
        if(time-(l.anchor??t0)>max||walk>maxWalk||time>latest)continue;
        const done=!l._context!.blocked&&time>=l._context!.threshold;
        const key=(done?l._context!.ready:l._context!.pending)*network.stops.length+w.to;
        if(options.prune!==false&&frontiers.get(key)?.some(a=>a.time<=time&&(a._settled&&done||a.alightTime<=l.alightTime)&&a.walk<=walk&&(a.anchor??t0)>=(l.anchor??t0)))continue;
        push({...l,stop:w.to,time,walk,previous:l,via:w,alight:null});
      }''')
assert guarded!=numeric
(out/'guarded.ts').write_text(guarded)

# Untimed diagnostic pass: these counters intentionally do not contaminate trials.
counted=source.replace('export function search(', 'export let diagnostics:Record<string,number>={};\nexport function search(',1)
counted=counted.replace('  const indexing=profileStart();', '  diagnostics={attempts:0,walkingAttempts:0,budgetRejected:0,dominated:0,dominanceTests:0,maxFrontier:0};\n  const indexing=profileStart();',1)
counted=counted.replace('    if (cost(l) > max || l.walk > maxWalk || l.time > latest) return;', '    diagnostics.attempts++;\n    if (cost(l) > max || l.walk > maxWalk || l.time > latest){diagnostics.budgetRejected++;return;}')
counted=counted.replace('const dominates = (a: Label, b: Label) => a.time', 'const dominates = (a: Label, b: Label) => (++diagnostics.dominanceTests, a.time')
counted=counted.replace('(b.anchor ?? t0);', '(b.anchor ?? t0));')
counted=counted.replace('list.some(a => dominates(a, l))) return;', 'list.some(a => dominates(a, l))){diagnostics.dominated++;return;}')
counted=counted.replace('queues[l.boardings].push(l);labels++;', 'queues[l.boardings].push(l);labels++;diagnostics.maxFrontier=Math.max(diagnostics.maxFrontier,frontiers.get(key)!.length);')
counted=counted.replace('      for(const w of walking[l.stop])push(', '      diagnostics.walkingAttempts+=walking[l.stop].length;\n      for(const w of walking[l.stop])push(')
counted=counted.replace("  return { values, journeys,", "  diagnostics.frontierKeys=frontiers.size;diagnostics.retainedFrontierLabels=[...frontiers.values()].reduce((sum,list)=>sum+list.length,0);\n  return { values, journeys,")
(out/'counted.ts').write_text(counted)
print('Generated baseline, cached, compact, lazy, numeric, guarded prototypes in',out)
