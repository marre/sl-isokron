"""Isolate one-hop closure traversal from the production algorithm."""
from pathlib import Path
source=Path('experiments/walking-state/bookkeeping-reference.ts').read_text()
source="import {WalkingClosure} from '../../experiments/walking-state/table';\n"+source
source=source.replace('options: { prune?: boolean;', 'options: { walkingClosure?: WalkingClosure; prune?: boolean;')
source=source.replace('  const indexing=profileStart();', "  const closure=options.walkingClosure;if(!closure)throw new Error('Precomputed walking closure required');\n  const indexing=profileStart();",1)
source=source.replace("      const context = l.context!;", "      // A full walking leg is already expanded from every root/alighting seed.\n      if(l.via&&'seconds' in l.via)continue;\n      const context = l.context!;")
source=source.replace('      for(const w of walking[l.stop]){\n        const time=l.time+w.seconds,walk=l.walk+w.seconds;', '''      for(let entry=closure.begin(l.stop);entry<closure.end(l.stop);entry++){
        const to=closure.destination(entry),seconds=closure.seconds(entry);
        const time=l.time+seconds,walk=l.walk+seconds;''')
source=source.replace('network.stops.length+w.to;', 'network.stops.length+to;')
source=source.replace('        push({...l,stop:w.to,time,walk,previous:l,via:w,alight:null});', '''        const via:Walk={from:l.stop,to,seconds,source:'research closure'};
        push({...l,stop:to,time,walk,previous:l,via,alight:null});''')
original="        node = { previous, kind: 'walk', from: via.from, to: via.to, departure: l.previous!.time, arrival: l.time, stops: [via.from, via.to], metres: via.metres, estimated: via.source.startsWith('Assumed ') || undefined };"
replacement='''        let predecessor=previous,time=l.previous!.time;
        for(const edge of closure.path(via.from,via.to)){
          node={previous:predecessor,kind:'walk',from:edge.from,to:edge.to,departure:time,arrival:time+edge.seconds,stops:[edge.from,edge.to],metres:edge.metres,estimated:edge.source.startsWith('Assumed ')||undefined};
          time+=edge.seconds;predecessor=journeys.length;journeys.push(node);
        }
        if(time!==l.time)throw new Error('Closure witness does not match label time');
        ids.set(l,predecessor!);continue;'''
assert original in source
source=source.replace(original,replacement)
assert 'for(let entry=closure.begin' in source
Path('.data-build/walking-state/closure-router.ts').write_text(source)
