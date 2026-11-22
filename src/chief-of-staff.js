const PRIORITIES = new Set(['critical','high','normal','low']);
const TYPES = new Set(['feature','bug','security','maintenance','research']);
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
function nonEmpty(value,field,max=2000) {
  if(typeof value!=='string'||!value.trim()||value.length>max) throw new Error('Invalid '+field);
  return value.trim();
}
export function createWorkOrder(input) {
  if(!input || typeof input!=='object'||Array.isArray(input)) throw new Error('Invalid work order');
  const id=nonEmpty(input.id,'id',80);
  const projectId=nonEmpty(input.projectId,'projectId',80);
  if(!ID.test(id)||!ID.test(projectId)) throw new Error('Invalid identifier');
  const title=nonEmpty(input.title,'title',200);
  const description=nonEmpty(input.description,'description',8000);
  const priority=input.priority||'normal',type=input.type||'feature';
  if(!PRIORITIES.has(priority)||!TYPES.has(type)) throw new Error('Invalid classification');
  const acceptanceCriteria=input.acceptanceCriteria;
  if(!Array.isArray(acceptanceCriteria)||acceptanceCriteria.length===0||acceptanceCriteria.length>30) throw new Error('Acceptance criteria required');
  const criteria=acceptanceCriteria.map(x=>nonEmpty(x,'acceptance criterion',500));
  return Object.freeze({id,projectId,title,description,priority,type,acceptanceCriteria:criteria,requiresApproval:true,status:'PROPOSED',createdAt:new Date().toISOString()});
}
export function proposeDelegation(order,agentRoles) {
  if(order?.status!=='PROPOSED'||order.requiresApproval!==true) throw new Error('Invalid work order state');
  if(!Array.isArray(agentRoles)||agentRoles.length<1||agentRoles.length>8) throw new Error('Agent count must be 1-8');
  const allowed=new Set(['architecture','ui','backend','data','security','testing','quality','release','ocr']);
  const roles=agentRoles.map(role=>{if(!allowed.has(role))throw new Error('Unknown agent role');return role;});
  if(new Set(roles).size!==roles.length)throw new Error('Duplicate agent role');
  return {workOrderId:order.id,projectId:order.projectId,roles,approval:'PENDING',canExecute:false,canMerge:false};
}
export function canMerge({ci,review,approval,conflicts,security}) {
  return ci==='passed'&&review==='approved'&&approval==='approved'&&conflicts===false&&security==='passed';
}
export function reportSummary(orders) {
  if(!Array.isArray(orders))throw new Error('Invalid orders');
  const counts={PROPOSED:0,APPROVED:0,RUNNING:0,BLOCKED:0,COMPLETED:0};
  for(const order of orders){if(!Object.hasOwn(counts,order.status))throw new Error('Unknown status');counts[order.status]++;}
  return {total:orders.length,counts};
}
