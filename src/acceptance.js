import {canMerge} from './chief-of-staff.js';
export const ACCEPTANCE=Object.freeze([
 {id:'control-runtime',label:'Dashboard and local API',evidence:'runtime-smoke',verified:true},
 {id:'observer-persistence',label:'Task Observer durable local events',evidence:'restart-smoke',verified:true},
 {id:'chief-of-staff',label:'Chief of Staff planning and merge policy',evidence:'unit-tests',verified:true},
 {id:'omniroute-contract',label:'OmniRoute local gateway protocol',evidence:'mock-http-contract',verified:true},
 {id:'omniroute-live',label:'OmniRoute real provider routing and billing',evidence:null,verified:false},
 {id:'ruflo-live',label:'Ruflo multi-agent execution',evidence:null,verified:false},
 {id:'claude-mem-live',label:'Claude-Mem real persistent memory',evidence:null,verified:false},
 {id:'archify-live',label:'Archify interactive rendering',evidence:null,verified:false},
 {id:'ocr-live',label:'OCR document accuracy with approved test dataset',evidence:null,verified:false},
 {id:'windows-desktop',label:'User Windows desktop acceptance',evidence:null,verified:false},
 {id:'security-production',label:'RBAC, secrets, retention and independent security review',evidence:null,verified:false}
]);
export function acceptanceReport({ci='unknown',review='pending',approval='pending',conflicts=true,security='unknown'}={}){
 const checks=ACCEPTANCE.map(x=>({...x,status:x.verified?'automated-evidence':'not-verified'}));
 return {schemaVersion:1,readyForProduction:checks.every(x=>x.verified)&&canMerge({ci,review,approval,conflicts,security}),checks,disclaimer:'Automated evidence is limited to local test fixtures and GitHub CI; external providers and desktop not verified'};
}
