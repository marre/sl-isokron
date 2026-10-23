/** Research-only exact walking table. Not part of the app or its data contract. */
import type {Network,Walk} from '../../src/core/types';
export class WalkingClosure {
 readonly maxSeconds:number;readonly pairs:number;
 private rows:Uint32Array;private entries:Uint32Array;
 constructor(bytes:ArrayBuffer,private network:Network){
  const header=new DataView(bytes);
  if(bytes.byteLength<32||header.getUint32(0,true)!==0x43574c53||header.getUint32(4,true)!==1)throw new Error('Invalid walking closure header');
  const count=header.getUint32(8,true),walks=header.getUint32(12,true);this.maxSeconds=header.getUint32(16,true);this.pairs=header.getUint32(20,true);
  if(count!==network.stops.length||walks!==network.walks.length||count>65535||this.maxSeconds!==1800||bytes.byteLength!==32+4*(count+1)+8*this.pairs)throw new Error('Walking closure dimensions do not match fixture');
  this.rows=new Uint32Array(bytes,32,count+1);this.entries=new Uint32Array(bytes,32+4*(count+1),this.pairs*2);
  if(this.rows[0]!==0||this.rows[count]!==this.pairs)throw new Error('Invalid closure row bounds');
  for(let from=0;from<count;from++){
   if(this.rows[from]>this.rows[from+1])throw new Error('Unordered closure rows');let previous=-1;
   for(let i=this.rows[from];i<this.rows[from+1];i++){
    const to=this.destination(i),seconds=this.seconds(i),edge=network.walks[this.entries[i*2+1]];
    if(to<=previous||to>=count||to===from||seconds<1||seconds>this.maxSeconds||!edge||edge.from!==from||edge.seconds>seconds)throw new Error('Invalid closure entry');previous=to;
   }
  }
 }
 begin(stop:number){return this.rows[stop]}
 end(stop:number){return this.rows[stop+1]}
 destination(entry:number){return this.entries[entry*2]&65535}
 seconds(entry:number){return this.entries[entry*2]>>>16}
 private find(from:number,to:number){let lo=this.begin(from),hi=this.end(from);while(lo<hi){const mid=(lo+hi)>>>1;if(this.destination(mid)<to)lo=mid+1;else hi=mid;}if(lo===this.end(from)||this.destination(lo)!==to)throw new Error('Missing closure witness suffix');return lo;}
 path(from:number,to:number):Walk[]{
  const result:Walk[]=[];let remaining=this.seconds(this.find(from,to));
  while(from!==to){
   const index=this.find(from,to),edge=this.network.walks[this.entries[index*2+1]];
   if(this.seconds(index)!==remaining||edge.seconds<=0)throw new Error('Inconsistent closure witness');
   result.push(edge);remaining-=edge.seconds;from=edge.to;
   if(remaining<0||from!==to&&remaining===0)throw new Error('Invalid closure witness distance');
  }
  if(remaining!==0)throw new Error('Invalid closure witness endpoint');return result;
 }
}
