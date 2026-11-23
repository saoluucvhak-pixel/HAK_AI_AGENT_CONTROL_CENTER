import {createWorkOrder,proposeDelegation} from './chief-of-staff.js';
import {validateTask} from './policy.js';

const ROLE_MAP=Object.freeze({architecture:'orchestrator',ui:'coder',backend:'coder',data:'coder',security:'reviewer',testing:'tester',quality:'reviewer',release:'orchestrator',ocr:'ocr'});
export function rehearseDelegation({workOrder,roles}={}){
 const order=createWorkOrder(workOrder);
 const proposal=proposeDelegation(order,roles);
 const tasks=proposal.roles.map((role,index)=>{
  const task=validateTask({role:ROLE_MAP[role],sensitive:false,prompt:'Proposed work order '+order.id+'; role '+role+'; criterion '+order.acceptanceCriteria[index%order.acceptanceCriteria.length]});
  return {step:index+1,agentRole:role,modelRole:task.role,status:'PROPOSED',executionAllowed:false,requiresHumanApproval:true};
 });
 return {schemaVersion:1,kind:'hak-agent-delegation-rehearsal',workOrderId:order.id,projectId:order.projectId,approval:'PENDING',canExecute:false,canMerge:false,readyForProduction:false,tasks,limitations:['No agents are started','No model gateway calls are made','Human approval, real execution and trace evidence are required']};
}
