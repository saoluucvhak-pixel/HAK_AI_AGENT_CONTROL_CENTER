import {verifyDelegationEvidence} from './delegation-evidence.js';
import {validateEvent} from './core.js';

const TERMINAL=new Set(['passed','failed','blocked']);
export function reconcileAgentExecution({proposal,events}={}){
 const integrity=verifyDelegationEvidence(proposal);
 if(!integrity.valid)throw new Error('Invalid delegation proposal: '+integrity.reason);
 if(!Array.isArray(events)||events.length>10000)throw new Error('Invalid event collection');
 const expected=new Map(proposal.steps.map(s=>[proposal.workOrderId+':'+s.step,{step:s.step,agentRole:s.agentRole}]));
 const latest=new Map();
 const allowed=new Map([['queued',new Set(['queued','running','blocked'])],['running',new Set(['running','passed','failed','blocked'])],['passed',new Set()],['failed',new Set()],['blocked',new Set()]]);
 for(const raw of events){
  const e=validateEvent(raw);
  const task=expected.get(e.taskId);
  if(!task||e.agentId!==task.agentRole)throw new Error('Unexpected task or agent');
  const prev=latest.get(e.taskId);
  if(prev&&!allowed.get(prev).has(e.status))throw new Error('Invalid agent status transition');
  latest.set(e.taskId,e.status);
 }
 const steps=proposal.steps.map(s=>{
  const status=latest.get(proposal.workOrderId+':'+s.step)||'not-observed';
  return {step:s.step,agentRole:s.agentRole,status,terminal:TERMINAL.has(status)};
 });
 const allPassed=steps.every(s=>s.status==='passed');
 return {schemaVersion:1,kind:'hak-agent-event-reconciliation',workOrderId:proposal.workOrderId,proposalIntegrityVerified:true,eventCount:events.length,steps,allPassed,executionVerified:false,providerVerified:false,approvalVerified:false,readyForProduction:false,limitations:['Observer events are untrusted self-reports, not independent execution evidence','Passed statuses do not prove provider identity, output quality or authorization','Independent review and approved provider traces are required']};
}
