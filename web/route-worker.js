'use strict';
// Full-area navigation is independent of browsing slices. Project anchors onto
// triangle interiors; ceilings and disconnected floors cannot become shortcuts.
let nodes=[],edges=[],triangles=[],grid=new Map(),components,ready=false,stats,lineBlocked=()=>false;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const key=p=>p.map(x=>Math.round(x*1000)).join(':');
const cell=(x,z)=>Math.floor(x/4)+':'+Math.floor(z/4);
function segmentCells(a,b){const cells=[],dx=b[0]-a[0],dz=b[2]-a[2],sx=Math.sign(dx),sz=Math.sign(dz);let x=Math.floor(a[0]/4),z=Math.floor(a[2]/4),endX=Math.floor(b[0]/4),endZ=Math.floor(b[2]/4),tx=sx?((x+(sx>0?1:0))*4-a[0])/dx:Infinity,tz=sz?((z+(sz>0?1:0))*4-a[2])/dz:Infinity;for(let i=0;i<10000;i++){cells.push(x+':'+z);if(x===endX&&z===endZ)break;if(tx<tz){x+=sx;tx+=4/Math.abs(dx);}else{z+=sz;tz+=4/Math.abs(dz);}}return cells;}
function build(a){
 ready=false;nodes=[];edges=[];triangles=[];grid=new Map();const index=new Map(),boundary=new Map(),risers=[],walls=new Map();
 const node=p=>{const k=key(p);if(index.has(k))return index.get(k);const id=nodes.length;index.set(k,id);nodes.push(p);edges.push(new Set());return id;};
 const connect=(x,y)=>{if(x!==y){edges[x].add(y);edges[y].add(x);}};
 for(let i=0;i<a.length;i+=9){
  const p=Array.from(a.subarray(i,i+3)),q=Array.from(a.subarray(i+3,i+6)),r=Array.from(a.subarray(i+6,i+9)),u=q.map((x,j)=>x-p[j]),v=r.map((x,j)=>x-p[j]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);
  if(length<1e-7)continue;
  if(normal[1]/length<.58){if(Math.abs(normal[1])/length<.1&&Math.max(p[1],q[1],r[1])-Math.min(p[1],q[1],r[1])<=.55)risers.push([p,q,r]);for(let x=Math.floor(Math.min(p[0],q[0],r[0])/4);x<=Math.floor(Math.max(p[0],q[0],r[0])/4);x++)for(let z=Math.floor(Math.min(p[2],q[2],r[2])/4);z<=Math.floor(Math.max(p[2],q[2],r[2])/4);z++){const k=x+':'+z;if(!walls.has(k))walls.set(k,[]);walls.get(k).push(i);}continue;}
  const ids=[node(p),node(q),node(r)],id=triangles.length;triangles.push(ids);
  for(let j=0;j<3;j++){const x=ids[j],y=ids[(j+1)%3];connect(x,y);const k=Math.min(x,y)+':'+Math.max(x,y),old=boundary.get(k);if(old)old.count++;else boundary.set(k,{x,y,count:1});}
  for(let x=Math.floor(Math.min(p[0],q[0],r[0])/4);x<=Math.floor(Math.max(p[0],q[0],r[0])/4);x++)for(let z=Math.floor(Math.min(p[2],q[2],r[2])/4);z<=Math.floor(Math.max(p[2],q[2],r[2])/4);z++){const k=x+':'+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}
 }
 // Short, original vertical riser edges join treads only when both ends already
 // belong to upward surfaces. Arbitrary walls and drops remain disconnected.
 let steps=0,seams=0;
 for(const tri of risers)for(let j=0;j<3;j++){const p=tri[j],q=tri[(j+1)%3],x=index.get(key(p)),y=index.get(key(q));if(x!==undefined&&y!==undefined&&Math.abs(p[1]-q[1])>.03&&Math.hypot(p[0]-q[0],p[2]-q[2])<.08){connect(x,y);steps++;}}
 // Join T junctions and centimetre extraction seams ON boundary edges only.
 const bins=new Map();for(const e of boundary.values())if(e.count===1)for(const id of [e.x,e.y]){const p=nodes[id],k=cell(p[0],p[2]);if(!bins.has(k))bins.set(k,new Set());bins.get(k).add(id);}
 for(const e of boundary.values())if(e.count===1){const a=nodes[e.x],b=nodes[e.y],delta=b.map((v,j)=>v-a[j]),sq=delta.reduce((s,v)=>s+v*v,0);if(sq<1e-8)continue;const seen=new Set(),samples=Math.max(1,Math.ceil(Math.hypot(delta[0],delta[2])/2));for(let s=0;s<=samples;s++){const x=Math.floor((a[0]+delta[0]*s/samples)/4),z=Math.floor((a[2]+delta[2]*s/samples)/4);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const id of bins.get((x+dx)+':'+(z+dz))||[]){if(id===e.x||id===e.y||seen.has(id))continue;seen.add(id);const p=nodes[id],t=Math.max(0,Math.min(1,delta.reduce((v,d,j)=>v+d*(p[j]-a[j]),0)/sq)),q=a.map((v,j)=>v+delta[j]*t);if(dist(p,q)<=.025){connect(id,e.x);connect(id,e.y);seams++;}}}}
 const labelComponents=()=>{components=new Int32Array(nodes.length).fill(-1);let count=0;for(let i=0;i<nodes.length;i++)if(components[i]<0){const stack=[i];components[i]=count;while(stack.length){const x=stack.pop();for(const y of edges[x])if(components[y]<0){components[y]=count;stack.push(y);}}count++;}return count;};
 labelComponents();
 // Low-resolution extraction can leave neighbouring stair treads unwelded.
 // Accept only a short supported step, with two body-height wall checks. This
 // cannot bridge a ladder, a floor-sized height gap, or a closed static wall.
 const blocked=(p,q,height)=>{const origin=[p[0],p[1]+height,p[2]],d=q.map((v,j)=>v-p[j]),candidates=new Set();for(const k of segmentCells(p,q))for(const offset of walls.get(k)||[])candidates.add(offset);for(const i of candidates){const ax=a[i],ay=a[i+1],az=a[i+2],ux=a[i+3]-ax,uy=a[i+4]-ay,uz=a[i+5]-az,vx=a[i+6]-ax,vy=a[i+7]-ay,vz=a[i+8]-az,hx=d[1]*vz-d[2]*vy,hy=d[2]*vx-d[0]*vz,hz=d[0]*vy-d[1]*vx,det=ux*hx+uy*hy+uz*hz;if(Math.abs(det)<1e-9)continue;const sx=origin[0]-ax,sy=origin[1]-ay,sz=origin[2]-az,u=(sx*hx+sy*hy+sz*hz)/det;if(u<-.001||u>1.001)continue;const rx=sy*uz-sz*uy,ry=sz*ux-sx*uz,rz=sx*uy-sy*ux,v=(d[0]*rx+d[1]*ry+d[2]*rz)/det;if(v<-.001||u+v>1.001)continue;const t=(vx*rx+vy*ry+vz*rz)/det;if(t>.005&&t<.995)return true;}return false;};
 lineBlocked=(p,q)=>blocked(p,q,.35)||blocked(p,q,1.2);
 const stepBins=new Map(),borderIds=new Set();for(const e of boundary.values())if(e.count===1){borderIds.add(e.x);borderIds.add(e.y);}for(const id of borderIds){const p=nodes[id],k=Math.floor(p[0])+':'+Math.floor(p[2]);if(!stepBins.has(k))stepBins.set(k,[]);stepBins.get(k).push(id);}
 let supportedSteps=0;
 for(const id of borderIds){const p=nodes[id],x=Math.floor(p[0]),z=Math.floor(p[2]);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const other of stepBins.get((x+dx)+':'+(z+dz))||[]){if(other<=id||components[id]===components[other])continue;const q=nodes[other],dy=Math.abs(p[1]-q[1]),horizontal=Math.hypot(p[0]-q[0],p[2]-q[2]);if(dy>.55||horizontal>.65||horizontal<.025)continue;const midpoint=p.map((v,j)=>(v+q[j])*.5);let support=false;for(const tri of grid.get(cell(midpoint[0],midpoint[2]))||[]){const surface=project(midpoint,tri);if(Math.hypot(surface[0]-midpoint[0],surface[2]-midpoint[2])<.12&&Math.abs(surface[1]-midpoint[1])<.6){support=true;break;}}if(support&&!blocked(p,q,.35)&&!blocked(p,q,1.2)){connect(id,other);supportedSteps++;}}}
 const count=labelComponents();ready=true;stats={nodes:nodes.length,triangles:triangles.length,components:count,steps,seams,supportedSteps};return stats;
}
function project(p,id){
 const ids=triangles[id],a=nodes[ids[0]],b=nodes[ids[1]],c=nodes[ids[2]],u=[b[0]-a[0],b[2]-a[2]],v=[c[0]-a[0],c[2]-a[2]],w=[p[0]-a[0],p[2]-a[2]],den=u[0]*v[1]-u[1]*v[0];
 const s=(w[0]*v[1]-w[1]*v[0])/den,t=(u[0]*w[1]-u[1]*w[0])/den;
 if(s>=0&&t>=0&&s+t<=1)return [p[0],a[1]+s*(b[1]-a[1])+t*(c[1]-a[1]),p[2]];
 let best=null,score=Infinity;for(let j=0;j<3;j++){const a=nodes[ids[j]],b=nodes[ids[(j+1)%3]],dx=b[0]-a[0],dz=b[2]-a[2],sq=dx*dx+dz*dz,t=sq?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/sq)):0,q=a.map((v,k)=>v+(b[k]-v)*t),d=(q[0]-p[0])**2+(q[2]-p[2])**2;if(d<score){best=q;score=d;}}return best;
}
function anchor(p,target=false){
 const nearby=new Set(),x=Math.floor(p[0]/4),z=Math.floor(p[2]/4);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const id of grid.get((x+dx)+':'+(z+dz))||[])nearby.add(id);
 let best=null;for(const id of nearby){const q=project(p,id),horizontal=Math.hypot(q[0]-p[0],q[2]-p[2]),dy=p[1]-q[1];if(horizontal>3||dy<-.65||dy>(target?6:3))continue;const score=horizontal*horizontal*4+dy*dy+(dy<-.1?4:0);if(!best||score<best.score)best={p:q,ids:triangles[id],triangle:id,score,component:components[triangles[id][0]],gap:dist(p,q)};}return best;
}
// Exact interval coverage on original upward triangles permits straight paths
// through polygon interiors without cutting across a wall or unsupported gap.
function surfaceLine(p,q,component){
 if(lineBlocked(p,q))return false;const ids=new Set(),intervals=[];for(const k of segmentCells(p,q))for(const id of grid.get(k)||[])ids.add(id);
 for(const id of ids){const tri=triangles[id];if(components[tri[0]]!==component)continue;const a=nodes[tri[0]],b=nodes[tri[1]],c=nodes[tri[2]],ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-a[0],vz=c[2]-a[2],den=ux*vz-uz*vx;
  const at=r=>{const x=r[0]-a[0],z=r[2]-a[2],s=(x*vz-z*vx)/den,t=(ux*z-uz*x)/den;return [s,t,1-s-t,r[1]-a[1]-s*(b[1]-a[1])-t*(c[1]-a[1])];},from=at(p),to=at(q);let low=0,high=1;
  const clip=(a,b,min)=>{if(a<min&&b<min){high=-1;return;}if(a<min)low=Math.max(low,(min-a)/(b-a));else if(b<min)high=Math.min(high,(min-a)/(b-a));};
  for(let j=0;j<3;j++)clip(from[j],to[j],-.00001);clip(from[3],to[3],-.025);clip(-from[3],-to[3],-.025);if(low<=high)intervals.push([low,high]);
 }intervals.sort((a,b)=>a[0]-b[0]);let end=0;for(const [a,b] of intervals){if(a>end+.0001)return false;end=Math.max(end,b);if(end>=.99999)return true;}return false;
}
function corridor(points,component){
 const ids=new Set();for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],samples=Math.max(1,Math.ceil(dist(a,b)/2));for(let s=0;s<=samples;s++){const p=a.map((v,j)=>v+(b[j]-v)*s/samples),x=Math.floor(p[0]/4),z=Math.floor(p[2]/4);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const id of grid.get((x+dx)+':'+(z+dz))||[]){if(ids.has(id)||components[triangles[id][0]]!==component)continue;const q=project(p,id);if(Math.hypot(q[0]-p[0],q[2]-p[2])<2.5&&Math.abs(q[1]-p[1])<.65)ids.add(id);}}}
 const result=new Float32Array(ids.size*9);let offset=0;for(const id of ids)for(const vertex of triangles[id])for(const v of nodes[vertex])result[offset++]=v;return result;
}
class Heap{constructor(){this.a=[];}push(x){let i=this.a.length;this.a.push(x);while(i){let p=(i-1)>>1;if(this.a[p][1]<=x[1])break;this.a[i]=this.a[p];i=p;}this.a[i]=x;}pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][1]<this.a[c][1])c++;if(this.a[c][1]>=last[1])break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return top;}}
function route(from,to){
 if(!ready)throw Error('notReady');const start=anchor(from),goal=anchor(to,true);if(!start||!goal)throw Error('noSurface');if(start.component!==goal.component)throw Error('disconnected');
 let points;
 if(surfaceLine(start.p,goal.p,start.component))points=[start.p,goal.p];
 else{const cost=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),closed=new Uint8Array(nodes.length),heap=new Heap(),goals=new Set(goal.ids);for(const id of start.ids){cost[id]=dist(start.p,nodes[id]);heap.push([id,cost[id]+dist(nodes[id],goal.p)]);}let end=-1,best=Infinity;
  while(heap.a.length){const [id,estimate]=heap.pop();if(estimate>=best)break;if(closed[id])continue;closed[id]=1;if(goals.has(id)){const c=cost[id]+dist(nodes[id],goal.p);if(c<best){best=c;end=id;}}for(const next of edges[id]){const c=cost[id]+dist(nodes[id],nodes[next]);if(c<cost[next]){cost[next]=c;prev[next]=id;heap.push([next,c+dist(nodes[next],goal.p)]);}}}
  if(end<0)throw Error('disconnected');const ids=[];for(let id=end;id>=0;id=prev[id])ids.push(id);points=[start.p,...ids.reverse().map(i=>nodes[i]),goal.p];
 }
 points=points.filter((p,i)=>!i||dist(p,points[i-1])>.015);const smooth=[];for(let i=0;i<points.length;){smooth.push(points[i]);if(i===points.length-1)break;let next=i+1;for(let j=Math.min(points.length-1,i+32);j>i+1;j--)if(surfaceLine(points[i],points[j],start.component)){next=j;break;}i=next;}points=smooth;if(points.length===1)points.push([...points[0]]);
 return {points,length:points.slice(1).reduce((s,p,i)=>s+dist(points[i],p),0),startGap:start.gap,endGap:goal.gap,start:start.p,goal:goal.p,corridor:corridor(points,start.component)};
}
const errors={notReady:['導航地形尚未準備好','Navigation terrain is not ready'],noSurface:['附近沒有可靠路面；請移近道路後重試','No reliable surface nearby; move closer to a path and retry'],disconnected:['地形路線未連通；可能需梯子、升降機或另一入口','No continuous terrain route; a ladder, elevator or another entrance may be needed']};
onmessage=e=>{const m=e.data;try{if(m.type==='build')postMessage({type:'built',token:m.token,...build(new Float32Array(m.positions))});else if(m.type==='anchors')postMessage({type:'anchors',token:m.token,anchors:m.markers.map(m=>({id:m.id,p:anchor(m.p,true)?.p??null}))});else postMessage({type:'route',token:m.token,request:m.request,...route(m.from,m.to)});}catch(err){const [error,errorEn]=errors[err.message]||[err.message,err.message];postMessage({type:'error',token:m.token,request:m.request,error,errorEn});}};
