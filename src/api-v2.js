import {sendJson,readJsonBody,tokenMatches,originAllowed,createRateLimiter} from './http-guard.js';
import {PROVIDER_TYPES} from './providers.js';
import {AGENT_ROLES} from './provider-manager.js';
import {AGENT_LABELS} from './planner.js';
import {createBackup,listBackups} from './data-backup.js';

const HINTS={
 AUTH:'Kiểm tra lại API key trong AI Provider Manager rồi thử lại.',CONFIG:'Mở AI Provider Manager, thêm hoặc bật một kết nối AI hợp lệ.',
 NETWORK:'Kiểm tra mạng hoặc dịch vụ gateway rồi thử lại.',TIMEOUT:'Tăng timeout hoặc thử lại sau.',RATE_LIMIT:'Chờ một lúc rồi thử lại.',UPSTREAM:'Nhà cung cấp đang lỗi; thử lại sau.',
 BUDGET:'Tăng giới hạn token/chi phí hoặc bắt đầu Work Order mới.',NOT_APPROVED:'Phê duyệt lại Work Order (phê duyệt hết hạn hoặc phạm vi đã đổi).',CONFIRM_RERUN:'Xác nhận chạy lại công việc bị gián đoạn nếu chấp nhận chi phí có thể lặp.',
 CONSENT:'Tích xác nhận chạy mã do AI viết trên máy này.',BASE_MOVED:'Tạo thay đổi mã mới từ nhánh gốc hiện tại rồi phê duyệt lại.',NO_GIT:'Cài Git for Windows (git phải có trong PATH) rồi thử lại.',NO_NPM:'Dùng lệnh kiểm thử node-test.',PUSH:'Kiểm tra quyền ghi remote / token GitHub rồi thử xuất bản lại.',BAD_EDITS:'AI đề xuất chỉnh sửa không hợp lệ; thử lại hoặc thu hẹp phạm vi.',PATH:'Đường dẫn nằm ngoài phạm vi được phê duyệt.',NOT_REPO:'Chọn đúng thư mục gốc của một repository git.',BAD_STATE:'Làm mới danh sách và kiểm tra trạng thái hiện tại.',NOT_FOUND:'Đối tượng không còn tồn tại; làm mới danh sách.',ALREADY_RUNNING:'Work Order đang chạy; chờ hoặc hủy.',INTEGRITY:'Dữ liệu trên đĩa bị thay đổi; khôi phục từ bản sao lưu.'
};
const RETRYABLE=new Set(['NETWORK','TIMEOUT','RATE_LIMIT','UPSTREAM']);
export function describeError(error,step){
 const code=error?.code||'INVALID';
 const known=error&&(error.name==='ProviderError'||['OrchestratorError','CodeChangeError','WorkspaceError'].includes(error.constructor?.name)||['TOO_LARGE','BAD_JSON','INVALID'].includes(code));
 const message=known||code==='INVALID'?String(error?.message||'Yêu cầu không hợp lệ').slice(0,400):'Lỗi nội bộ';
 return {error:message,code,step,action:HINTS[code]||(code==='INVALID'?'Kiểm tra dữ liệu nhập và thử lại.':'Xem log cục bộ rồi thử lại.'),retryable:RETRYABLE.has(code)};
}
function statusFor(code){return {CONSENT:400,INVALID:400,BASE_MOVED:409,NO_GIT:424,NO_NPM:424,NOT_REPO:400,PATH:400,BAD_EDITS:400,PUSH:502,NOT_FOUND:404,NOT_APPROVED:409,BAD_STATE:409,BAD_TRANSITION:409,ALREADY_RUNNING:409,CONFIRM_RERUN:409,TOO_LARGE:413,BAD_JSON:400,CONFIG:400,INVALID:400,AUTH:502,NETWORK:502,TIMEOUT:504,RATE_LIMIT:429,UPSTREAM:502}[code]||500;}

export function createApiV2({getPort,token,providers,orchestrator,codeChanges=null,reviews=null,secrets=null,dataDir=null,onShutdown=null}){
 const allow=createRateLimiter();
 return async function handle(req,res,path){
  if(!path.startsWith('/api/v2/'))return false;
  if(!tokenMatches(req,token)){sendJson(res,403,{error:'Cần phiên điều hành cục bộ hợp lệ',code:'FORBIDDEN',action:'Tải lại trang để lấy phiên mới.'});return true;}
  const mutating=req.method!=='GET';
  if(mutating&&!originAllowed(req,getPort())){sendJson(res,403,{error:'Origin không hợp lệ',code:'FORBIDDEN',action:'Thao tác chỉ được phép từ giao diện HAK.'});return true;}
  if(mutating&&!allow()){sendJson(res,429,{error:'Quá nhiều thao tác trong thời gian ngắn',code:'RATE_LIMIT',retryable:true,action:'Chờ một phút rồi thử lại.'});return true;}
  const parts=path.slice('/api/v2/'.length).split('/').filter(Boolean);
  let step='parse';
  try{
   const body=mutating&&req.method!=='DELETE'?await readJsonBody(req):{};
   const send=(data,status=200)=>sendJson(res,status,data);
   const [a,b,c,d]=parts;
   step='route';
   if(a==='overview'&&req.method==='GET'){
    send({orchestration:orchestrator.overview(),providers:providers.connectionCounts(),usage:providers.usageTotals(),
     notes:{sampleData:false,cost:'Chi phí chỉ hiển thị khi kết nối AI có đơn giá token; ngược lại là null (không xác định).',github:'PR/CI xem ở phần Repository và CI.'}});return true;
   }
   if(a==='providers'){
    if(!b&&req.method==='GET'){send({types:PROVIDER_TYPES,agents:AGENT_ROLES.map(id=>({id,label:AGENT_LABELS[id]})),connections:await providers.list(),agentModels:providers.agentModels()});return true;}
    if(!b&&req.method==='POST'){step='save-provider';const {apiKey,...rest}=body;send(await providers.upsert(rest,apiKey),201);return true;}
    if(b&&!c&&req.method==='PUT'){step='save-provider';const {apiKey,...rest}=body;send(await providers.upsert({...rest,id:b},apiKey));return true;}
    if(b&&!c&&req.method==='DELETE'){step='delete-provider';await providers.remove(b);send({ok:true});return true;}
    if(b&&c==='test'&&req.method==='POST'){step='health-check';send(await providers.test(b));return true;}
    if(b&&c==='models'&&req.method==='GET'){step='list-models';send({models:await providers.listModels(b)});return true;}
    if(b&&c==='enabled'&&req.method==='POST'){step='toggle-provider';send(await providers.setEnabled(b,body.enabled===true));return true;}
   }
   if(a==='agent-models'&&req.method==='PUT'){step='save-agent-model';await providers.setAgentModel(body.agent,body.connectionId||null,body.model);send({agentModels:providers.agentModels()});return true;}
   if(a==='work-orders'){
    if(!b&&req.method==='GET'){send({workOrders:orchestrator.list()});return true;}
    if(!b&&req.method==='POST'){step='create-work-order';try{send(await orchestrator.create(body),201);}catch(e){if(!e.code)e.code='INVALID';throw e;}return true;}
    if(b&&!c&&req.method==='GET'){send(orchestrator.get(b));return true;}
    if(b&&!c&&req.method==='PUT'){step='update-work-order';try{send(await orchestrator.update(b,body));}catch(e){if(!e.code)e.code='INVALID';throw e;}return true;}
    if(b&&c==='approve'&&req.method==='POST'){step='approve';const ttl=Number(body.ttlMinutes);send(await orchestrator.approve(b,{approver:'local-operator',reason:body.reason,ttlMs:Number.isFinite(ttl)&&ttl>0?ttl*60000:undefined}));return true;}
    if(b&&c==='start'&&req.method==='POST'){step='start';send(await orchestrator.start(b,'local-operator',{rerunInterrupted:body.rerunInterrupted===true}),202);return true;}
    if(b&&c==='pause'&&req.method==='POST'){step='pause';await orchestrator.pause(b);send({ok:true});return true;}
    if(b&&c==='cancel'&&req.method==='POST'){step='cancel';send(await orchestrator.cancel(b,'local-operator',String(body.reason||'Người dùng hủy').slice(0,200)));return true;}
    if(b&&c==='output'&&d&&req.method==='GET'){step='read-output';send({content:await orchestrator.getOutput(b,d),notice:'Đề xuất do AI tạo; cần con người rà soát'});return true;}
    if(b&&c==='aggregate'&&req.method==='GET'){step='read-aggregate';send({content:await orchestrator.getAggregate(b),notice:'Đề xuất do AI tạo; cần con người rà soát'});return true;}
   }
   if(a==='code'&&codeChanges){
    if(b==='repos'&&!c&&req.method==='GET'){send({repos:codeChanges.listRepos()});return true;}
    if(b==='repos'&&!c&&req.method==='POST'){step='register-repo';send(await codeChanges.registerRepo(body),201);return true;}
    if(b==='github-token'&&req.method==='PUT'&&secrets){step='save-token';if(typeof body.token!=='string'||body.token.length<20||body.token.length>400||/\s/.test(body.token)){const e=new Error('Token GitHub không hợp lệ');e.code='INVALID';throw e;}await secrets.set('github:token',body.token);send({ok:true,note:'Token được lưu trong kho bí mật, không hiển thị lại.'});return true;}
    if(b==='changes'){
     if(!c&&req.method==='GET'){send({changes:codeChanges.list()});return true;}
     if(!c&&req.method==='POST'){step='create-code-change';send(await codeChanges.create(body),201);return true;}
     if(c&&!d&&req.method==='GET'){send(codeChanges.get(c));return true;}
     const act=d;
     if(c&&act==='approve'&&req.method==='POST'){step='approve';send(await codeChanges.approve(c,{reason:body.reason}));return true;}
     if(c&&act==='start'&&req.method==='POST'){step='start';send(await codeChanges.start(c,'local-operator',{rerunInterrupted:body.rerunInterrupted===true}),202);return true;}
     if(c&&act==='cancel'&&req.method==='POST'){step='cancel';send(await codeChanges.cancel(c));return true;}
     if(c&&act==='approve-publish'&&req.method==='POST'){step='approve-publish';send(await codeChanges.approvePublish(c,{reason:body.reason}));return true;}
     if(c&&act==='publish'&&req.method==='POST'){step='publish';send(await codeChanges.publish(c));return true;}
    }
   }
   if(a==='review'&&reviews){
    if(!b&&req.method==='GET'){send({reviews:reviews.list()});return true;}
    if(!b&&req.method==='POST'){step='start-review';send(await reviews.start(body),202);return true;}
    if(b&&!c&&req.method==='GET'){send(reviews.get(b));return true;}
    if(b&&c==='report'&&req.method==='GET'){step='report';send({markdown:reviews.report(b)});return true;}
   }
   if(a==='backups'&&dataDir){
    if(req.method==='GET'){send({backups:await listBackups(dataDir)});return true;}
    if(req.method==='POST'){step='backup';const r=await createBackup(dataDir);send({fileCount:r.fileCount,name:r.path.split(/[\\/]/).pop(),note:'Bản sao nằm trong thư mục backups của dữ liệu người dùng. Khóa API vẫn được mã hóa DPAPI và chỉ phục hồi được bởi cùng tài khoản Windows.'},201);return true;}
   }
   if(a==='shutdown'&&req.method==='POST'&&onShutdown){send({ok:true});setTimeout(onShutdown,50);return true;}
   send({error:'Không có chức năng này',code:'NOT_FOUND',action:'Cập nhật ứng dụng hoặc kiểm tra đường dẫn.'},404);return true;
  }catch(e){
   const d=describeError(e,step);
   sendJson(res,statusFor(d.code),d);return true;
  }
 };
}
