/** Run the existing router/walking/journey tests against the experimental engine. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'.data-build/routing-lab/regressions');await mkdir(out,{recursive:true});const files=[];
await writeFile(path.join(out,'heap-bridge.ts'),`export {searchHeap as search} from '${path.join(root,'experiments/routing-lab/raptor')}';`);
for(const mode of ['route','heap'])for(const name of ['router','journey','walking','search_audit']){
 const source=path.join(root,'tests',name+'.test.ts'),target=path.join(out,mode+'-'+name+'.test.ts');
 let text=await readFile(source,'utf8');
 text=text.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(match,quote,relative)=>{
  const absolute=path.resolve(path.dirname(source),relative);
  return quote+(absolute===path.join(root,'src/core/router')?(mode==='route'?path.join(root,'experiments/routing-lab/raptor'):path.join(out,'heap-bridge')):absolute)+quote;
 });
 await writeFile(target,text);files.push(target);
}
const child=spawn(path.join(root,'node_modules/.bin/tsx'),['--test',...files],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));
