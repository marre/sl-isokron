"""Plot prototype routing measurements, not production performance guarantees."""
import json,os
os.environ.setdefault('MPLCONFIGDIR','/tmp/sliso-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
r=json.loads(Path('docs/algorithm-lab-results.json').read_text());cases=r['routing']['cases']
fig,axes=plt.subplots(1,2,figsize=(12,4.8));fig.set_facecolor('#f4f6f2')
colors=['#9cab9e','#2d7951','#688d9e'];labels=['Current','Route-pattern scan','Priority walking']
for ax in axes:ax.set_facecolor('#f4f6f2');ax.spines[['top','right','left']].set_visible(False);ax.grid(axis='y',color='#dce4d7');ax.set_axisbelow(True)
for j,(key,color,label) in enumerate(zip(['referenceMs','experimentalMs','heapMs'],colors,labels)):
 values=[c[key]/1000 for c in cases];axes[0].bar([i+(j-1)*.25 for i in range(3)],values,width=.23,color=color,label=label)
 for i,v in enumerate(values):axes[0].text(i+(j-1)*.25,v+.6,f'{v:.1f}',ha='center',fontsize=9)
axes[0].set_xticks(range(3),['Arlanda','Vallentuna','Skärvik']);axes[0].set_ylabel('Seconds');axes[0].set_title('Node: complete route search',loc='left',fontweight='bold');axes[0].legend(frameon=False,fontsize=8)
b=r['routingBrowser']['results'];axes[1].bar(range(3),[c['elapsed']/1000 for c in b],color=colors,width=.65)
for i,c in enumerate(b):axes[1].text(i,c['elapsed']/1000+.08,f"{c['elapsed']/1000:.2f}",ha='center')
axes[1].set_xticks(range(3),['Current','Route scan','Priority walk']);axes[1].set_ylabel('Seconds');axes[1].set_title('Arlanda: dedicated browser worker',loc='left',fontweight='bold');axes[1].set_ylim(0,5.3)
fig.suptitle('Routing prototypes: scan routes, preserve the walking frontier',x=.04,ha='left',fontweight='bold',fontsize=15,color='#183a30')
fig.text(.04,.025,'One run per query/engine; includes query-side indexing, excludes loading. All travel-time/arrival objectives and\nwalking frontiers match. Desktop Chromium uses a mobile viewport without throttling. Production is unchanged.',fontsize=9,color='#526257')
fig.subplots_adjust(top=.80,bottom=.22,wspace=.25);Path('docs/images').mkdir(exist_ok=True)
fig.savefig('docs/images/algorithm-routing.png',dpi=150,facecolor=fig.get_facecolor())
