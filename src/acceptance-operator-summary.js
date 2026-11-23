const GATES={
 'windows-desktop':'Run dashboard on the actual Windows workstation, restart it, and verify Observer replay.',
 'ruflo-live':'Execute an approved two-agent Ruflo task and independently review trace and outputs.',
 'claude-mem-live':'Verify scoped memory write, restart, retrieval, isolation and retention.',
 'omniroute-live':'Run an explicitly approved real gateway challenge and verify provider/cost evidence.',
 'archify-live':'Generate and review a source-linked diagram from the real repository.',
 'ocr-live':'Run the OCR engine against a labeled approved dataset and record accuracy.',
 'security-review':'Complete RBAC, secrets, recovery and independent security sign-off.'
};
export function acceptanceOperatorSummary(packet){
 if(!packet||packet.kind!=='hak-acceptance-evidence-packet'||!Array.isArray(packet.checks)||!Array.isArray(packet.required)||!Array.isArray(packet.connectivity))throw new Error('Invalid acceptance packet');
 const checks=packet.checks.map(c=>({id:c.id,status:c.status}));
 const pending=packet.required.map(g=>({id:g.id,status:g.status,action:GATES[g.id]}));
 if(pending.some(g=>!g.action))throw new Error('Unknown acceptance gate');
 const failed=checks.filter(c=>c.status!=='passed');
 return {
  kind:'hak-operator-acceptance-summary',localBaseline:packet.localChecksPassed&&failed.length===0?'passed':'needs-attention',
  failedChecks:failed,connectivity:packet.connectivity.map(c=>({id:c.id,status:c.status})),
  pendingGates:pending.filter(g=>g.status!=='passed'),readyForProduction:false,
  nextStep:failed.length?'Fix failing local checks and rerun the acceptance packet':'Collect independent Windows and real-provider evidence for every pending gate',
  notice:'This summary is diagnostic only; external gates require authoritative evidence and approval.'
 };
}
