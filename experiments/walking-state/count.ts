/** Separate instrumented pass, never used as a timing result. */
import {readFileSync,writeFileSync} from 'node:fs';
import {search,diagnostics} from '../../.data-build/walking-state/counted';
const {dataset,network,settings}=JSON.parse(readFileSync('.data-build/walking-state/network.json','utf8'));
const result=search(network,settings[1]);
const report={dataset,origin:settings[1].name,accepted:result.labels,...diagnostics};
writeFileSync('.data-build/walking-state/counters.json',JSON.stringify(report,null,2));console.log(report);
