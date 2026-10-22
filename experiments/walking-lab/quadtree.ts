/** Lossless quadtree of 64×64 native minute-membership masks. */
import type {Tile} from './algorithms';
export const BRANCH=0x80000000;
export function encodeQuad(field:Uint32Array,size=64):Uint32Array{
 const nodes:number[]=[];
 function add(x:number,y:number,n:number){const value=field[y*size+x];let same=true;
  outer:for(let row=y;row<y+n;row++)for(let col=x;col<x+n;col++)if(field[row*size+col]!==value){same=false;break outer}
  if(same){nodes.push(value);return}nodes.push(BRANCH);const half=n/2;add(x,y,half);add(x+half,y,half);add(x,y+half,half);add(x+half,y+half,half);
 }add(0,0,size);return new Uint32Array(nodes);
}
export function decodeQuad(nodes:Uint32Array,size=64):Uint32Array{
 const out=new Uint32Array(size*size);let at=0;
 function visit(x:number,y:number,n:number){const value=nodes[at++];if(value===undefined)throw new Error('Truncated quadtree');if(value===BRANCH){if(n===1)throw new Error('Invalid leaf');const h=n/2;visit(x,y,h);visit(x+h,y,h);visit(x,y+h,h);visit(x+h,y+h,h)}else for(let row=y;row<y+n;row++)out.fill(value,row*size+x,row*size+x+n)}
 visit(0,0,size);if(at!==nodes.length)throw new Error('Trailing nodes');return out;
}
export function quadTiles(parts:Tile[]):Tile[]{return parts.map(p=>{const field=new Uint32Array(4096);for(let i=0;i<p.runs.length;i+=3)field.fill(p.runs[i+2],p.runs[i],p.runs[i]+p.runs[i+1]);return {...p,runs:encodeQuad(field)}})}
export function composeQuad(parts:Tile[],allowances:{minutes:number;walking:number}[],out:Uint8Array,width:number){
 for(const tile of parts){let at=0;
  function visit(x:number,y:number,n:number){const mask=tile.runs[at++];if(mask===BRANCH){const h=n/2;visit(x,y,h);visit(x+h,y,h);visit(x,y+h,h);visit(x+h,y+h,h);return}
   if(!mask)return;const band=allowances.find(b=>!!(mask&(1<<b.walking-1)))?.minutes;if(band===undefined)return;
   for(let row=y;row<y+n;row++){const start=(tile.y*64+row)*width+tile.x*64+x;for(let p=start;p<start+n;p++)if(!out[p]||band<out[p])out[p]=band}
  }visit(0,0,64);
 }
}
/** Exact compression of an already-computed display field, for the visual experiment. */
export function displayQuad(field:Uint8Array,width:number,height:number){
 const size=2**Math.ceil(Math.log2(Math.max(width,height))),values=new Uint32Array(size*size);
 for(let y=0;y<height;y++)values.set(field.subarray(y*width,(y+1)*width),y*size);
 return {nodes:encodeQuad(values,size),size};
}
