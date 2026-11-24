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
   const skills=(job.steps||[]).flatMap(s=>(s.appliedSkills||[]).map(k=>k.name));
   const uniqueSkills=[...new Set(skills)];
   const meta=[
    'Trạng thái: '+job.status,
    'ID: '+job.id,
    job.targetRepo?'Repo: '+job.targetRepo:null,
    uniqueSkills.length?'Skills: '+uniqueSkills.join(', '):null
   ].filter(Boolean).join(' · ');
   card.append(el('h3',job.title),el('p',meta));
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
async function loadAllowedRepos(){
 try{
  const r=await fetch('/api/repos/allowed',{cache:'no-store'});
  if(!r.ok)return;
  const data=await r.json();
  const list=$('allowed-repos-list');
  if(!list)return;
  for(const repo of data.repositories||[]){
   const opt=document.createElement('option');
   opt.value=repo.fullName;
   list.append(opt);
  }
 }catch{}
}
$('find-skills-btn').addEventListener('click',async()=>{
 const q=($('job-title').value+' '+$('job-description').value).trim();
 const role=$('job-role').value;
 $('skill-suggestions').replaceChildren(el('p','Đang tìm skill phù hợp…'));
 try{
  const r=await fetch('/api/skills/find?q='+encodeURIComponent(q)+'&role='+encodeURIComponent(role),{cache:'no-store'});
  if(!r.ok)throw Error('Skill API unavailable');
  const data=await r.json();
  $('skill-suggestions').replaceChildren();
  if(!(data.skills||[]).length){$('skill-suggestions').append(el('p','Không tìm thấy skill phù hợp'));return;}
  for(const s of data.skills){
   const card=el('article',undefined,'repo');
   card.append(el('h3',s.name),el('p',s.source));
   const btn=el('button','Chọn skill');btn.type='button';
   btn.addEventListener('click',()=>{
    const cur=$('job-skills').value.split(',').map(x=>x.trim()).filter(Boolean);
    if(!cur.includes(s.name)){cur.push(s.name);$('job-skills').value=cur.join(', ');}
   });
   card.append(btn);
   $('skill-suggestions').append(card);
  }
 }catch(e){$('skill-suggestions').replaceChildren(el('p',e.message,'warning'));}
});
$('agent-job-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=$('agent-job-form').querySelector('button[type=submit]');
 button.disabled=true;$('job-message').textContent='Đang gửi công việc…';
 try{
  const skills=$('job-skills').value.split(',').map(x=>x.trim()).filter(Boolean);
  const targetRepo=$('job-target-repo').value||undefined;
  const commitSha=$('job-commit-sha').value.trim()||undefined;
  const runIdRaw=Number($('job-run-id').value);
  const runId=Number.isSafeInteger(runIdRaw)&&runIdRaw>0?runIdRaw:undefined;
  const paths=$('job-paths').value.split(',').map(x=>x.trim()).filter(Boolean);
  const workflowMode=$('job-fix-verify')?.checked?'fix-and-verify':'single';
  const r=await fetch('/api/operator/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-HAK-Operator-Token':operatorToken},body:JSON.stringify({title:$('job-title').value,description:$('job-description').value,role:$('job-role').value,targetRepo,commitSha,runId,paths,skills,workflowMode,confirm:$('job-confirm').checked})});
  const result=await r.json();
  if(!r.ok)throw Error(result.error||'Request failed');
  $('job-message').textContent='Đã nhận công việc '+result.id+'. Nhấn Cập nhật công việc để xem kết quả.';
  await refreshJobs();
 }catch(error){$('job-message').textContent=error.message}
 finally{button.disabled=false;}
});
$('github-pr-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=$('github-pr-form').querySelector('button[type=submit]');
 button.disabled=true;$('pr-message').textContent='Đang tạo Draft PR trên GitHub…';
 try{
  const repository=$('job-target-repo').value||'HAK_AI_AGENT_CONTROL_CENTER';
  const baseSha=$('job-commit-sha').value.trim();
  const runId=Number($('job-run-id').value);
  const r=await fetch('/api/github/create-pr',{method:'POST',headers:{'Content-Type':'application/json','X-HAK-Operator-Token':operatorToken},body:JSON.stringify({repository,baseSha,runId:Number.isSafeInteger(runId)&&runId>0?runId:undefined,branch:$('pr-branch').value.trim(),outputText:$('pr-output').value,rationale:$('job-title').value.trim()||undefined,confirm:$('pr-confirm').checked})});
  const result=await r.json();
  if(!r.ok)throw Error(result.error||'Create PR failed');
  $('pr-message').replaceChildren(el('span','Đã tạo Draft PR #'+result.prNumber+': '),(() => {const a=el('a',result.prUrl);addLink($('pr-message'),result.prUrl,result.prUrl);return '';})());
  $('pr-message').textContent='Đã tạo Draft PR #'+result.prNumber+': ';
  addLink($('pr-message'),result.prUrl,result.prUrl);
 }catch(error){$('pr-message').textContent=error.message;}
 finally{button.disabled=false;}
});
$('refresh-jobs').addEventListener('click',refreshJobs);
operatorSession();refreshJobs();loadAllowedRepos();
