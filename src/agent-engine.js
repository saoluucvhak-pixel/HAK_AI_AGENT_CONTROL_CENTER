import {createWorkOrder,proposeDelegation} from './chief-of-staff.js';
import {routeModel} from './integrations.js';
import {createHash} from 'node:crypto';

const ROLES={architecture:'orchestrator',ui:'coder',backend:'coder',data:'coder',security:'reviewer',testing:'tester',quality:'reviewer',release:'orchestrator',ocr:'ocr'};
const digest=text=>createHash('sha256').update(text).digest('hex');

/**
 * Sequential, bounded, approval-gated agent execution. Never writes code, merges PRs,
 * invokes shell commands or marks provider identity / production as verified.
 * Output content is intentionally excluded from the audit report.
 */
export async function executeApprovedWorkOrder({workOrder,roles,approval,env=process.env,modelRunner=routeModel,onEvent=async()=>{}}={}){
 const order=createWorkOrder(workOrder);
 const proposal=proposeDelegation(order,roles);
 if(!approval||approval.approved!==true||approval.workOrderId!==order.id||
    typeof approval.approvedBy!=='string'||!/^[a-zA-Z0-9_.@-]{3,128}$/.test(approval.approvedBy)||
    typeof approval.reason!=='string'||!approval.reason.trim()||approval.reason.length>500)
   throw new Error('Explicit matching human approval required');
 if(env.HAK_AGENT_EXECUTION_ENABLED!=='true')throw new Error('Agent execution disabled');
 if(env.HAK_OMNIROUTE_ENABLED!=='true')throw new Error('Model gateway disabled');
 if(typeof modelRunner!=='function'||typeof onEvent!=='function')throw new Error('Invalid execution dependencies');
 const steps=[];
 let failed=false;
 for(let index=0;index<proposal.roles.length;index++){
  const agentRole=proposal.roles[index];
  const taskId=order.id+':'+(index+1);
  const agentId=agentRole;
  const prompt='Work order: '+order.id+'\nTask: '+order.title+'\nDescription: '+order.description+'\nRole: '+agentRole+'\nAcceptance criterion: '+order.acceptanceCriteria[index%order.acceptanceCriteria.length]+'\nProvide a concise reviewable proposal only. Do not claim changes were applied.';
  await onEvent({taskId,agentId,status:'queued'});
  await onEvent({taskId,agentId,status:'running'});
  try{
   const output=await modelRunner({role:ROLES[agentRole],sensitive:false,prompt},{env});
   if(!output||typeof output.answer!=='string'||!output.answer.trim()||output.answer.length>128000)throw Error('Invalid model output');
   const result={step:index+1,agentRole,status:'passed',outputSha256:digest(output.answer),outputLength:output.answer.length,modelReported:typeof output.model==='string'?output.model.slice(0,128):'unknown',humanReviewRequired:true};
   steps.push(result);
   await onEvent({taskId,agentId,status:'passed'});
  }catch{
   failed=true;
   steps.push({step:index+1,agentRole,status:'failed',humanReviewRequired:true});
   await onEvent({taskId,agentId,status:'failed'});
   break;
  }
 }
 return {schemaVersion:1,kind:'hak-approved-agent-execution',workOrderId:order.id,projectId:order.projectId,approvalRecorded:true,approvedBy:approval.approvedBy,steps,completed:!failed&&steps.length===proposal.roles.length,executionAttempted:true,providerIdentityVerified:false,outputReviewed:false,readyForProduction:false,limitations:['Approval assertion is supplied by caller; identity is not independently authenticated','Output hashes are not independent provider traces','No changes are applied or merged; human review and CI remain mandatory']};
}
