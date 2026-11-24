const SLUG=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
/** Opens a DRAFT pull request. Never merges. The token goes only into the Authorization header. */
export async function createDraftPr({fetchImpl=fetch,slug,token,head,base,title,body}){
 if(!SLUG.test(slug))throw new Error('Repository phải có dạng owner/name');
 if(typeof token!=='string'||token.length<20)throw new Error('Thiếu token GitHub');
 const r=await fetchImpl('https://api.github.com/repos/'+slug+'/pulls',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'HAK-Control-Center',Authorization:'Bearer '+token},
  body:JSON.stringify({title:String(title).slice(0,120),head,base,draft:true,body})});
 if(!r.ok)throw new Error('GitHub HTTP '+r.status);
 const j=await r.json();
 if(!Number.isSafeInteger(j.number)||typeof j.html_url!=='string')throw new Error('Phản hồi PR không hợp lệ');
 return {number:j.number,url:j.html_url,draft:true};
}
