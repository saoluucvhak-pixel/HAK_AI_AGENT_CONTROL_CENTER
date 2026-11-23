export function createSnapshotCache({load,ttlMs=300000,now=Date.now}){
 let cache=null,cacheTime=0,pending=null;
 return async function getSnapshots(){
  if(cache&&now()-cacheTime<ttlMs)return cache;
  if(pending)return pending;
  pending=Promise.resolve().then(load).then(next=>{
   const previous=new Map((cache||[]).filter(row=>!row.error).map(row=>[row.name,row]));
   cache=next.map(row=>row.error&&previous.has(row.name)?{...previous.get(row.name),stale:true,refreshError:row.error}:row);
   cacheTime=now();
   return cache;
  }).finally(()=>{pending=null});
  return pending;
 };
}
