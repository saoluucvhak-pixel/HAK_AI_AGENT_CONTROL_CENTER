import {createHash} from 'node:crypto';
import {localAcceptance} from './local-acceptance.js';

const REQUIRED=['windows-desktop','ruflo-live','claude-mem-live','omniroute-live','archify-live','ocr-live','security-review'];
export function createAcceptancePacket({baseline,reviewedEvidence=[]}={}){
 if(!baseline||baseline.kind!=='hak-local-acceptance-diagnostics'||baseline.readyForProduction!==false)throw new Error('Invalid local baseline');
 if(!Array.isArray(reviewedEvidence)||reviewedEvidence.length>REQUIRED.length)throw new Error('Invalid reviewed evidence');
 const seen=new Set();
 const gates=reviewedEvidence.map(item=>{
  if(!item||!REQUIRED.includes(item.id)||seen.has(item.id))throw new Error('Invalid or duplicate gate');
  seen.add(item.id);
  if(item.status!=='pending'&&item.status!=='blocked')throw new Error('Evidence requires independent verification; only pending or blocked accepted');
  return {id:item.id,status:item.status};
 });
 const required=REQUIRED.map(id=>({id,status:gates.find(g=>g.id===id)?.status||'missing'}));
 const payload={schemaVersion:1,kind:'hak-acceptance-evidence-packet',platform:baseline.platform,nodeMajor:baseline.nodeMajor,localChecksPassed:baseline.localChecksPassed===true,checks:baseline.checks.map(c=>({id:c.id,status:c.status})),connectivity:baseline.connectivity.map(c=>({id:c.id,status:c.status})),required,readyForProduction:false};
 const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {...payload,sha256,notice:'Digest detects accidental changes only; no signature, provider attestation or human approval is included'};
}
export async function buildLocalAcceptancePacket(options={}){
 const baseline=await localAcceptance(options);
 return createAcceptancePacket({baseline});
}
