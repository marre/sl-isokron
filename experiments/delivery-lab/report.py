"""Retain raw trials and plot the measured layering tradeoff."""
import hashlib,json,os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/sliso-delivery-plots')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
import numpy as np

root=Path('.data-build/delivery-lab');modes=['city','repeat','wide','airport','lindholmen','admission']
reports={mode:json.loads((root/('results-'+mode+'.json')).read_bytes()) for mode in modes}
layout=json.loads((root/'layout.json').read_bytes())
for variant in layout['variants'].values():variant.pop('sourceFiles')
record={'walkingViewSHA256':hashlib.sha256(Path('src/walking-view.ts').read_bytes()).hexdigest(),'inputFixtureSHA256':hashlib.sha256((root/'fixture.json').read_bytes()).hexdigest(),'layout':layout,'widePreview':json.loads((root/'wide-preview.json').read_bytes()),'renderPhasesChecked':sum(len(row['phases']) for r in reports.values() for row in r['cases']),'reports':reports}
Path('docs/delivery-layer-results.json').write_text(json.dumps(record,indent=2)+'\n')

def phase(mode,name,which='cold'):
    return next(p for row in reports[mode]['cases'] if row['name']==name for p in row['phases'] if p['phase']==which)
fig,axes=plt.subplots(1,2,figsize=(11,4.7),layout='constrained');fig.patch.set_facecolor('#fafbf8')
for ax,latency in zip(axes,[False,True]):
    names=['Current','256 KiB bundles','Bundles + overview first']
    base=phase('city','baseline-40ms' if latency else 'baseline');full=phase('city','full256-40ms' if latency else 'full256');layer=phase('wide','layeredWide-40ms' if latency else 'layeredWide')
    values=[base['ms']/1000,full['ms']/1000,layer['previewMs']/1000];extra=[0,0,(layer['ms']-layer['previewMs'])/1000]
    ax.barh(names,values,color=['#868f9c','#2d8a72','#86bfa7']);ax.barh(names,extra,left=values,color='#d5e7df')
    for i,(a,b) in enumerate(zip(values,extra)):
        ax.text(a+b+.12,i,f'{a+b:.2f} s',va='center',fontsize=10)
        if b:ax.text(.12,i,f'Preview: {a:.2f} s',va='center',ha='left',fontsize=8)
    ax.set_xlim(0,14);ax.invert_yaxis();ax.set_xlabel('Seconds after routing; cold browser caches');ax.set_title('Local delivery + 40 ms per response' if latency else 'Local delivery',loc='left',fontweight='bold');ax.spines[['top','right']].set_visible(False);ax.set_axisbelow(True);ax.grid(axis='x',alpha=.2)
fig.suptitle('Bundling speeds completion; layering brings a preview forward',fontsize=14,fontweight='bold')
Path('docs/images').mkdir(exist_ok=True);fig.savefig('docs/images/delivery-timing.png',dpi=150);plt.close(fig)

preview=mpimg.imread(root/'layeredWide-preview.png');detail=mpimg.imread(root/'layeredWide-detail.png')
assert preview.shape==detail.shape
a=np.round(preview*255).astype('uint8');b=np.round(detail*255).astype('uint8');changed=(a!=b).any(axis=2);gained=(a[:,:,3]>0)&(b[:,:,3]==0);lost=(a[:,:,3]==0)&(b[:,:,3]>0)
diff=np.ones_like(preview);diff[changed]=[.95,.68,.18,1];diff[gained]=[.9,.18,.56,1];diff[lost]=[.18,.57,.91,1]
fig,axes=plt.subplots(1,3,figsize=(10,7.2),layout='constrained')
for ax,picture,title in zip(axes,[preview,detail,diff],['Five-minute preview','Full native contours','What refinement changes']):ax.imshow(picture);ax.set_title(title,fontsize=11);ax.axis('off')
fig.set_layout_engine('constrained',rect=(0,.04,1,.96))
fig.suptitle('Central Stockholm · same exact stop results in both layers',fontsize=13,fontweight='bold');fig.text(.5,.005,'Amber: different band colour · Pink: preview-only coverage · Blue: detail-only coverage',ha='center',fontsize=9)
fig.savefig('docs/images/delivery-layers.png',dpi=140);plt.close(fig)
print('Published',record['renderPhasesChecked'],'render phases and two figures')
