import {acceptanceReport} from './acceptance.js';
export function evidenceSnapshot({diagnostics,observer,at=new Date().toISOString()}){
 if(!diagnostics||!Array.isArray(diagnostics.checks)||!observer||!Array.isArray(observer.tasks))throw new Error('Invalid evidence input');
 const acceptance=acceptanceReport();
 return {
  schemaVersion:1,
  kind:'hak-local-acceptance-evidence',
  generatedAt:at,
  readyForProduction:false,
  diagnostics:{
   kind:diagnostics.kind,
   checkedAt:diagnostics.checkedAt,
   checks:diagnostics.checks.map(c=>({id:c.id,status:c.status,verified:false,...(Number.isInteger(c.httpStatus)?{httpStatus:c.httpStatus}:{})}))
  },
  observer:{persistent:observer.persistent===true,taskCount:observer.tasks.length,statusCounts:observer.tasks.reduce((counts,t)=>{counts[t.status]=(counts[t.status]||0)+1;return counts;},{})},
  acceptance:acceptance.checks.map(c=>({id:c.id,label:c.label,status:c.status,evidence:c.evidence})),
  pending:acceptance.checks.filter(c=>!c.verified).map(c=>c.id),
  limitations:['Connectivity does not verify real model or agent execution','Observer task counts do not verify outcomes','Windows desktop and security acceptance require independent evidence','No provider credentials or event payloads are included']
 };
}
