import {createWorkOrder,proposeDelegation} from './chief-of-staff.js';
import {routeModel} from './integrations.js';
import {formatSkillsForPrompt} from './skill-resolver.js';
import {createHash} from 'node:crypto';

const ROLES={architecture:'orchestrator',ui:'coder',backend:'coder',data:'coder',security:'reviewer',testing:'tester',quality:'reviewer',release:'orchestrator',ocr:'ocr'};
const digest=text=>createHash('sha256').update(text).digest('hex');

export function extractStructuredPatchFromAnswer(answer){
 if(typeof answer!=='string'||!answer.trim())throw new Error('Empty model answer');
 const fenced=answer.match(/```json\s*([\s\S]*?)```/i);
 const raw=fenced?fenced[1].trim():answer.trim();
 const parsed=JSON.parse(raw);
 if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.changes)||typeof parsed.rationale!=='string')
  throw new Error('Answer does not contain structured patch proposal');
 return {rationale:parsed.rationale,changes:parsed.changes};
}

/**
 * Sequential, bounded, approval-gated agent execution. Never writes code, merges PRs,
 * invokes shell commands or marks provider identity / production as verified.
 * Output content is intentionally excluded from the audit report.
 */
export async function executeApprovedWorkOrder({workOrder,roles,loadedSkills=[],approval,env=process.env,modelRunner=routeModel,onEvent=async()=>{},verifyApproval,saveOutput}={}){
 const order=createWorkOrder(workOrder);
 const skillNames=Array.isArray(loadedSkills)&&loadedSkills.length>0?loadedSkills.map(s=>s.name):order.skills;
 const proposal=proposeDelegation(order,roles,skillNames?{skills:skillNames}:{});
 if(!approval||approval.approved!==true||approval.workOrderId!==order.id||
    typeof approval.approvedBy!=='string'||!/^[a-zA-Z0-9_.@-]{3,128}$/.test(approval.approvedBy)||
    typeof approval.reason!=='string'||!approval.reason.trim()||approval.reason.length>500)
   throw new Error('Explicit matching human approval required');
 if(typeof verifyApproval!=='function')throw new Error('Trusted approval verifier required');
 if(typeof saveOutput!=='function')throw new Error('Secure output storage callback required');
 const approvalVerified=await verifyApproval({workOrderId:order.id,projectId:order.projectId,approval});
 if(approvalVerified!==true)throw new Error('Approval not verified by trusted authority');
 if(env.HAK_AGENT_EXECUTION_ENABLED!=='true')throw new Error('Agent execution disabled');
 if(env.HAK_OMNIROUTE_ENABLED!=='true')throw new Error('Model gateway disabled');
 if(typeof modelRunner!=='function'||typeof onEvent!=='function')throw new Error('Invalid execution dependencies');
 const skillBlock=Array.isArray(loadedSkills)&&loadedSkills.length>0?'\n\nMandatory HAK Skills:\n'+formatSkillsForPrompt(loadedSkills):'';
 const appliedSkills=Array.isArray(loadedSkills)&&loadedSkills.length>0?loadedSkills.map(s=>({name:s.name,sha256:s.sha256})):undefined;
 const steps=[];
 let failed=false;
 for(let index=0;index<proposal.roles.length;index++){
  const agentRole=proposal.roles[index];
  const taskId=order.id+':'+(index+1);
  const agentId=agentRole;
  const prompt=('Work order: '+order.id+'\nTask: '+order.title+'\nDescription: '+order.description+'\nRole: '+agentRole+'\nAcceptance criterion: '+order.acceptanceCriteria[index%order.acceptanceCriteria.length]+skillBlock+'\nProvide a concise reviewable proposal only. Do not claim changes were applied.').slice(0,31500);
  await onEvent({taskId,agentId,status:'queued'});
  await onEvent({taskId,agentId,status:'running'});
  try{
   const output=await modelRunner({role:ROLES[agentRole],sensitive:false,prompt},{env});
   if(!output||typeof output.answer!=='string'||!output.answer.trim()||output.answer.length>128000)throw Error('Invalid model output');
   const outputSha256=digest(output.answer);
   const saved=await saveOutput({workOrderId:order.id,projectId:order.projectId,taskId,agentRole,content:output.answer,sha256:outputSha256});
   if(saved!==true)throw Error('Secure output storage did not confirm persistence');
   const result={step:index+1,agentRole,status:'passed',outputSha256,outputLength:output.answer.length,modelReported:typeof output.model==='string'?output.model.slice(0,128):'unknown',...(appliedSkills?{appliedSkills}:{}),humanReviewRequired:true};
   steps.push(result);
   await onEvent({taskId,agentId,status:'passed'});
  }catch{
   failed=true;
   steps.push({step:index+1,agentRole,status:'failed',humanReviewRequired:true});
   await onEvent({taskId,agentId,status:'failed'});
   break;
  }
 }
 return {schemaVersion:1,kind:'hak-approved-agent-execution',workOrderId:order.id,projectId:order.projectId,approvalRecorded:true,approvalVerified:true,outputsPersisted:!failed,approvedBy:approval.approvedBy,...(appliedSkills?{appliedSkills}:{}),steps,completed:!failed&&steps.length===proposal.roles.length,executionAttempted:true,providerIdentityVerified:false,outputReviewed:false,readyForProduction:false,limitations:['Caller-provided verifier must authenticate approval against a trusted authority; engine cannot independently attest verifier integrity','Output hashes are not independent provider traces','No changes are applied or merged; human review and CI remain mandatory']};
}
