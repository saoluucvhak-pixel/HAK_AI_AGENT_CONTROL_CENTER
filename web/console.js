// AI Provider Manager + multi-agent Work Orders. DOM is built with textContent only (no innerHTML).
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const STATUS_VI={DRAFT:'Nháp',PLANNED:'Đã lập kế hoạch',AWAITING_APPROVAL:'Chờ phê duyệt',QUEUED:'Trong hàng đợi',RUNNING:'Đang chạy',REVIEWING:'Đang rà soát',TESTING:'Đang kiểm thử',COMPLETED:'Hoàn thành',FAILED:'Thất bại',BLOCKED:'Bị chặn',CANCELLED:'Đã hủy',PAUSED:'Tạm dừng',INTERRUPTED:'Bị gián đoạn',RETRY_PENDING:'Chờ thử lại',PENDING:'Chưa chạy'};
const ACTIVE=new Set(['QUEUED','RUNNING','REVIEWING','TESTING']);
let token='',meta={types:[],agents:[],connections:[],agentModels:{}};
const DEFAULT_ENDPOINT={'openai-compatible':'http://127.0.0.1:20128','anthropic':'https://api.anthropic.com','gemini':'https://generativelanguage.googleapis.com'};

async function session(){const r=await fetch('/api/operator/session',{cache:'no-store'});if(!r.ok)throw Error('Không lấy được phiên điều hành cục bộ');token=(await r.json()).token;}
async function api(path,method='GET',body){
 const r=await fetch('/api/v2'+path,{method,headers:{'X-HAK-Operator-Token':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await r.json().catch(()=>({}));
 if(!r.ok){const e=new Error(data.error||'Lỗi '+r.status);e.info=data;throw e;}
 return data;
}
function explain(e){const i=e.info||{};return e.message+(i.step?' (bước: '+i.step+')':'')+(i.action?' — '+i.action:'')+(i.retryable?' Có thể thử lại.':'');}
function say(id,text,bad){const n=$(id);n.textContent=text;n.className=bad?'err':'';}

// ---------- overview
async function loadOverview(){
 try{
  const o=await api('/overview');const box=$('overview');box.replaceChildren();
  const cost=o.usage.costUsd===null?'không xác định':'$'+o.usage.costUsd.toFixed(4);
  const items=[[o.orchestration.activeAgents,'Agent đang hoạt động'],[o.orchestration.agentsWaiting,'Agent đang chờ'],[o.orchestration.running,'Work Order đang chạy'],[o.orchestration.failed,'Work Order lỗi'],[o.orchestration.completed,'Work Order hoàn thành'],[o.orchestration.awaitingApproval,'Chờ phê duyệt'],[o.providers.enabled+'/'+o.providers.total,'Kết nối AI bật/tổng'],[o.usage.inputTokens+o.usage.outputTokens,'Token đã dùng'],[cost,'Chi phí (chỉ khi có đơn giá)']];
  for(const [v,l] of items){const a=el('article');a.append(el('strong',v),el('span',l));box.append(a);}
 }catch(e){say('overview-note','Không tải được tổng quan: '+explain(e),true);}
}

// ---------- providers
function fillAgentSelects(){
 const a=$('am-agent');a.replaceChildren();for(const x of meta.agents)a.append(new Option(x.label,x.id));
 const c=$('am-conn');c.replaceChildren(new Option('(dùng kết nối mặc định)',''));for(const x of meta.connections)c.append(new Option(x.name,x.id));
}
function resetProviderForm(){
 $('provider-form').reset();$('p-id').value='';$('p-endpoint').value=DEFAULT_ENDPOINT[$('p-type').value];$('p-type').disabled=false;
}
function editProvider(c){
 $('p-id').value=c.id;$('p-type').value=c.type;$('p-type').disabled=true;$('p-name').value=c.name;$('p-endpoint').value=c.endpoint;$('p-model').value=c.model;$('p-key').value='';
 $('p-timeout').value=c.timeoutMs;$('p-maxtokens').value=c.maxTokens;$('p-retries').value=c.retries;$('p-conc').value=c.maxConcurrency;
 $('p-cost').value=c.costLimitUsd??'';$('p-pin').value=c.priceInputPerMTok??'';$('p-pout').value=c.priceOutputPerMTok??'';
 $('provider-form').scrollIntoView({block:'nearest'});
}
async function loadProviders(){
 try{
  meta=await api('/providers');
  const box=$('providers');box.replaceChildren();
  if(!meta.connections.length)box.append(el('p','Chưa có kết nối AI. Thêm kết nối ở phía trên để bắt đầu.','warning'));
  for(const c of meta.connections){
   const card=el('article',undefined,'repo');
   card.append(el('h3',c.name+' · '+c.type),el('p',c.endpoint+' · model: '+(c.model||'(chưa chọn)')),
    el('p','Trạng thái: '+(c.enabled?'đang bật':'đã tắt')+' · API key: '+(c.hasSecret?'đã lưu (ẩn)':'chưa có')),
    el('p','Đã dùng: '+c.usage.inputTokens+' vào / '+c.usage.outputTokens+' ra token · '+c.usage.requests+' lần gọi · chi phí '+(c.usage.costUsd===null?'không xác định (chưa có đơn giá)':'$'+c.usage.costUsd.toFixed(4))));
   const msg=el('p','','');const row=el('div',undefined,'row');
   const btn=(t,fn,cls)=>{const b=el('button',t,cls);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn(msg);}catch(e){msg.textContent=explain(e);msg.className='err';}finally{b.disabled=false;}});row.append(b);};
   btn('Kiểm tra kết nối',async m=>{m.textContent='Đang kiểm tra…';const h=await api('/providers/'+c.id+'/test','POST');
    m.textContent=h.ok?'Kết nối được ('+h.latencyMs+' ms, '+h.modelCount+' model). Danh tính model do nhà cung cấp tự khai báo, chưa xác minh độc lập.':'Không đạt: '+((h.errors||[]).join('; ')||(h.error&&h.error.message)||'lỗi không xác định');m.className=h.ok?'ok':'err';});
   btn('Lấy danh sách model',async m=>{const r=await api('/providers/'+c.id+'/models');m.textContent=r.models.slice(0,30).join(', ')||'Không có model nào được trả về';m.className='';},'secondary');
   btn(c.enabled?'Tắt':'Bật',async()=>{await api('/providers/'+c.id+'/enabled','POST',{enabled:!c.enabled});await loadProviders();await loadOverview();},'secondary');
   btn('Sửa',async()=>editProvider(c),'secondary');
   btn('Xóa',async()=>{if(confirm('Xóa kết nối "'+c.name+'" và API key đã lưu?')){await api('/providers/'+c.id,'DELETE');await loadProviders();await loadOverview();}},'danger');
   card.append(row,msg);box.append(card);
  }
  fillAgentSelects();
  const am=$('agent-models');am.replaceChildren();
  for(const [agent,m] of Object.entries(meta.agentModels)){const conn=meta.connections.find(c=>c.id===m.connectionId);const a=el('article');a.append(el('h3',(meta.agents.find(x=>x.id===agent)||{label:agent}).label),el('p',(conn?conn.name:'?')+' · '+(m.model||'model mặc định')));am.append(a);}
  renderAgentChoices();
 }catch(e){say('provider-message','Không tải được cấu hình AI: '+explain(e),true);}
}
$('p-type').addEventListener('change',()=>{if(!$('p-id').value)$('p-endpoint').value=DEFAULT_ENDPOINT[$('p-type').value];});
$('p-reset').addEventListener('click',resetProviderForm);
$('provider-form').addEventListener('submit',async ev=>{
 ev.preventDefault();
 const num=id=>$(id).value===''?undefined:Number($(id).value);
 const body={type:$('p-type').value,name:$('p-name').value,endpoint:$('p-endpoint').value,model:$('p-model').value,timeoutMs:num('p-timeout'),maxTokens:num('p-maxtokens'),retries:num('p-retries'),maxConcurrency:num('p-conc'),costLimitUsd:$('p-cost').value===''?null:Number($('p-cost').value),priceInputPerMTok:$('p-pin').value===''?null:Number($('p-pin').value),priceOutputPerMTok:$('p-pout').value===''?null:Number($('p-pout').value)};
 if($('p-key').value)body.apiKey=$('p-key').value;
 try{
  const id=$('p-id').value;
  if(id){delete body.type;await api('/providers/'+id,'PUT',body);}else await api('/providers','POST',body);
  $('p-key').value='';say('provider-message','Đã lưu kết nối. API key được lưu trong kho bí mật và không hiển thị lại.');
  resetProviderForm();await loadProviders();await loadOverview();
 }catch(e){say('provider-message','Không lưu được: '+explain(e),true);}
});
$('agent-model-form').addEventListener('submit',async ev=>{
 ev.preventDefault();
 try{await api('/agent-models','PUT',{agent:$('am-agent').value,connectionId:$('am-conn').value||null,model:$('am-model').value});say('provider-message','Đã lưu model cho Agent.');await loadProviders();}
 catch(e){say('provider-message','Không lưu được: '+explain(e),true);}
});

// ---------- work orders
const DEFAULT_AGENTS=new Set(['architecture','backend','frontend','security','testing']);
function renderAgentChoices(){
 const box=$('wo-agents');if(box.childElementCount)return;
 for(const a of meta.agents){const l=el('label');const i=document.createElement('input');i.type='checkbox';i.value=a.id;i.checked=DEFAULT_AGENTS.has(a.id);l.append(i,document.createTextNode(' '+a.label));box.append(l);}
}
$('wo-form').addEventListener('submit',async ev=>{
 ev.preventDefault();
 const agents=[...$('wo-agents').querySelectorAll('input:checked')].map(i=>i.value);
 const body={title:$('wo-title').value,description:$('wo-desc').value,agents,repository:$('wo-repo').value||undefined,concurrency:Number($('wo-conc').value),budget:{maxTokens:Number($('wo-tokens').value),maxCostUsd:$('wo-cost').value===''?null:Number($('wo-cost').value)}};
 try{const o=await api('/work-orders','POST',body);say('wo-message','Đã tạo kế hoạch '+o.tasks.length+' công việc. Xem kế hoạch rồi phê duyệt để chạy.');$('wo-form').reset();await loadOrders();}
 catch(e){say('wo-message','Không tạo được kế hoạch: '+explain(e),true);}
});
async function loadOrders(){
 try{
  const {workOrders}=await api('/work-orders');const box=$('work-orders');box.replaceChildren();
  if(!workOrders.length)box.append(el('p','Chưa có Work Order nào.'));
  for(const w of workOrders)box.append(await orderCard(w.id));
  return workOrders.some(w=>ACTIVE.has(w.status));
 }catch(e){say('wo-message','Không tải được Work Order: '+explain(e),true);return false;}
}
async function orderCard(id){
 const o=await api('/work-orders/'+id);
 const card=el('article',undefined,'repo');
 const head=el('h3',o.title+' ');head.append(el('span',STATUS_VI[o.status]||o.status,'badge'));card.append(head);
 card.append(el('p','ID '+o.id+' · Dự án '+o.projectId+(o.repository?' · '+o.repository:'')+' · token '+(o.usage.inputTokens+o.usage.outputTokens)+'/'+o.budget.maxTokens+' · chi phí '+(o.usage.costKnown?'$'+o.usage.costUsd.toFixed(4):'không xác định')));
 const tasks=el('div',undefined,'tasks');
 for(const t of o.tasks){
  const row=el('div',undefined,'task'+(['FAILED','BLOCKED'].includes(t.status)?' bad':''));
  row.append(el('strong',t.title),document.createTextNode(' · '+(STATUS_VI[t.status]||t.status)+' · giai đoạn '+t.phase+(t.dependsOn.length?' · phụ thuộc: '+t.dependsOn.join(', '):'')+(t.attempts?' · lần chạy '+t.attempts:'')));
  if(t.error)row.append(el('div',t.error.message,'err'));
  if(t.status==='COMPLETED'){const b=el('button','Xem kết quả','secondary');b.type='button';const out=el('pre','','out');out.hidden=true;b.addEventListener('click',async()=>{try{out.textContent=(await api('/work-orders/'+o.id+'/output/'+t.id)).content;}catch(e){out.textContent=explain(e);}out.hidden=!out.hidden;});row.append(document.createTextNode(' '),b,out);}
  tasks.append(row);
 }
 card.append(tasks);
 const row=el('div',undefined,'row');const msg=el('p','');
 const btn=(t,fn,cls)=>{const b=el('button',t,cls);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();await loadOrders();await loadOverview();}catch(e){msg.textContent=explain(e);msg.className='err';if(e.info&&e.info.code==='CONFIRM_RERUN'&&confirm(e.message)){try{await api('/work-orders/'+o.id+'/start','POST',{rerunInterrupted:true});await loadOrders();}catch(e2){msg.textContent=explain(e2);}}}finally{b.disabled=false;}});row.append(b);};
 if(o.status==='AWAITING_APPROVAL'){
  btn('Phê duyệt phạm vi (hiệu lực 24 giờ)',async()=>{if(!confirm('Phê duyệt gửi nội dung của Work Order này tới nhà cung cấp AI đã cấu hình? Nội dung không được chứa dữ liệu nhạy cảm.'))return;await api('/work-orders/'+o.id+'/approve','POST',{reason:'Phê duyệt từ giao diện',ttlMinutes:1440});});
  btn('Bắt đầu',async()=>{await api('/work-orders/'+o.id+'/start','POST',{});});
 }
 if(['PAUSED','INTERRUPTED','BLOCKED','FAILED','RETRY_PENDING'].includes(o.status))btn('Tiếp tục / thử lại phần chưa xong',async()=>{await api('/work-orders/'+o.id+'/start','POST',{});});
 if(ACTIVE.has(o.status)&&o.status!=='QUEUED')btn('Tạm dừng',async()=>{await api('/work-orders/'+o.id+'/pause','POST',{});},'secondary');
 if(!['COMPLETED','CANCELLED'].includes(o.status))btn('Hủy',async()=>{if(confirm('Hủy Work Order này?'))await api('/work-orders/'+o.id+'/cancel','POST',{});},'danger');
 if(o.result){const b=el('button','Xem báo cáo tổng hợp');b.type='button';const out=el('pre','','out');out.hidden=true;b.addEventListener('click',async()=>{try{out.textContent=(await api('/work-orders/'+o.id+'/aggregate')).content;}catch(e){out.textContent=explain(e);}out.hidden=!out.hidden;});row.append(b);card.append(row,out,msg);return card;}
 card.append(row,msg);
 const log=el('details');log.append(el('summary','Nhật ký trạng thái ('+o.transitions.length+')'));
 for(const t of o.transitions.slice(-12))log.append(el('p',new Date(t.at).toLocaleString('vi-VN')+' · '+t.actor+' · '+t.from+' → '+t.to+' · '+t.reason));
 card.append(log);return card;
}
$('wo-refresh').addEventListener('click',()=>{loadOrders();loadOverview();});
let timer=null;
async function tick(){const active=await loadOrders();await loadOverview();clearTimeout(timer);timer=setTimeout(tick,active?2000:15000);}
(async()=>{try{await session();resetProviderForm();await loadProviders();await tick();}catch(e){say('provider-message',e.message+'. Tải lại trang.',true);}})();
