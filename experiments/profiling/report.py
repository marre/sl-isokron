"""Summarize completed runs; asynchronous spans are never added into a CPU pie."""
import json, statistics, os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/sliso-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('.data-build/profiling')
full=json.loads((root/'results-full.json').read_text());ablation=json.loads((root/'results-ablation.json').read_text());routing=json.loads((root/'results-routing.json').read_text())
by={c['name']:c for c in full['cases']+ablation['cases']}
def phase(name,phase='cold'):
 return next(p for p in by[name]['phases'] if p['phase']==phase)
def med(names,key,stage='cold'):
 return statistics.median(phase(n,stage)[key] for n in names)
base=['city-direct-2','city-direct-3'];latency=['city-40ms','city-40ms-2']
# These cases have the same viewport, budgets and final pixel masks.
hashes={phase(n)['pixelHash'] for n in by if n.startswith('city-')}
assert len(hashes)==1
for state in ('cold','disk-warm','decoded-cutoff'):
 assert len({phase(n,state)['pixelHash'] for n in by if n.startswith('city-')})==1
summary=dict(dataset=full['dataset'],publishedDataset=json.loads(Path('data/release.json').read_text())['version'],measuredAt=full['measuredAt'],notes=full['notes']+[
 'Use stage-timer-only repeats 2 and 3 for city wall-time summaries. CPU sampling run 1 was slower (12.3 s); sampling changes scheduling and is diagnostic.',
 'The harness isolates WalkingView after preparing routing/markers; it is not the previous full-app 30-second city-transition smoke.',
 'Browser caches are empty for cold runs; host filesystem caches are not reset. Disk-warm resets the walking worker and reuses CacheStorage. Decoded-cutoff retains the same worker.',
 'No bandwidth throttling or physical-phone test was performed.',
 'Reduced-repaint variants intercept worker messages in the harness only. Final-only is a counterfactual with no progressive paint, not a proposed product experience.',
 'Raw events and CPU traces are saved locally under .data-build/profiling; stage intervals may overlap and nested durations must not be added.',
],summary=dict(cityColdMs=med(base,'wallMs'),cityDiskWarmMs=med(base,'wallMs','disk-warm'),cityCutoffMs=med(base,'wallMs','decoded-cutoff'),city40msLatencyColdMs=med(latency,'wallMs'),city200msPaintColdMs=phase('city-200ms')['wallMs'],city200msPaintWarmMs=phase('city-200ms','disk-warm')['wallMs'],cityFinalOnlyColdMs=phase('city-final-only')['wallMs'],cityFinalOnlyWarmMs=phase('city-final-only','disk-warm')['wallMs'],cityFinalPixelsEqual=True),contours=full['cases']+ablation['cases'],routing=routing['cases'])
summary['notes'].append('Full-app diagnostics varied from 7.9 to 53.2 seconds. The cause of the variance is unresolved; do not attribute the historical 30-second result solely to automation or infer a production speedup from isolated-component timings.')
summary['fullApp']={name:json.loads((root/file).read_text()) for name,file in [('standard','results-app.json'),('domClick','results-app-domclick.json'),('touchInputDiagnostic','results-app-input.json')] if (root/file).exists()}
Path('docs/profiling-results.json').write_text(json.dumps(summary,indent=2)+'\n')
fig,axes=plt.subplots(2,2,figsize=(13,9));fig.set_facecolor('#f5f7f3')
for ax in axes.flat:
 ax.set_facecolor('#f5f7f3');ax.spines[['top','right']].set_visible(False);ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True)
labels=['Current','40 ms response latency','Progress every 200 ms','Final paint only*']
cold=[med(base,'wallMs'),med(latency,'wallMs'),phase('city-200ms')['wallMs'],phase('city-final-only')['wallMs']]
warm=[med(base,'wallMs','disk-warm'),med(latency,'wallMs','disk-warm'),phase('city-200ms','disk-warm')['wallMs'],phase('city-final-only','disk-warm')['wallMs']]
ax=axes[0,0];ys=list(range(4));ax.barh([y-.17 for y in ys],[v/1000 for v in cold],height=.32,color='#397c63',label='Cold browser caches');ax.barh([y+.17 for y in ys],[v/1000 for v in warm],height=.32,color='#a8bd9b',label='CacheStorage warm')
for i,v in enumerate(cold):ax.text(v/1000+.12,i-.17,f'{v/1000:.1f}s',va='center',fontsize=9)
ax.set_yticks(ys,labels);ax.invert_yaxis();ax.set_xlim(0,14);ax.set_xlabel('Seconds to complete city overlay');ax.set_title('Many small files + repeated progress paint');ax.legend(loc='lower right',fontsize=8)
ax=axes[0,1]
stages=[('Repaint all pixels + extent','paint'),('Convert contours to scanlines','scan'),('Fill newly covered pixels','fill'),('Resolve contour references','resolve'),('Decode binary contours','decode')]
values=[]
for label,key in stages:
 vv=[]
 for n in base:
  s=phase(n)['stages'];vv.append(s['render.paint']['sumMs']+s['render.extent']['sumMs'] if key=='paint' else s['raster.add']['scanMs'] if key=='scan' else s['raster.add']['fillMs'] if key=='fill' else s['render.resolve']['sumMs'] if key=='resolve' else s['contour.decode']['sumMs'])
 values.append(statistics.median(vv)/1000)
ax.barh([s[0] for s in stages],values,color=['#b97451','#397c63','#78a08a','#8d9da9','#b2b9b7']);ax.invert_yaxis();ax.set_xlabel('Synchronous worker seconds, city cold');ax.set_title('Geometry conversion is a smaller CPU cost')
for i,v in enumerate(values):ax.text(v+.02,i,f'{v:.2f}s',va='center',fontsize=9)
ax.set_xlim(0,max(values)*1.25)
ax=axes[1,0];names=['street-direct','city-direct-2','region-direct'];xs=list(range(3));ax.bar(xs,[phase(n)['requests'] for n in names],color='#6c8ca0');ax.set_xticks(xs,['Street · z15','City · z13','Region · z11']);ax.set_ylabel('Individual contour file requests');ax.set_title('Zooming out increases file handling')
for x,n in enumerate(names):p=phase(n);ax.text(x,p['requests']+45,f"{p['requests']:,}\n{p['bytes']/1e6:.1f} MB",ha='center',fontsize=9)
ax.set_ylim(0,2800)
ax=axes[1,1]
for i,c in enumerate(routing['cases']):
 s=c['stages'];parts=[('Walking closure + label bookkeeping',s['routing.walkClosure']['sumMs'],'#b97451'),('Vehicle route scans',s['routing.routeScan']['sumMs'],'#397c63'),('Index + patterns + journeys',s['routing.index']['sumMs']+s['routing.patterns']['sumMs']+s['routing.journeys']['sumMs'],'#9aada6')];offset=0
 for label,value,color in parts:ax.barh(i,value/1000,left=offset,color=color,label=label if i==0 else None);offset+=value/1000
 ax.text(offset+.15,i,f'{c["elapsed"]/1000:.1f}s',va='center')
ax.set_yticks(range(len(routing['cases'])),['Arlanda','Vallentuna']);ax.invert_yaxis();ax.set_xlim(0,14);ax.set_xlabel('Route-search seconds, excludes network loading');ax.set_title('Routing bottleneck: walking-state propagation');ax.legend(loc='upper right',fontsize=8)
fig.suptitle('sliso: where the time goes',fontsize=20,fontweight='bold',x=.02,ha='left')
fig.text(.02,.015,'Local HTTP + desktop Chromium / mobile viewport. Small samples; CPU sampling affects timing. *Final-only removes progressive feedback.\nAsync fetch/cache/decompression spans overlap: they are not CPU totals. Source: docs/profiling-results.json',fontsize=9,color='#455449')
fig.tight_layout(rect=[0,.07,1,.94]);Path('docs/images').mkdir(exist_ok=True)
fig.savefig('docs/images/pipeline-profile.svg');fig.savefig('docs/images/pipeline-profile.png',dpi=150)
print(json.dumps(summary['summary'],indent=2))
