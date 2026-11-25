import {prepareRepoWorkflow} from '../src/orchestrator.js';

const args=process.argv.slice(2);
const offline=args.includes('--offline');
const jsonMode=args.includes('--json');
const positional=args.filter(a=>!a.startsWith('--'));
const targetRepo=positional[0]||'saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER';
const workflowMode=positional[1]||'fix-and-verify';
const query=positional.slice(2).join(' ')||'';

const wf=await prepareRepoWorkflow({
 targetRepo,
 workflowMode,
 query,
 includeRemoteSkills:!offline
});

if(jsonMode){
 console.log(JSON.stringify({
  targetRepo:wf.targetRepo,
  workflowMode:wf.workflowMode,
  recommendedRoles:wf.recommendedRoles,
  skills:wf.skills.map(s=>({name:s.name,source:s.source})),
  missionPrompt:wf.missionPrompt
 },null,2));
}else{
 console.log(wf.missionPrompt);
}
