import {AGENT_ROLES} from './provider-manager.js';

const ID=/^[a-z0-9][a-z0-9-]{0,39}$/;
const PROJECT=/^[a-zA-Z0-9_-]{1,80}$/;
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH=/^[A-Za-z0-9_./-]{1,100}$/;
export const PHASES=Object.freeze(['work','review','test']);
export const MAX_TASKS=16;
export const MAX_DISTINCT_AGENTS=9; // project-manager + up to 8 specialists

export const AGENT_LABELS=Object.freeze({
 'project-manager':'Project Manager','architecture':'Kiến trúc','backend':'Backend','frontend':'Frontend','database':'Cơ sở dữ liệu',
 'security':'Bảo mật','testing':'Kiểm thử','quality':'Chất lượng mã','ocr':'OCR','documentation':'Tài liệu','release':'Phát hành'
});
const INSTRUCTIONS={
 'project-manager':'Phân rã mục tiêu thành các hạng mục, nêu thứ tự ưu tiên và rủi ro chính.',
 'architecture':'Phân tích kiến trúc hiện tại, đề xuất thiết kế thay đổi, ranh giới module và rủi ro.',
 'backend':'Đề xuất thay đổi phía backend/API: hàm, endpoint, xử lý lỗi và dữ liệu.',
 'frontend':'Đề xuất thay đổi giao diện: màn hình, thành phần, trạng thái lỗi và tiếng Việt rõ ràng.',
 'database':'Đề xuất lược đồ dữ liệu, migration, tính nhất quán và sao lưu.',
 'security':'Rà soát bảo mật cho các đề xuất trước đó: xác thực, phân quyền, lộ bí mật, injection. Nêu lỗi cụ thể.',
 'quality':'Rà soát chất lượng: trùng lặp, độ phức tạp, khả năng bảo trì, thiếu test. Nêu lỗi cụ thể.',
 'testing':'Lập kế hoạch kiểm thử và các ca kiểm thử cụ thể (unit, integration, e2e) cho tiêu chí nghiệm thu.',
 'ocr':'Đề xuất cách xử lý OCR/chứng từ liên quan, độ chính xác cần đo và ca kiểm thử.',
 'documentation':'Soạn nội dung tài liệu/hướng dẫn người dùng cần cập nhật.',
 'release':'Lập danh sách kiểm tra phát hành, ghi chú phát hành và kế hoạch hoàn tác.'
};
const BUILD=['backend','frontend','database','ocr'];
const REVIEW=['security','quality'];

/** Deterministic plan: architecture → builders (parallel) → documentation → security/quality review → testing → release. */
export function buildStandardPlan(agents){
 if(!Array.isArray(agents)||agents.length<1)throw new Error('Cần chọn ít nhất một Agent');
 const set=new Set(agents);
 for(const a of set)if(!AGENT_ROLES.includes(a))throw new Error('Agent không hợp lệ: '+a);
 const tasks=[];
 const add=(agent,phase,dependsOn)=>tasks.push({id:agent,agent,phase,title:AGENT_LABELS[agent],instruction:INSTRUCTIONS[agent],dependsOn});
 const had=a=>set.has(a);
 if(had('project-manager'))add('project-manager','work',[]);
 const first=had('project-manager')?['project-manager']:[];
 if(had('architecture'))add('architecture','work',first);
 const upstream=had('architecture')?['architecture']:first;
 const builders=BUILD.filter(had);
 for(const a of builders)add(a,'work',upstream);
 if(had('documentation'))add('documentation','work',builders.length?builders:upstream);
 const afterWork=tasks.filter(t=>t.phase==='work').map(t=>t.id);
 for(const a of REVIEW.filter(had))add(a,'review',afterWork);
 const reviewed=tasks.filter(t=>t.phase==='review').map(t=>t.id);
 if(had('testing'))add('testing','test',[...afterWork,...reviewed]);
 if(had('release'))add('release','test',tasks.filter(t=>t.id!=='release').map(t=>t.id));
 return tasks;
}
export function validateTasks(tasks,{maxAgents=8}={}){
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>MAX_TASKS)throw new Error('Kế hoạch phải có từ 1 đến '+MAX_TASKS+' công việc');
 const byId=new Map();
 const out=tasks.map(t=>{
  if(!t||typeof t!=='object')throw new Error('Công việc không hợp lệ');
  if(typeof t.id!=='string'||!ID.test(t.id))throw new Error('Mã công việc không hợp lệ');
  if(byId.has(t.id))throw new Error('Trùng mã công việc: '+t.id);
  if(!AGENT_ROLES.includes(t.agent))throw new Error('Agent không hợp lệ: '+t.agent);
  const phase=t.phase??'work';
  if(!PHASES.includes(phase))throw new Error('Giai đoạn không hợp lệ');
  const instruction=String(t.instruction??'').trim();
  if(!instruction||instruction.length>4000)throw new Error('Hướng dẫn công việc '+t.id+' không hợp lệ');
  const dependsOn=Array.isArray(t.dependsOn)?[...new Set(t.dependsOn)]:[];
  if(dependsOn.length>MAX_TASKS||dependsOn.some(d=>typeof d!=='string'))throw new Error('Dependency không hợp lệ');
  const o={id:t.id,agent:t.agent,phase,title:String(t.title||AGENT_LABELS[t.agent]).slice(0,120),instruction,dependsOn,status:'PENDING',attempts:0};
  byId.set(t.id,o);return o;
 });
 const specialists=new Set(out.filter(t=>t.agent!=='project-manager').map(t=>t.agent));
 if(specialists.size>maxAgents)throw new Error('Tối đa '+maxAgents+' Agent chuyên môn');
 const rank=p=>PHASES.indexOf(p);
 for(const t of out){
  for(const d of t.dependsOn){
   const dep=byId.get(d);
   if(!dep)throw new Error('Dependency không tồn tại: '+d);
   if(d===t.id)throw new Error('Công việc không thể phụ thuộc chính nó');
   if(rank(dep.phase)>rank(t.phase))throw new Error('Công việc '+t.id+' không thể phụ thuộc giai đoạn muộn hơn');
  }
 }
 // cycle detection (Kahn)
 const indeg=new Map(out.map(t=>[t.id,t.dependsOn.length]));
 const queue=out.filter(t=>t.dependsOn.length===0).map(t=>t.id);let seen=0;
 while(queue.length){const id=queue.pop();seen++;for(const t of out)if(t.dependsOn.includes(id)){indeg.set(t.id,indeg.get(t.id)-1);if(indeg.get(t.id)===0)queue.push(t.id);}}
 if(seen!==out.length)throw new Error('Kế hoạch có vòng phụ thuộc');
 return out;
}
const bounded=(v,min,max,d,label)=>{if(v===undefined||v===null||v==='')return d;const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new Error(label+' phải từ '+min+' đến '+max);return n;};
export function normalizeWorkOrderInput(input,{maxAgents=8}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Work Order không hợp lệ');
 const str=(v,label,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(label+' không hợp lệ');return v.trim();};
 const projectId=input.projectId===undefined?'HAK':String(input.projectId);
 if(!PROJECT.test(projectId))throw new Error('Mã dự án không hợp lệ');
 let repository=null;
 if(input.repository!==undefined&&input.repository!==null&&input.repository!==''){if(typeof input.repository!=='string'||!REPO.test(input.repository))throw new Error('Repository phải có dạng owner/name');repository=input.repository;}
 let targetBranch=null;
 if(input.targetBranch){if(typeof input.targetBranch!=='string'||!BRANCH.test(input.targetBranch)||input.targetBranch.includes('..'))throw new Error('Branch không hợp lệ');targetBranch=input.targetBranch;}
 const scope=Array.isArray(input.scope)?input.scope:[];
 if(scope.length>50||scope.some(p=>typeof p!=='string'||!p.trim()||p.length>200||p.includes('..')||/^([a-zA-Z]:|[\\/])/.test(p)))throw new Error('Phạm vi cho phép sửa không hợp lệ');
 const criteria=Array.isArray(input.acceptanceCriteria)?input.acceptanceCriteria:['Đề xuất đầy đủ, có thể rà soát bởi con người'];
 if(criteria.length<1||criteria.length>30||criteria.some(c=>typeof c!=='string'||!c.trim()||c.length>500))throw new Error('Tiêu chí nghiệm thu không hợp lệ');
 const tasks=validateTasks(input.tasks??buildStandardPlan(input.agents),{maxAgents});
 const budget={maxTokens:bounded(input.budget?.maxTokens,1000,5000000,200000,'Giới hạn token'),maxCostUsd:input.budget?.maxCostUsd==null||input.budget?.maxCostUsd===''?null:Number(input.budget.maxCostUsd)};
 if(budget.maxCostUsd!==null&&!(Number.isFinite(budget.maxCostUsd)&&budget.maxCostUsd>=0))throw new Error('Giới hạn chi phí không hợp lệ');
 let deadline=null;
 if(input.deadline){if(Number.isNaN(Date.parse(input.deadline)))throw new Error('Thời hạn không hợp lệ');deadline=new Date(input.deadline).toISOString();}
 return {projectId,repository,targetBranch,title:str(input.title,'Mục tiêu',160),description:str(input.description,'Mô tả',8000),scope:scope.map(s=>s.trim()),acceptanceCriteria:criteria.map(c=>c.trim()),tasks,budget,deadline,
  concurrency:bounded(input.concurrency,1,8,4,'Số Agent đồng thời'),taskTimeoutMs:bounded(input.taskTimeoutMs,1000,900000,180000,'Timeout công việc'),
  permissions:{mode:'text-only',note:'Agent chỉ tạo đề xuất; không ghi mã, không chạy lệnh, không merge'}};
}
/** The exact content a human approves. Anything that changes it invalidates the approval. */
export function approvalScope(order){
 return {id:order.id,projectId:order.projectId,repository:order.repository,targetBranch:order.targetBranch,title:order.title,description:order.description,scope:order.scope,
  acceptanceCriteria:order.acceptanceCriteria,tasks:order.tasks.map(t=>({id:t.id,agent:t.agent,phase:t.phase,instruction:t.instruction,dependsOn:t.dependsOn})),
  budget:order.budget,permissions:order.permissions,concurrency:order.concurrency};
}
