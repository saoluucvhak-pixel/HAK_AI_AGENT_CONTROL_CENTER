import {REPOSITORIES,safeRepo} from './github.js';
export const COMPONENTS=Object.freeze([
 {id:'control',label:'HAK AI Agent Control Center',repo:'HAK_AI_AGENT_CONTROL_CENTER',status:'mvp'},
 {id:'skills',label:'HAK AI Skills',repo:'HAK_AI_SKILLS',status:'skill-catalog'},
 {id:'warehouse',label:'HAK Kho Offline',repo:'HAK_KHO_OFFLINE',status:'external-repo'},
 {id:'quality',label:'HAK Code Quality',repo:'HAK_CODE_QUALITY_TEST',status:'external-repo'},
 {id:'ocr',label:'HAK OCR Engine',repo:'HAK_OCR_ENGINE',status:'external-repo'},
 {id:'filter',label:'HAK Smart Filter',repo:'HAK_SMART_FILTER',status:'external-repo'},
 {id:'report',label:'HAK Accounting Report Standard',repo:'HAK_ACCOUNTING_REPORT_STANDARD',status:'external-repo'}
]);
export const RELATIONS=Object.freeze([
 {from:'control',to:'skills',kind:'skill-reference',verified:false},
 {from:'control',to:'warehouse',kind:'ci-review-target',verified:false},
 {from:'control',to:'quality',kind:'ci-review-target',verified:false},
 {from:'control',to:'ocr',kind:'future-telemetry',verified:false},
 {from:'skills',to:'filter',kind:'skill-guidance',verified:false},
 {from:'skills',to:'report',kind:'skill-guidance',verified:false}
]);
export function topology(snapshots=[]){
 const known=new Map(snapshots.map(s=>[s.name,s]));
 const nodes=COMPONENTS.map(c=>{safeRepo(c.repo);const s=known.get(c.repo);return {...c,github:s?.error?'unavailable':s?'observed':'not-queried',sourceUrl:'https://github.com/saoluucvhak-pixel/'+c.repo};});
 return {schemaVersion:1,kind:'hak-topology-proposal',nodes,edges:RELATIONS.map(x=>({...x})),disclaimer:'Edges are proposed conceptual relationships, NOT verified runtime calls or Archify-rendered diagrams'};
}
export function toMermaid(graph){
 const quote=s=>JSON.stringify(s).replaceAll('\\','\\\\');
 const lines=['flowchart TD'];
 for(const n of graph.nodes)lines.push('  '+n.id+'['+quote(n.label)+']');
 for(const e of graph.edges)lines.push('  '+e.from+' -->|'+e.kind+'| '+e.to);
 return lines.join('\n')+'\n';
}
