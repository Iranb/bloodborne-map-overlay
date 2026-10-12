'use strict';
// Keep the original triangles: road view removes non-floor faces, never
// bridges a gap or collapses stair treads. Full view only reorders into tiles.
self.onmessage=({data})=>{
 const p=new Float32Array(data.positions),n=new Float32Array(data.normals),bins=new Map();
 let kept=0;
 for(let i=0;i<p.length;i+=9){
  if(data.roadOnly){
   const ux=p[i+3]-p[i],uy=p[i+4]-p[i+1],uz=p[i+5]-p[i+2];
   const vx=p[i+6]-p[i],vy=p[i+7]-p[i+1],vz=p[i+8]-p[i+2];
   const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
   const length=Math.hypot(nx,ny,nz);
   // Upward face, at most ~54.5 degrees; same slope budget as navigation.
   // Winding matters: downward ceiling faces must not become "roads".
   if(!Number.isFinite(length)||length<1e-8||ny/length<.58)continue;
  }
  kept++;
  const key=[Math.floor((p[i]+p[i+3]+p[i+6])/144),Math.floor((p[i+1]+p[i+4]+p[i+7])/72),Math.floor((p[i+2]+p[i+5]+p[i+8])/144)].join(',');
  if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);
 }
 const tiles=[],transfer=[];
 for(const offsets of bins.values()){
  const a=new Float32Array(offsets.length*9),b=new Float32Array(a.length);
  for(let j=0;j<offsets.length;j++)for(let k=0;k<9;k++){a[j*9+k]=p[offsets[j]+k];b[j*9+k]=n[offsets[j]+k];}
  tiles.push({positions:a.buffer,normals:b.buffer});transfer.push(a.buffer,b.buffer);
 }
 self.postMessage({token:data.token,tiles,triangles:kept,sourceTriangles:p.length/9,roadOnly:!!data.roadOnly},transfer);
};
