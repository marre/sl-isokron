"""Isolated WalkingView prototype: logical contribution groups != physical files."""
from pathlib import Path
source=Path('src/walking-view.ts').read_text().replace("from './core/","from '../../src/core/").replace("new URL('./bands-worker.ts'","new URL('../../src/bands-worker.ts'")
source=source.replace("const {result,settings,manifest,stops}=this.data,areas=manifest.walkingAreas;", "const {result,settings,manifest,stops}=this.data,areas=manifest.walkingAreas as (NonNullable<Manifest['walkingAreas']>&{sources?:Record<string,number>})|undefined;")
source=source.replace('    const positions=new Map<number,number[]>();', '    const positions=new Map<number,number[]>(),deliveries=new Map<number,number>(),deliveryPositions=new Map<number,number[]>();')
source=source.replace("      const file=areas.index[stops[index].id];\n      if(file!==undefined)positions.set(file,[...(positions.get(file)??[]),index]);", '''      const id=stops[index].id,file=areas.index[id],source=areas.sources?.[id]??file;
      if(file!==undefined){
        if(deliveries.has(source)&&deliveries.get(source)!==file)throw new Error('Logical source split between deliveries');
        positions.set(source,[...(positions.get(source)??[]),index]);deliveries.set(source,file);
        deliveryPositions.set(file,[...(deliveryPositions.get(file)??[]),index]);
      }''')
source=source.replace('    let wanted=new Set<number>()', '    let selected=new Set<number>();\n    let wanted=new Set<number>()')
source=source.replace('return wanted.has(file)&&this.profiles.has(file)?', 'return selected.has(areas.sources?.[id]??file)&&wanted.has(file)&&this.profiles.has(file)?')
source=source.replace('      const previous=wanted;', '      const previous=wanted,previousSelected=selected;')
source=source.replace('      wanted=new Set([...positions.keys()].filter(file=>positions.get(file)!.some(i=>expanded.contains([stops[i].lat,stops[i].lon]))));', '''      selected=new Set([...positions.keys()].filter(source=>positions.get(source)!.some(i=>expanded.contains([stops[i].lat,stops[i].lon]))));
      wanted=new Set([...selected].map(source=>deliveries.get(source)!));''')
source=source.replace('changed=previous.size!==wanted.size||', 'changed=previousSelected.size!==selected.size||[...selected].some(source=>!previousSelected.has(source))||previous.size!==wanted.size||')
source=source.replace('...positions.get(file)!.map(i=>this.map.distance', '...deliveryPositions.get(file)!.map(i=>this.map.distance')
assert 'selected.has(areas.sources' in source and 'wanted=new Set([...selected]' in source
Path('.data-build/delivery-lab/bundled-view.ts').write_text(source)
old='await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));'
assert old in source
Path('.data-build/delivery-lab/no-frame-view.ts').write_text(source.replace(old,'await Promise.resolve();'))
