import {decodePacked,decodeGrid,nativeRender,packedRender,gridRender,type Native,type PackedProfiles,type GridProfiles,type Budgets} from './runtime';
import {sample} from './algorithms';
import {paintBands} from '../../src/core/bands';
let retained:Native|PackedProfiles|GridProfiles|undefined;
const win=window as unknown as {run:(caseId:string,kind:string)=>Promise<unknown>;ready:boolean;release:()=>void};
win.release=()=>{retained=undefined};
win.run=async(caseId,kind)=>{
 const scenario=await(await fetch(`/.data-build/walking-lab/${caseId}/scenario.json`)).json(),url=kind==='native'?'native.json':kind==='packed'?'packed.bin':kind==='fixed'?'fixed.bin':kind+'.bin';
 const buffer=await(await fetch(`/.data-build/walking-lab/${caseId}/${url}`)).arrayBuffer(),begin=performance.now();
 retained=kind==='native'?JSON.parse(new TextDecoder().decode(buffer)):(kind==='packed'||kind==='fixed')?decodePacked(buffer):decodeGrid(buffer);
 const decodeMs=performance.now()-begin,grid=scenario.screen,compose=(budgets:Budgets)=>kind==='native'?nativeRender(retained as Native,budgets,grid):(kind==='packed'||kind==='fixed')?packedRender(retained as PackedProfiles,budgets,grid):sample(gridRender(retained as GridProfiles,budgets,kind.startsWith('earliest')), (retained as GridProfiles).grid,grid);
 const times:number[]=[],fields=[];for(let i=0;i<5;i++){const start=performance.now(),field=compose(scenario.budgets);times.push(performance.now()-start);if(i===4)fields.push(field)}
 const field=fields[0],cutoffTimes=[];
 for(let i=0;i<5;i++){
  const start=performance.now();
  if(kind==='native'||kind==='packed'||kind==='fixed'){
   const partial=Object.fromEntries(Object.entries(scenario.cutoffBudgets[91] as Budgets).map(([id,bs])=>[id,bs.filter(b=>b.minutes===91)]));
   paintBands(field,grid,120,91,compose(partial));
  }else paintBands(compose(scenario.cutoffBudgets[91]),grid,120,91);
  cutoffTimes.push(performance.now()-start);
 }
 // Digest verifies actual browser output rather than relying on timing a no-op.
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',field as Uint8Array<ArrayBuffer>))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {decodeMs,composeMs:times.sort((a,b)=>a-b)[2],composeSamplesMs:times,cutoff91Ms:cutoffTimes.sort((a,b)=>a-b)[2],fieldHash:hash};
};
win.ready=true;
