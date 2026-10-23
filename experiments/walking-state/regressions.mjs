import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'.data-build/walking-state/tests');await mkdir(out,{recursive:true});const files=[];
for(const mode of (process.argv[2]?[process.argv[2]]:['cached','compact','lazy','numeric','guarded']))for(const name of ['router','journey','walking','search_audit','raptor-lab']){
 const source=path.join(root,'tests',name+'.test.ts'),target=path.join(out,mode+'-'+name+'.test.ts');
 let text=await readFile(source,'utf8');
 text=text.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(match,quote,relative)=>{
  const absolute=path.resolve(path.dirname(source),relative);
  return quote+(absolute===path.join(root,'src/core/router')?path.join(root,'.data-build/walking-state',mode):absolute)+quote;
 });
 await writeFile(target,text);files.push(target);
}
const child=spawn(path.join(root,'node_modules/.bin/tsx'),['--test',...files],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));
