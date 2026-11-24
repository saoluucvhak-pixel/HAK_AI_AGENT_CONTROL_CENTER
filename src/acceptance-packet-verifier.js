import {createHash,timingSafeEqual} from 'node:crypto';
const REQUIRED=['windows-desktop','ruflo-live','claude-mem-live','archify-live','ocr-live','security-review'];
export function verifyAcceptancePacket(packet){
 if(!packet||typeof packet!=='object'||Array.isArray(packet)||packet.kind!=='hak-acceptance-evidence-packet'||packet.schemaVersion!==1)throw new Error('Invalid packet');
 if(typeof packet.sha256!=='string'||!/^[a-f0-9]{64}$/.test(packet.sha256))throw new Error('Invalid digest');
 if(!Array.isArray(packet.required)||packet.required.length!==REQUIRED.length||!Array.isArray(packet.checks)||!Array.isArray(packet.connectivity)||packet.readyForProduction!==false||typeof packet.localChecksPassed!=='boolean')throw new Error('Invalid packet structure');
 if(!REQUIRED.every((id,i)=>packet.required[i]?.id===id&&['missing','pending','blocked'].includes(packet.required[i]?.status)))throw new Error('Invalid acceptance gates');
 for(const list of [packet.checks,packet.connectivity]){
  if(list.length>100||list.some(x=>!x||typeof x.id!=='string'||typeof x.status!=='string'||x.id.length>80||x.status.length>80))throw new Error('Invalid checks');
 }
 const payload={schemaVersion:1,kind:'hak-acceptance-evidence-packet',platform:packet.platform,nodeMajor:packet.nodeMajor,localChecksPassed:packet.localChecksPassed,checks:packet.checks,connectivity:packet.connectivity,required:packet.required,readyForProduction:false};
 const expected=createHash('sha256').update(JSON.stringify(payload)).digest();
 const supplied=Buffer.from(packet.sha256,'hex');
 const intact=timingSafeEqual(expected,supplied);
 return {schemaVersion:1,kind:'hak-acceptance-integrity-verification',digestMatches:intact,localChecksPassed:intact&&packet.localChecksPassed,missingOrPending:packet.required.filter(x=>x.status!=='passed').map(x=>x.id),externalExecutionVerified:false,readyForProduction:false,notice:'SHA256 only detects packet modifications. It does not authenticate its author, source computer, external services, or independent approval.'};
}
