import type {FootpathGraph} from './origin-access';
import type {FootpathAnchor,WalkSource} from './types';

export function incomingEdges(graph:FootpathGraph){
 const incoming:FootpathGraph['edges']=new Map();
 for(const [from,edges] of graph.edges)for(const edge of edges){
  const row=incoming.get(edge.to)??[];row.push({...edge,to:from});incoming.set(edge.to,row);
 }
 return incoming;
}

/** A band's two constraints collapse to a remaining walking budget at each
 * seed. A larger remaining budget dominates everywhere on the same graph.
 * Propagation follows incoming edges, never a reversed one-way shortcut. */
export function incomingBudgets(graph:FootpathGraph,incoming:FootpathGraph['edges'],sources:WalkSource[],bandSeconds:number,maxWalk:number,anchor?:FootpathAnchor):Map<number,number>{
 const budgets=new Map<number,number>(),seed=new Map<number,number>();
 for(const s of sources)seed.set(s.stop,Math.max(seed.get(s.stop)??-Infinity,Math.min(bandSeconds-s.seconds,maxWalk-s.walked)));
 const heap:{node:number;budget:number}[]=[];
 function push(node:number,budget:number){
  if(budget<0||budget<=(budgets.get(node)??-Infinity))return;
  budgets.set(node,budget);const item={node,budget};let i=heap.length;heap.push(item);
  while(i){const p=(i-1)>>1;if(heap[p].budget>=budget)break;heap[i]=heap[p];i=p;}heap[i]=item;
 }
 function pop(){const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].budget>heap[c].budget)c++;if(heap[c].budget<=last.budget)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
 for(const [node,bindings] of graph.stops)for(const b of bindings)push(node,(seed.get(b.stop)??-Infinity)-b.seconds);
 if(anchor){
  const edge=graph.segments.find(e=>e.from===anchor.from&&e.to===anchor.to);
  if(edge){const budget=Math.min(bandSeconds,maxWalk);push(edge.from,budget-edge.seconds*anchor.t);if(!edge.oneway)push(edge.to,budget-edge.seconds*(1-anchor.t));}
 }
 while(heap.length){const item=pop();if(item.budget!==budgets.get(item.node))continue;for(const edge of incoming.get(item.node)??[])push(edge.to,item.budget-edge.seconds);}
 return budgets;
}

/** Reachable intervals on an original, forward-directed mapped segment. */
export function incomingIntervals(edge:FootpathGraph['segments'][number],budgets:Map<number,number>,anchor?:FootpathAnchor,directBudget=0):[number,number][]{
 if(edge.seconds===0&&(budgets.has(edge.to)||!edge.oneway&&budgets.has(edge.from)||anchor&&edge.from===anchor.from&&edge.to===anchor.to))return [[0,1]];
 const spans:[number,number][]=[];
 const atTo=budgets.get(edge.to),atFrom=budgets.get(edge.from);
 if(atTo!==undefined)spans.push([Math.max(0,1-atTo/Math.max(edge.seconds,1e-9)),1]);
 if(!edge.oneway&&atFrom!==undefined)spans.push([0,Math.min(1,atFrom/Math.max(edge.seconds,1e-9))]);
 // A destination in the interior of a long edge need not reach either node.
 if(anchor&&edge.from===anchor.from&&edge.to===anchor.to){
  spans.push([Math.max(0,anchor.t-directBudget/Math.max(edge.seconds,1e-9)),anchor.t]);
  if(!edge.oneway)spans.push([anchor.t,Math.min(1,anchor.t+directBudget/Math.max(edge.seconds,1e-9))]);
 }
 return spans.filter(([a,b])=>b>a);
}

/** Clip before rasterizing: a road may cross the viewport while both endpoints
 * lie outside it. A bounded integer stroke avoids enormous overlapping Canvas
 * paths, which stall software rendering on dense urban networks. */
export function strokeIncoming(field:Uint8Array,width:number,height:number,a:number[],b:number[],minutes:number){
 const dx=b[0]-a[0],dy=b[1]-a[1];let lo=0,hi=1;
 for(const [p,q] of [[-dx,a[0]+2],[dx,width+1-a[0]],[-dy,a[1]+2],[dy,height+1-a[1]]]){
  if(p===0){if(q<0)return;continue;}
  const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return;
 }
 let x=Math.round(a[0]+lo*dx),y=Math.round(a[1]+lo*dy);
 const endX=Math.round(a[0]+hi*dx),endY=Math.round(a[1]+hi*dy),ax=Math.abs(endX-x),ay=-Math.abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1;
 let error=ax+ay;
 for(;;){
  for(let row=Math.max(0,y-2);row<=Math.min(height-1,y+2);row++){
   const radius=Math.abs(row-y)===2?1:2,from=Math.max(0,x-radius),until=Math.min(width,x+radius+1);
   if(from<until)field.fill(minutes,row*width+from,row*width+until);
  }
  if(x===endX&&y===endY)break;
  const e=2*error;if(e>=ay){error+=ay;x+=sx;}if(e<=ax){error+=ax;y+=sy;}
 }
}
