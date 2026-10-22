"""Render the measured city comparison; requires matplotlib (research only)."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
r=json.loads(Path('docs/walking-lab-results.json').read_text())
c=next(c for c in r['cases'] if c['id']=='city');b=next(c for c in r['browser']['cases'] if c['id']=='city')
ids=['native','packed','fixed','grid-10','grid-20','grid-40'];labels=['Current JSON','Float64 vectors','Lossless fixed-point','10 m grid','20 m grid','40 m grid']
variants={v['id']:v for v in c['variants']};browser={v['id']:v for v in b['variants']}
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False,'axes.spines.bottom':False})
fig,axes=plt.subplots(1,3,figsize=(13,5.8),gridspec_kw={'width_ratios':[1.3,1,1]});fig.set_facecolor('#f4f6f2')
colors=['#8c9d91','#b4beb1','#24734e','#a7bfd0','#487b9b','#9aafbb'];ys=list(range(len(ids)))
for ax in axes:ax.set_facecolor('#f4f6f2');ax.invert_yaxis();ax.set_yticks(ys);ax.tick_params(axis='both',length=0);ax.set_axisbelow(True);ax.grid(axis='x',color='#dfe5dc',linewidth=.7);ax.set_ylim(5.6,-.6)
decode=[browser[k]['decodeMs'] for k in ids];compose=[browser[k]['composeMs'] for k in ids]
axes[0].barh(ys,decode,color=colors,height=.62,label='Decode');axes[0].barh(ys,compose,left=decode,color='#d0d9c9',height=.62,label='Compose')
axes[0].set_yticklabels(labels);axes[0].set_title('Decode + compose',loc='left',fontweight='bold',pad=16);axes[0].set_xlabel('Milliseconds');axes[0].set_xlim(0,1650)
for i,(a,b) in enumerate(zip(decode,compose)):axes[0].text(a+b+25,i,f'{a+b:,.0f}',va='center',fontsize=9)
for ax,values,title,label,limit in [(axes[1],[(browser[k]['retainedHeapBytes']+browser[k]['retainedArrayBufferBytes'])/1e6 for k in ids],'Decoded data retained','MB',195),(axes[2],[variants[k]['gzipBytes']/1e6 for k in ids],'Compressed data estimate','MB · gzip',40)]:
 ax.barh(ys,values,color=colors,height=.62);ax.set_yticklabels([]);ax.set_title(title,loc='left',fontweight='bold',pad=16);ax.set_xlabel(label);ax.set_xlim(0,limit)
 for i,v in enumerate(values):ax.text(v+limit*.02,i,f'{v:.1f}',va='center',fontsize=9)
fig.suptitle('Walking layer: compare the costs before changing the algorithm',x=.03,y=.98,ha='left',fontsize=17,fontweight='bold',color='#183a30')
fig.text(.03,.91,'Central Stockholm · 1,001 native profiles · existing data already fetched · desktop Chromium',fontsize=10,color='#526257')
fig.text(.03,.025,'Decode: one call; composition: median of five runs. Retained memory excludes browser/GPU and peak allocations.\nGzip is measured offline. Grids change display boundaries; fixed-point coordinates retain source precision.',fontsize=9,color='#526257',linespacing=1.6)
fig.subplots_adjust(left=.16,right=.98,top=.81,bottom=.2,wspace=.23)
Path('docs/images').mkdir(parents=True,exist_ok=True)
for extension in ['png','svg']:fig.savefig('docs/images/walking-lab-summary.'+extension,dpi=160,facecolor=fig.get_facecolor())
