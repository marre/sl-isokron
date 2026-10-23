"""Publish compact measurements; retain raw trials, omit large local fixtures."""
import hashlib,json,statistics,re
from pathlib import Path
root=Path('.data-build/walking-state')
reports=[json.loads((root/name).read_text()) for name in ['browser-results.json','numeric-results.json']]
summary=[]
for batch,report in zip(['bookkeeping','numeric'],reports):
    for origin in dict.fromkeys(row['origin'] for row in report['cases']):
        cases=[row for row in report['cases'] if row['origin']==origin]
        baseline=statistics.median(row['ms'] for row in cases if row['variant']=='baseline')
        for variant in dict.fromkeys(row['variant'] for row in cases):
            values=[row['ms'] for row in cases if row['variant']==variant]
            median=statistics.median(values)
            summary.append({'batch':batch,'origin':origin,'variant':variant,'medianMs':median,'minMs':min(values),'maxMs':max(values),'speedup':baseline/median,'reductionPercent':100*(1-median/baseline)})
log=(root/'regressions.log').read_text()
passed=int(re.search(r'ℹ pass (\d+)',log)[1]);failed=int(re.search(r'ℹ fail (\d+)',log)[1])
assert passed==205 and failed==0,'Run the complete five-variant regression set before publishing this report.'
result={'routerSHA256':hashlib.sha256(Path('src/core/router.ts').read_bytes()).hexdigest(),'summary':summary,'batches':reports,'closure':json.loads((root/'closure-all.json').read_text()),'counters':json.loads((root/'counters.json').read_text()),'regressions':{'passed':passed,'failed':failed,'variants':5,'seededTransferNetworksPerVariant':150,'independentExhaustiveNetworksPerVariant':60}}
result['closure'].pop('rows')
Path('docs/walking-state-results.json').write_text(json.dumps(result,indent=2)+'\n')
for row in summary:print(row['batch'],row['origin'],row['variant'],round(row['medianMs']),f"{row['speedup']:.2f}x",f"{row['reductionPercent']:.1f}%")
