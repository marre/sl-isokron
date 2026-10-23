"""Publish the measured implementation/closure comparison without large artifacts."""
import hashlib,json,statistics
from pathlib import Path
root=Path('.data-build/walking-state');report=json.loads((root/'closure-benchmark.json').read_text())
assert len(report['cases'])==18 and all(row['allObjectivesAndWalkingFrontiersEqual'] and row['allJourneyEdgesValidated'] for row in report['cases'])
report['routerSHA256']=hashlib.sha256(Path('src/core/router.ts').read_bytes()).hexdigest()
report['validation']=json.loads((root/'closure-validation.json').read_text())
summary=[]
for origin in dict.fromkeys(row['origin'] for row in report['cases']):
    cases=[row for row in report['cases'] if row['origin']==origin]
    values={variant:statistics.median(row['ms'] for row in cases if row['variant']==variant) for variant in ['baseline','production','closure']}
    summary.append({'origin':origin,**values,'productionSpeedup':values['baseline']/values['production'],'closureAdditionalSpeedup':values['production']/values['closure'],'closureMedianLoadMs':statistics.median(row['tableLoadMs'] for row in cases if row['variant']=='closure')})
report['summary']=summary
Path('docs/walking-state-followup-results.json').write_text(json.dumps(report,indent=2)+'\n')
for row in summary:print(row)
