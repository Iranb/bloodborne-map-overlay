// A* over walkable collision triangles. Runs off the UI thread. No guessed
// links across walls, floors, elevators or missing collision components.
let nodes=[],edges=[],index=new Map(),ready=false;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function node(p){const key=p.map(x=>Math.round(x*8)).join(':');if(index.has(key))return index.get(key);const id=nodes.length;index.set(key,id);nodes.push(p);edges.push(new Set());return id;}
function build(a){nodes=[];edges=[];index=new Map();
 for(let i=0;i<a.length;i+=9){const p=[...a.subarray(i,i+3)],q=[...a.subarray(i+3,i+6)],r=[...a.subarray(i+6,i+9)];const u=q.map((x,j)=>x-p[j]),v=r.map((x,j)=>x-p[j]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(Math.abs(n[1])/Math.hypot(...n)<.58)continue;
  const ids=[node(p),node(q),node(r)];for(let j=0;j<3;j++){const x=ids[j],y=ids[(j+1)%3];edges[x].add(y);edges[y].add(x);}}
 ready=true;return nodes.length;
}
function nearest(p){let best=-1,score=Infinity;for(let i=0;i<nodes.length;i++){const n=nodes[i],dy=Math.abs(n[1]-p[1]);if(dy>5)continue;const d=(n[0]-p[0])**2+(n[2]-p[2])**2+dy*dy*3;if(d<score){best=i;score=d;}}return best>=0&&dist(nodes[best],p)<14?best:-1;}
class Heap{constructor(){this.a=[];}push(x){let i=this.a.length;this.a.push(x);while(i){let p=(i-1)>>1;if(this.a[p][1]<=x[1])break;this.a[i]=this.a[p];i=p;}this.a[i]=x;}pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][1]<this.a[c][1])c++;if(this.a[c][1]>=last[1])break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return top;}}
function route(from,to){if(!ready)throw Error('導航網格尚未準備好');const start=nearest(from),goal=nearest(to);if(start<0||goal<0)throw Error('起點或目標附近沒有可靠可行走地形');const cost=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),closed=new Uint8Array(nodes.length),heap=new Heap();cost[start]=0;heap.push([start,dist(nodes[start],nodes[goal])]);let visits=0;
 while(heap.a.length&&visits++<nodes.length*3){const [a]=heap.pop();if(closed[a])continue;closed[a]=1;if(a===goal){const ids=[];for(let v=a;v>=0;v=prev[v])ids.push(v);ids.reverse();const points=ids.map(i=>nodes[i]);return {points,length:cost[goal],startGap:dist(from,nodes[start]),endGap:dist(to,nodes[goal])};}for(const b of edges[a]){const c=cost[a]+dist(nodes[a],nodes[b]);if(c<cost[b]){cost[b]=c;prev[b]=a;heap.push([b,c+dist(nodes[b],nodes[goal])]);}}}
 throw Error('靜態地形不連通：可能需要開門、搭升降機或經過缺失地形');
}
onmessage=e=>{const m=e.data;try{if(m.type==='build')postMessage({type:'built',token:m.token,nodes:build(new Float32Array(m.positions))});else postMessage({type:'route',token:m.token,request:m.request,...route(m.from,m.to)});}catch(err){const errors={'導航網格尚未準備好':'Navigation mesh is not ready','起點或目標附近沒有可靠可行走地形':'No reliable walkable terrain near the start or target','靜態地形不連通：可能需要開門、搭升降機或經過缺失地形':'Static terrain is disconnected: a door, elevator or missing geometry may be involved'};postMessage({type:'error',token:m.token,request:m.request,error:err.message,errorEn:errors[err.message]||err.message});}};
