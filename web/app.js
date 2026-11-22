const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
function addLink(parent,url,text){if(typeof url!=='string'||!/^https:\/\/github\.com\//.test(url))return;const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
async function load(){
 $('status').textContent='Đang truy vấn GitHub…';$('refresh').disabled=true;
 try{
  const r=await fetch('/api/repos',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
  const data=await r.json();const repos=data.repos||[];
  $('repos-count').textContent=repos.length;
  $('prs-count').textContent=repos.reduce((n,r)=>n+(r.openPullRequests||0),0);
  $('ci-count').textContent=repos.filter(r=>r.latestRun?.conclusion==='success').length;
  $('errors-count').textContent=repos.filter(r=>r.error).length;
  $('repos').replaceChildren();
  for(const repo of repos){
   const card=el('article',undefined,'repo'),title=el('h3',repo.name);
   card.append(title);
   if(repo.error){card.append(el('p','Không đọc được: '+repo.error,'warning'));}
   else{
    card.append(el('p','PR đang mở: '+repo.openPullRequests+' · Nhánh: '+repo.defaultBranch));
    const ci=repo.latestRun;card.append(el('p',ci?'CI gần nhất: '+ci.status+' / '+(ci.conclusion||'chưa kết luận'):'Chưa có lần chạy CI được trả về'));
    if(ci)addLink(card,ci.url,'Xem GitHub Actions');
    for(const pr of repo.prs||[])addLink(card,pr.url,'PR #'+pr.number+(pr.draft?' (Draft)':'')+': '+pr.title);
   }
   $('repos').append(card);
  }
  $('status').textContent='Nguồn GitHub API · cập nhật lúc '+new Date(data.updatedAt).toLocaleString('vi-VN')+'. Dữ liệu có thể trễ tối đa 60 giây.';
 }catch(e){$('status').textContent='Không tải được dữ liệu: '+e.message;}
 finally{$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',load);load();
