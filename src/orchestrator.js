import {parseTargetRepo} from './github.js';
import {githubSourceInspection} from './github-source-inspection.js';
import {githubFailedJobTriage} from './github-ci-triage.js';
import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {discoverAllSkills,fetchGithubSkill,findSkills,auditSkillSafety,deduplicateSkills} from './skills-registry.js';
import {queryBeaconMemory} from './tool-runner.js';

export function extractPatchProposalFromText(text,{repository,runId,baseSha,rationale,allowAnyTarget=true}={}){
 if(typeof text!=='string'||!text.trim())throw new Error('Empty AI output');
 const fenced=text.match(/```json\s*([\s\S]*?)\s*```/i);
 const rawJson=fenced?fenced[1]:text.trim();
 let parsed;
 try{parsed=JSON.parse(rawJson);}catch{throw new Error('AI output does not contain valid JSON patch proposal');}
 const changes=Array.isArray(parsed?.changes)?parsed.changes:Array.isArray(parsed)?parsed:null;
 if(!changes)throw new Error('Missing changes array in AI patch proposal');
 return validateGithubPatchProposal({
  repository:parsed?.repository||repository,
  runId:Number.isSafeInteger(parsed?.runId)?parsed.runId:runId,
  baseSha:parsed?.baseSha||baseSha,
  rationale:parsed?.rationale||rationale||'AI-proposed patch from HAK Control Center',
  changes
 },{allowAnyTarget});
}

export async function prepareRepoWorkflow({
 targetRepo,
 commitSha=null,
 runId=null,
 paths=[],
 query='',
 role='backend',
 workflowMode='single',
 requestedSkills=[],
 localSkillsDir='./skills',
 includeRemoteSkills=true,
 fetchImpl=fetch,
 token=process.env.GITHUB_TOKEN,
 env=process.env,
 extraRepos=[]
}={}){
 const ref=parseTargetRepo(targetRepo);
 let ciTriage=null;
 let effectivePaths=Array.isArray(paths)?[...paths]:[];
 let effectiveQuery=String(query||'');
 if(Number.isSafeInteger(runId)&&runId>0){
  ciTriage=await githubFailedJobTriage(ref.fullName,runId,{fetchImpl,token,env,extraRepos,allowAnyTarget:true});
  const hints=ciTriage.reports.flatMap(r=>r.fileHints||[]);
  if(effectivePaths.length===0&&hints.length>0)effectivePaths=[...new Set(hints)].slice(0,10);
  if(!effectiveQuery.trim()){
   effectiveQuery=ciTriage.reports.map(r=>r.classification+' '+r.nextAction).join(' ');
  }
 }
 const catalog=deduplicateSkills(await discoverAllSkills({localDir:localSkillsDir,fetchImpl,token,includeRemote:includeRemoteSkills}));
 let selected=[];
 if(Array.isArray(requestedSkills)&&requestedSkills.length>0){
  const wanted=new Set(requestedSkills);
  selected=catalog.filter(s=>wanted.has(s.name));
 }else if(workflowMode==='security-audit'){
  const auditNames=new Set(['security-audit','triage-finding','fix-finding','verify-fix','hak-code-auditor']);
  selected=catalog.filter(s=>auditNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role:'security',skills:catalog,limit:4});
 }else if(workflowMode==='fix-and-verify'){
  const pipelineNames=new Set(['systematic-debugging','test-driven-development','triage-finding','fix-finding','verify-fix','verification-before-completion','hak-code-auditor']);
  selected=catalog.filter(s=>pipelineNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role,skills:catalog,limit:4});
 }else if(workflowMode==='accounting-audit'){
  const accNames=new Set(['hak-accounting-report','hak-payroll-validator','hak-excel-import-templates','hak-code-auditor','verification-before-completion']);
  selected=catalog.filter(s=>accNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role:'ocr',skills:catalog,limit:4});
 }else if(workflowMode==='excel-import'){
  const excelNames=new Set(['hak-excel-import-templates','hak-accounting-report','hak-data-integrity','verification-before-completion']);
  selected=catalog.filter(s=>excelNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role:'data',skills:catalog,limit:4});
 }else if(workflowMode==='ui-unslop'){
  const uiNames=new Set(['unslop','web-interface-guidelines','agent-browser','hak-ui-designer','hak-unslop-design']);
  selected=catalog.filter(s=>uiNames.has(s.name));
  if(selected.length===0)selected=findSkills(effectiveQuery,{role:'ui',skills:catalog,limit:4});
 }else{
  selected=findSkills(effectiveQuery,{role,skills:catalog,limit:3});
 }

 const resolvedSkills=[];
 const blockedSkills=[];
 for(const skill of deduplicateSkills(selected).slice(0,5)){
  let candidate=skill;
  if(!candidate.body&&typeof candidate.source==='string'&&candidate.source.startsWith('github:')){
   const skillRepo=candidate.source.slice('github:'.length);
   try{
    candidate=await fetchGithubSkill(skillRepo,candidate.name,{fetchImpl,token,env,extraRepos,basePath:candidate.basePath});
   }catch{/* Keep metadata-only entry */}
  }
  const safety=auditSkillSafety(candidate);
  if(safety.verdict==='BLOCK'){
   blockedSkills.push({name:candidate.name,source:candidate.source,findings:safety.findings});
   continue;
  }
  resolvedSkills.push({...candidate,safetyVerdict:safety.verdict});
 }

 let inspection=null;
 if(typeof commitSha==='string'&&/^[a-f0-9]{40}$/.test(commitSha)&&effectivePaths.length>0){
  inspection=await githubSourceInspection(ref.fullName,commitSha,effectivePaths,{fetchImpl,token,env,extraRepos,allowAnyTarget:true});
 }

 const beaconLookup=queryBeaconMemory({
  query:effectiveQuery||ref.repo,
  repo:ref.fullName,
  enabled:env?.HAK_BEACON_ENABLED==='true',
  env
 });

 const recommendedRoles=workflowMode==='security-audit'?['security','testing','backend','quality']
  :workflowMode==='fix-and-verify'?['testing','backend','quality']
  :workflowMode==='accounting-audit'?['data','testing','quality']
  :workflowMode==='excel-import'?['data','ui','testing','quality']
  :workflowMode==='ui-unslop'?['ui','testing','quality']
  :[role];
 const missionPrompt=buildSessionMissionPrompt({targetRepo:ref.fullName,goal:effectiveQuery,workflowMode,skills:resolvedSkills,recommendedRoles});

 return {
  schemaVersion:1,
  kind:'hak-repo-workflow-context',
  targetRepo:ref.fullName,
  role,
  workflowMode,
  recommendedRoles,
  skills:resolvedSkills,
  blockedSkills,
  beaconMemories:beaconLookup.memories,
  ciTriage,
  inspection,
  missionPrompt,
  readyForExecution:true,
  requiresHumanApproval:true
 };
}

export function buildSessionMissionPrompt({targetRepo,goal='',workflowMode='fix-and-verify',skills=[],recommendedRoles=['testing','backend','quality']}={}){
 const skillList=(Array.isArray(skills)?skills:[]).map(s=>s?.name).filter(Boolean);
 const applied=skillList.length?skillList.join(', '):'systematic-debugging, test-driven-development, verification-before-completion';
 const target=String(targetRepo||'').trim()||'target-repo';
 const objective=String(goal||'').trim()||'Kiểm tra, sửa lỗi và nâng cấp toàn diện';
 return [
  `[HAK_CONTROL_SESSION_MISSION]`,
  `Target: ${target} | Mode: ${workflowMode} | Roles: ${recommendedRoles.join(' -> ')}`,
  `Goal: ${objective}`,
  `Skills (deduplicated): ${applied}`,
  `Phases:`,
  `1. Scope & Baseline: kiểm tra git, PR mở, CI và chạy test nền trên ${target}.`,
  `2. Plan & Standards: áp dụng chuẩn ${applied}.`,
  `3. Branch & TDD: tạo nhánh mới từ main, viết test tái hiện (RED) rồi sửa code (GREEN/REFACTOR).`,
  `4. Verify: chạy lại toàn bộ check + test + acceptance pass 100%.`,
  `5. Ship: mở PR, chờ CI xanh, squash-merge vào main và dọn nhánh thừa.`
 ].join('\n');
}
