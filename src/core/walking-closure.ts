import type {Network,Walk,WalkingClosureTable} from './types';

/** Exact integer-second walking distances, bound to the immutable source files. */
export class WalkingClosure implements WalkingClosureTable {
  readonly maxSeconds:number; readonly pairs:number;
  private rows:Uint32Array; private entries:Uint32Array;
  constructor(bytes:ArrayBuffer,private network:Network,source:{walksSHA256:string;stopsSHA256:string;maxSeconds:number}){
    const fail=()=>{throw new Error('Det förberäknade gångpaketet är skadat eller tillhör en annan dataversion.');};
    if(bytes.byteLength<96)fail();
    const header=new DataView(bytes),n=header.getUint32(8,true),walks=header.getUint32(12,true);
    this.maxSeconds=header.getUint32(16,true);this.pairs=header.getUint32(20,true);
    const hash=(offset:number)=>[...new Uint8Array(bytes,offset,32)].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(header.getUint32(0,true)!==0x31435753||header.getUint32(4,true)!==1||header.getUint32(24,true)!==96||header.getUint32(28,true)!==0
      ||n!==network.stops.length||n>65535||walks!==network.walks.length||this.maxSeconds!==source.maxSeconds
      ||hash(32)!==source.walksSHA256||hash(64)!==source.stopsSHA256
      ||bytes.byteLength!==96+4*(n+1)+8*this.pairs)fail();
    this.rows=new Uint32Array(bytes,96,n+1);this.entries=new Uint32Array(bytes,96+4*(n+1),this.pairs*2);
    if(this.rows[0]!==0||this.rows[n]!==this.pairs)fail();
    for(let from=0;from<n;from++){
      if(this.rows[from]>this.rows[from+1])fail();let previous=-1;
      for(let i=this.rows[from];i<this.rows[from+1];i++){
        const to=this.destination(i),seconds=this.seconds(i),edge=network.walks[this.entries[i*2+1]];
        if(to<=previous||to>=n||to===from||seconds<1||seconds>this.maxSeconds||!edge||edge.from!==from||!Number.isInteger(edge.seconds)||edge.seconds<=0||edge.seconds>seconds)fail();previous=to;
      }
    }
    // Verify all witness suffixes once. Positive edge times make distances
    // strictly decrease, proving termination and every reconstructed path.
    for(let from=0;from<n;from++)for(let i=this.begin(from);i<this.end(from);i++){
      const to=this.destination(i),edge=network.walks[this.entries[i*2+1]],suffix=edge.to===to?0:this.seconds(this.find(edge.to,to));
      if(this.seconds(i)!==edge.seconds+suffix)fail();
    }
  }
  begin(stop:number){return this.rows[stop];}
  end(stop:number){return this.rows[stop+1];}
  destination(entry:number){return this.entries[entry*2]&65535;}
  seconds(entry:number){return this.entries[entry*2]>>>16;}
  private find(from:number,to:number){
    let lo=this.begin(from),hi=this.end(from);
    while(lo<hi){const mid=(lo+hi)>>>1;if(this.destination(mid)<to)lo=mid+1;else hi=mid;}
    if(lo===this.end(from)||this.destination(lo)!==to)throw new Error('Gångpaketet saknar en del av en gångväg.');return lo;
  }
  path(from:number,to:number):Walk[]{
    const result:Walk[]=[];
    while(from!==to){const edge=this.network.walks[this.entries[this.find(from,to)*2+1]];result.push(edge);from=edge.to;}
    return result;
  }
}

export async function decodeWalkingClosure(bytes:ArrayBuffer,network:Network,source:{walksSHA256:string;stopsSHA256:string;maxSeconds:number}):Promise<WalkingClosure>{
  if(new Uint8Array(bytes)[0]===0x1f&&new Uint8Array(bytes)[1]===0x8b){
    bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return new WalkingClosure(bytes,network,source);
}
