import {reconcileAgentExecution} from './agent-execution-reconciliation.js';

const REQUIRED=Object.freeze(['human-approval','provider-trace','output-review','ci-run','security-review','desktop-acceptance']);
export function agentAcceptanceGaps({proposal,events,artifacts=[]}={}){
 const observed=reconcileAgentExecution({proposal,events});
 if(!Array.isArray(artifacts)||artifacts.length>100)throw new Error('Invalid acceptance artifacts');
 const seen=new Set();
 const artifactSummary=[];
 for(const item of artifacts){
  if(!item||typeof item!=='object'||Array.isArray(item)||!REQUIRED.includes(item.kind)||seen.has(item.kind))throw new Error('Invalid or duplicate artifact kind');
  if(typeof item.reference!=='string'||!/^[a-zA-Z0-9_./:-]{1,200}$/.test(item.reference))throw new Error('Invalid artifact reference');
  seen.add(item.kind);
  artifactSummary.push({kind:item.kind,reference:item.reference,status:'unverified-reference'});
 }
 return {schemaVersion:1,kind:'hak-agent-acceptance-gap-report',workOrderId:observed.workOrderId,observerAllPassed:observed.allPassed,observerEventCount:observed.eventCount,required:REQUIRED.map(kind=>({kind,present:seen.has(kind),independentlyVerified:false})),providedReferences:artifactSummary,missing:REQUIRED.filter(kind=>!seen.has(kind)),executionVerified:false,readyForProduction:false,notice:'References are untrusted until verified against authoritative provider, GitHub, reviewer and desktop sources'};
}
