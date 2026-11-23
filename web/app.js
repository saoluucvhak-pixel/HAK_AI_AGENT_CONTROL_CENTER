const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
function addLink(parent,url,text){if(typeof url!=='string'||!/^https:\/\/github\.com\//.test(url))return;const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
async function load(){
 $('status').textContent='Đang truy vấn GitHub…';$('refresh').disabled=true;
 try{
  const r=await fetch('/api/repos',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
  const data=await r.json();const repos=data.repos||[];
  $('repos-count').textContent=repos.length;
  $('prs-count').textContent=(repos.some(r=>r.openPullRequestsCountIsLowerBound)?'≥ ':'')+repos.reduce((n,r)=>n+(r.openPullRequests||0),0);
  $('ci-count').textContent=repos.filter(r=>r.latestRun?.conclusion==='success').length;
  $('errors-count').textContent=repos.filter(r=>r.error).length;
  $('repos').replaceChildren();
  for(const repo of repos){
   const card=el('article',undefined,'repo'),title=el('h3',repo.name);
   card.append(title);
   if(repo.error){card.append(el('p','Không đọc được: '+repo.error,'warning'));}
   else{
    if(repo.stale)card.append(el('p','Dữ liệu lưu trước đó; cập nhật GitHub thất bại: '+(repo.refreshError||'không xác định'),'warning'));
    card.append(el('p','PR đang mở: '+(repo.openPullRequestsCountIsLowerBound?'≥ ':'')+repo.openPullRequests+' · Nhánh: '+repo.defaultBranch));
    const ci=repo.latestRun;card.append(el('p',ci?'CI gần nhất: '+ci.status+' / '+(ci.conclusion||'chưa kết luận'):'Chưa có lần chạy CI được trả về'));
    if(ci)addLink(card,ci.url,'Xem GitHub Actions');
    for(const pr of repo.prs||[])addLink(card,pr.url,'PR #'+pr.number+(pr.draft?' (Draft)':'')+': '+pr.title);
   }
   $('repos').append(card);
  }
  $('status').textContent='Nguồn GitHub API · cập nhật lúc '+new Date(data.updatedAt).toLocaleString('vi-VN')+'. Dữ liệu được lưu tối đa 5 phút giữa các lần truy vấn; khi GitHub lỗi có thể hiển thị dữ liệu cũ kèm cảnh báo.';
  await loadTopology();
 }catch(e){$('status').textContent='Không tải được dữ liệu: '+e.message;}
 finally{$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',load);load();

async function loadAgents(){
 $('agent-status').textContent='Đang đọc Observer…';
 try{
  const r=await fetch('/api/agent-status',{cache:'no-store'});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const data=await r.json();
  $('agents').replaceChildren();
  for(const task of data.tasks||[]){
   const card=el('article',undefined,'repo');
   card.append(el('h3',task.taskId),el('p','Agent: '+task.agentId+' · Trạng thái: '+task.status+' · '+task.at));
   $('agents').append(card);
  }
  $('agent-status').textContent=(data.tasks||[]).length+' tác vụ · '+data.source+' · '+(data.persistent?'đã lưu bền vững':'chỉ lưu trong bộ nhớ');
 }catch(e){$('agent-status').textContent='Không thể đọc Observer: '+e.message;}
}
$('load-agents').addEventListener('click',loadAgents);
loadAgents();

async function loadTopology(){
 try{
  const r=await fetch('/api/topology');if(!r.ok)throw new Error('HTTP '+r.status);
  const graph=await r.json();$('topology').replaceChildren();
  for(const node of graph.nodes){
   const card=el('article',undefined,'repo');card.append(el('h3',node.label),el('p','Nguồn: '+node.github+' · '+node.status));
   addLink(card,node.sourceUrl,'Xem repository');$('topology').append(card);
  }
 }catch(e){$('topology').textContent='Không tải được sơ đồ: '+e.message;}
}
// Topology refreshes after GitHub repository data loads.

async function loadAcceptance(){
 try{
  const r=await fetch('/api/acceptance');if(!r.ok)throw new Error('HTTP '+r.status);
  const report=await r.json();$('acceptance').replaceChildren();
  for(const check of report.checks){
   const card=el('article',undefined,'repo');card.append(el('h3',check.label),el('p',check.status+(check.evidence?' · '+check.evidence:'')));
   $('acceptance').append(card);
  }
 }catch(e){$('acceptance').textContent='Không tải được nghiệm thu: '+e.message;}
}
loadAcceptance();

async function checkTools(){
 $('check-tools').disabled=true;
 $('diagnostics-status').textContent='Đang kiểm tra kết nối cục bộ…';
 try{
  const r=await fetch('/api/diagnostics',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
  const report=await r.json();$('diagnostics').replaceChildren();
  const labels={'omniroute':'OmniRoute','ruflo':'Ruflo','claude-mem':'Claude-Mem','archify':'Archify','ocr':'HAK OCR'};
  const statuses={'not-configured':'Chưa cấu hình','endpoint-reachable':'Kết nối HTTP được (chưa xác minh chức năng)','http-error':'Dịch vụ trả lỗi HTTP','unreachable-or-invalid':'Không kết nối được hoặc URL không hợp lệ'};
  for(const check of report.checks||[]){
   const card=el('article',undefined,'repo');
   card.append(el('h3',labels[check.id]||check.id),el('p',(statuses[check.status]||check.status)+(check.httpStatus?' · HTTP '+check.httpStatus:'')));
   $('diagnostics').append(card);
  }
  $('diagnostics-status').textContent='Đã kiểm tra '+(report.checks||[]).length+' công cụ lúc '+new Date(report.checkedAt).toLocaleString('vi-VN')+'. Chưa chứng nhận vận hành chính thức.';
 }catch(e){$('diagnostics-status').textContent='Không thể kiểm tra: '+e.message;}
 finally{$('check-tools').disabled=false;}
}
$('check-tools').addEventListener('click',checkTools);

let operatorToken='';
async function operatorSession(){
 try{
  const r=await fetch('/api/operator/session',{cache:'no-store'});
  if(!r.ok)throw Error('Session unavailable');
  const data=await r.json();operatorToken=data.token;
  $('job-message').textContent=data.enabled?'AI đã bật. Có thể giao việc không nhạy cảm.':'Chưa bật AI. Cần cấu hình OmniRoute và HAK_AGENT_EXECUTION_ENABLED=true trên máy.';
 }catch{$('job-message').textContent='Không kết nối được phiên điều hành cục bộ';}
}
async function refreshJobs(){
 try{
  const r=await fetch('/api/operator/jobs',{cache:'no-store'});
  if(!r.ok)throw Error('Job API unavailable');
  const data=await r.json();$('operator-jobs').replaceChildren();
  for(const job of data.jobs){
   const card=el('article',undefined,'repo');
   card.append(el('h3',job.title),el('p','Trạng thái: '+job.status+' · ID: '+job.id));
   if(job.error)card.append(el('p',job.error,'warning'));
   if(job.status==='completed'){
    const view=el('button','Xem kết quả AI');
    view.type='button';
    const output=el('pre','');
    output.hidden=true;
    output.style.whiteSpace='pre-wrap';output.style.overflowWrap='anywhere';
    view.addEventListener('click',async()=>{
     try{
      const r=await fetch('/api/operator/results/'+encodeURIComponent(job.id),{headers:{'X-HAK-Operator-Token':operatorToken}});
      if(!r.ok)throw Error('Không đọc được kết quả');
      const data=await r.json();output.textContent=data.content;output.hidden=false;
     }catch(e){output.textContent=e.message;output.hidden=false;}
    });
    card.append(view,output);
   }
   $('operator-jobs').append(card);
  }
 }catch{$('job-message').textContent='Không tải được công việc';}
}
$('agent-job-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=$('agent-job-form').querySelector('button[type=submit]');
 button.disabled=true;$('job-message').textContent='Đang gửi công việc…';
 try{
  const r=await fetch('/api/operator/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-HAK-Operator-Token':operatorToken},body:JSON.stringify({title:$('job-title').value,description:$('job-description').value,role:$('job-role').value,confirm:$('job-confirm').checked})});
  const result=await r.json();
  if(!r.ok)throw Error(result.error||'Request failed');
  $('job-message').textContent='Đã nhận công việc '+result.id+'. Nhấn Cập nhật công việc để xem kết quả.';
  await refreshJobs();
 }catch(error){$('job-message').textContent=error.message}
 finally{button.disabled=false;}
});
$('refresh-jobs').addEventListener('click',refreshJobs);
operatorSession();refreshJobs();
