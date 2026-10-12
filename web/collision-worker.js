// Static median-split BVH. Built away from the UI/game threads, one map at a time.
onmessage=e=>{
 const {token,buffer}=e.data,a=new Float32Array(buffer),count=a.length/9;
 const ids=new Uint32Array(count),centers=new Float32Array(count*3);
 for(let i=0;i<count;i++){ids[i]=i;for(let k=0;k<3;k++)centers[i*3+k]=(a[i*9+k]+a[i*9+k+3]+a[i*9+k+6])/3;}
 const out=[];
 function select(lo,hi,k,axis){while(lo<hi){const pivot=centers[ids[(lo+hi)>>1]*3+axis];let i=lo,j=hi;while(i<=j){while(centers[ids[i]*3+axis]<pivot)i++;while(centers[ids[j]*3+axis]>pivot)j--;if(i<=j){const t=ids[i];ids[i++]=ids[j];ids[j--]=t;}}if(k<=j)hi=j;else if(k>=i)lo=i;else break;}}
 function node(start,end){
  const index=out.length/8;out.push(Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity,0,0);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let j=start;j<end;j++){const t=ids[j];for(let k=0;k<3;k++){const c=centers[t*3+k];min[k]=Math.min(min[k],c);max[k]=Math.max(max[k],c);for(let v=0;v<9;v+=3){const n=a[t*9+k+v];out[index*8+k]=Math.min(out[index*8+k],n);out[index*8+k+3]=Math.max(out[index*8+k+3],n);}}}
  if(end-start<=16){out[index*8+6]=-start-1;out[index*8+7]=end-start;return index;}
  let axis=0;for(let k=1;k<3;k++)if(max[k]-min[k]>max[axis]-min[axis])axis=k;
  const mid=(start+end)>>1;select(start,end-1,mid,axis);
  const left=node(start,mid),right=node(mid,end);out[index*8+6]=left;out[index*8+7]=right;return index;
 }
 if(count)node(0,count);const nodes=new Float32Array(out);
 postMessage({token,nodes:nodes.buffer,ids:ids.buffer},[nodes.buffer,ids.buffer]);
};
