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
    card.append(el('p','PR đang mở: '+(repo.openPullRequestsCountIsLowerBound?'≥ ':'')+repo.openPullRequests+' · Nhánh: '+repo.defaultBranch));
    const ci=repo.latestRun;card.append(el('p',ci?'CI gần nhất: '+ci.status+' / '+(ci.conclusion||'chưa kết luận'):'Chưa có lần chạy CI được trả về'));
    if(ci)addLink(card,ci.url,'Xem GitHub Actions');
    for(const pr of repo.prs||[])addLink(card,pr.url,'PR #'+pr.number+(pr.draft?' (Draft)':'')+': '+pr.title);
   }
   $('repos').append(card);
  }
  $('status').textContent='Nguồn GitHub API · cập nhật lúc '+new Date(data.updatedAt).toLocaleString('vi-VN')+'. Dữ liệu có thể trễ tối đa 60 giây.';
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
