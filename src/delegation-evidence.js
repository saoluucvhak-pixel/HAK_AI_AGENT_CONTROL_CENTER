import {createHash} from 'node:crypto';
import {rehearseDelegation} from './agent-delegation-rehearsal.js';

export function delegationEvidence({workOrder,roles,at=new Date().toISOString()}={}){
 const plan=rehearseDelegation({workOrder,roles});
 if(typeof at!=='string'||Number.isNaN(Date.parse(at)))throw new Error('Invalid evidence timestamp');
 const canonical=JSON.stringify({schemaVersion:plan.schemaVersion,workOrderId:plan.workOrderId,projectId:plan.projectId,roles:plan.tasks.map(x=>x.agentRole)});
 const planSha256=createHash('sha256').update(canonical).digest('hex');
 return {schemaVersion:1,kind:'hak-delegation-proposal-evidence',generatedAt:at,planSha256,workOrderId:plan.workOrderId,projectId:plan.projectId,steps:plan.tasks.map(({step,agentRole,modelRole,status,executionAllowed})=>({step,agentRole,modelRole,status,executionAllowed})),approval:'PENDING',executionVerified:false,providerVerified:false,ciVerified:false,readyForProduction:false,limitations:['Hash identifies the proposal, not execution','No agent execution or provider access was attempted','Approval and CI must be verified separately']};
}

export function verifyDelegationEvidence(evidence){
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))return {valid:false,reason:'invalid-evidence'};
 if(evidence.kind!=='hak-delegation-proposal-evidence'||evidence.schemaVersion!==1||!Array.isArray(evidence.steps)||evidence.steps.length<1||evidence.steps.length>8)return {valid:false,reason:'invalid-shape'};
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(evidence.workOrderId||'')||!/^[a-zA-Z0-9_-]{1,80}$/.test(evidence.projectId||''))return {valid:false,reason:'invalid-identity'};
 if(typeof evidence.planSha256!=='string'||!/^[0-9a-f]{64}$/.test(evidence.planSha256))return {valid:false,reason:'invalid-digest'};
 if(evidence.approval!=='PENDING'||evidence.executionVerified!==false||evidence.providerVerified!==false||evidence.ciVerified!==false||evidence.readyForProduction!==false)return {valid:false,reason:'unsupported-verification-claim'};
 const allowed=new Set(['architecture','ui','backend','data','security','testing','quality','release','ocr']);
 const mapping={architecture:'orchestrator',ui:'coder',backend:'coder',data:'coder',security:'reviewer',testing:'tester',quality:'reviewer',release:'orchestrator',ocr:'ocr'};
 const roles=[];
 for(let i=0;i<evidence.steps.length;i++){
  const step=evidence.steps[i];
  if(!step||step.step!==i+1||!allowed.has(step.agentRole)||step.modelRole!==mapping[step.agentRole]||step.status!=='PROPOSED'||step.executionAllowed!==false||roles.includes(step.agentRole))return {valid:false,reason:'invalid-step'};
  roles.push(step.agentRole);
 }
 const canonical=JSON.stringify({schemaVersion:1,workOrderId:evidence.workOrderId,projectId:evidence.projectId,roles});
 const actual=createHash('sha256').update(canonical).digest('hex');
 return {valid:actual===evidence.planSha256,reason:actual===evidence.planSha256?'proposal-integrity-only':'digest-mismatch',executionVerified:false,readyForProduction:false};
}
