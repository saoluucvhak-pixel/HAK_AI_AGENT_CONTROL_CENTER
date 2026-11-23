export function createSnapshotCache({load,ttlMs=300000,quotaCooldownMs=900000,now=Date.now}){
 let cache=null,cacheTime=0,pending=null,nextRefreshAt=0;
 return async function getSnapshots(){
  if(cache&&now()<nextRefreshAt)return cache;
  if(cache&&now()-cacheTime<ttlMs)return cache;
  if(pending)return pending;
  pending=Promise.resolve().then(load).then(next=>{
   const previous=new Map((cache||[]).filter(row=>!row.error).map(row=>[row.name,row]));
   cache=next.map(row=>row.error&&previous.has(row.name)?{...previous.get(row.name),stale:true,refreshError:row.error}:row);
   cacheTime=now();
   const quotaExhausted=next.some(row=>typeof row.error==='string'&&row.error.includes('rate limit exhausted'));
   nextRefreshAt=quotaExhausted?cacheTime+quotaCooldownMs:0;
   return cache;
  }).finally(()=>{pending=null});
  return pending;
 };
}
