import {createHash} from 'node:crypto';
import {rehearseDelegation} from './agent-delegation-rehearsal.js';

export function delegationEvidence({workOrder,roles,at=new Date().toISOString()}={}){
 const plan=rehearseDelegation({workOrder,roles});
 if(typeof at!=='string'||Number.isNaN(Date.parse(at)))throw new Error('Invalid evidence timestamp');
 const canonical=JSON.stringify({schemaVersion:plan.schemaVersion,workOrderId:plan.workOrderId,projectId:plan.projectId,roles:plan.tasks.map(x=>x.agentRole)});
 const planSha256=createHash('sha256').update(canonical).digest('hex');
 return {schemaVersion:1,kind:'hak-delegation-proposal-evidence',generatedAt:at,planSha256,workOrderId:plan.workOrderId,projectId:plan.projectId,steps:plan.tasks.map(({step,agentRole,modelRole,status,executionAllowed})=>({step,agentRole,modelRole,status,executionAllowed})),approval:'PENDING',executionVerified:false,providerVerified:false,ciVerified:false,readyForProduction:false,limitations:['Hash identifies the proposal, not execution','No agent execution or provider access was attempted','Approval and CI must be verified separately']};
}
