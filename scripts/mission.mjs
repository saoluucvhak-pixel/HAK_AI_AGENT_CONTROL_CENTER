import {prepareRepoWorkflow} from '../src/orchestrator.js';

const args=process.argv.slice(2);
const offline=args.includes('--offline');
const jsonMode=args.includes('--json');

function getFlagValue(flag){
 const idx=args.indexOf(flag);
 return idx!==-1&&idx+1<args.length?args[idx+1]:null;
}

const runIdRaw=getFlagValue('--run');
const runId=runIdRaw&&/^[1-9][0-9]*$/.test(runIdRaw)?Number(runIdRaw):null;
const role=getFlagValue('--role')||'backend';
const pathsRaw=getFlagValue('--paths');
const paths=pathsRaw?pathsRaw.split(',').map(p=>p.trim()).filter(Boolean):[];

const skipValues=new Set([runIdRaw,getFlagValue('--role'),pathsRaw].filter(Boolean));
const positional=args.filter(a=>!a.startsWith('--')&&!skipValues.has(a));
const targetRepo=positional[0]||'saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER';
const workflowMode=positional[1]||'fix-and-verify';
const query=positional.slice(2).join(' ')||'';

const wf=await prepareRepoWorkflow({
 targetRepo,
 workflowMode,
 role,
 runId,
 paths,
 query,
 includeRemoteSkills:!offline
});

if(jsonMode){
 console.log(JSON.stringify({
  targetRepo:wf.targetRepo,
  workflowMode:wf.workflowMode,
  recommendedRoles:wf.recommendedRoles,
  skills:wf.skills.map(s=>({name:s.name,source:s.source})),
  ciTriage:wf.ciTriage,
  missionPrompt:wf.missionPrompt
 },null,2));
}else{
 console.log(wf.missionPrompt);
}
