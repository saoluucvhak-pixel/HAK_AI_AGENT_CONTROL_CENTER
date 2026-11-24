import {extractStructuredPatchFromAnswer} from './agent-engine.js';
import {formatSkillsForPrompt} from './skill-resolver.js';
import {assertCodePolicy} from './code-policy-guard.js';
import {routeModel} from './integrations.js';

export function buildCodeGenerationPrompt({
 workOrder,
 inspectedFiles=[],
 loadedSkills=[],
 feedback=null
}={}){
 if(!workOrder||typeof workOrder!=='object')throw new Error('Valid workOrder required');

 const skillBlock=Array.isArray(loadedSkills)&&loadedSkills.length>0
  ?'\n\n### MANDATORY HAK ARCHITECTURE & CODE STANDARDS:\n'+formatSkillsForPrompt(loadedSkills,{maxCharsPerSkill:2000})
  :'';

 const fileBlocks=Array.isArray(inspectedFiles)&&inspectedFiles.length>0
  ?inspectedFiles.map(f=>{
    const body=typeof f.content==='string'?f.content.slice(0,12000):'(New file to be created)';
    return `--- FILE: ${f.path} ---\n${body}\n--- END FILE ---`;
   }).join('\n\n')
  :'(No source files pre-loaded)';

 let feedbackBlock='';
 if(feedback){
  feedbackBlock=`\n\n### PREVIOUS ATTEMPT FAILED VERIFICATION:\nError Stage: ${feedback.stage||'testing'}\nFailure Summary:\n${feedback.summary||'Unspecified test or lint failure'}\n\nTask Observer Instruction: Analyze the root cause of the error above using hak-code-auditor standards and produce a corrected patch that resolves the issue while keeping all existing passing behavior intact.`;
 }

 return [
  'You are the HAK Autonomous Senior Code Engineer & Auditor.',
  `Work Order: ${workOrder.id} - ${workOrder.title}`,
  `Description: ${workOrder.description}`,
  `Acceptance Criteria:`,
  ...(Array.isArray(workOrder.acceptanceCriteria)?workOrder.acceptanceCriteria.map(c=>'- '+c):['- Return clean, reviewable, bug-free production code']),
  skillBlock,
  '\n### CURRENT REPOSITORY SOURCE CODE:',
  fileBlocks,
  feedbackBlock,
  '\n### INSTRUCTIONS:',
  '1. Deliver the fix or feature by providing complete new content for each modified or created file.',
  '2. Output your response strictly as a JSON block inside triple backticks (```json ... ```).',
  '3. The JSON must follow this exact schema:',
  '{',
  '  "rationale": "Clear technical rationale explaining the fix and verified criteria",',
  '  "changes": [',
  '    {',
  '      "path": "path/to/file.ext",',
  '      "createNew": false,',
  '      "newContent": "FULL_UPDATED_FILE_CONTENT_HERE"',
  '    }',
  '  ]',
  '}',
  '4. Do not include markdown or explanations outside the JSON block.'
 ].join('\n');
}

export async function generateAutonomousPatch({
 workOrder,
 inspectedFiles=[],
 loadedSkills=[],
 feedback=null,
 modelRunner=routeModel,
 env=process.env
}={}){
 const prompt=buildCodeGenerationPrompt({workOrder,inspectedFiles,loadedSkills,feedback});
 const response=await modelRunner({role:'coder',sensitive:false,prompt},{env});
 if(!response||typeof response.answer!=='string'||!response.answer.trim())
  throw new Error('Empty or invalid response from code generation model');

 const extracted=extractStructuredPatchFromAnswer(response.answer);
 assertCodePolicy(extracted.changes);
 return extracted;
}

export async function runSelfHealingCodeLoop({
 workOrder,
 inspectedFiles=[],
 loadedSkills=[],
 verifyChanges,
 maxAttempts=3,
 modelRunner=routeModel,
 onAttempt=async()=>{},
 env=process.env
}={}){
 if(typeof verifyChanges!=='function')throw new Error('Executable verifyChanges callback required');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw new Error('maxAttempts must be between 1 and 5');

 let currentFeedback=null;
 let lastPatch=null;
 let lastVerification=null;
 const history=[];

 for(let attempt=1;attempt<=maxAttempts;attempt++){
  await onAttempt({attempt,stage:'generating',feedback:currentFeedback});
  
  let patch;
  try{
   patch=await generateAutonomousPatch({
    workOrder,
    inspectedFiles,
    loadedSkills,
    feedback:currentFeedback,
    modelRunner,
    env
   });
   lastPatch=patch;
  }catch(genErr){
   await onAttempt({attempt,stage:'generation-failed',error:genErr.message});
   return {
    success:false,
    attempts:attempt,
    lastPatch:null,
    verification:null,
    error:`Patch generation failed at attempt ${attempt}: ${genErr.message}`,
    history
   };
  }

  await onAttempt({attempt,stage:'verifying',patch});
  let verification;
  try{
   verification=await verifyChanges(patch);
   lastVerification=verification;
  }catch(verErr){
   verification={passed:false,summary:verErr.message,output:verErr.stack||verErr.message};
   lastVerification=verification;
  }

  history.push({attempt,rationale:patch.rationale,passed:verification.passed===true,summary:verification.summary});

  if(verification&&verification.passed===true){
   await onAttempt({attempt,stage:'passed',patch,verification});
   return {
    success:true,
    attempts:attempt,
    patch,
    verification,
    history
   };
  }

  // Failed this attempt: prepare feedback for self-healing in next attempt
  currentFeedback={
   stage:'verification',
   summary:verification?.summary||'Tests or linters failed',
   output:verification?.output||''
  };
  await onAttempt({attempt,stage:'refining',feedback:currentFeedback});
 }

 return {
  success:false,
  attempts:maxAttempts,
  lastPatch,
  verification:lastVerification,
  error:`Exceeded maximum refinement attempts (${maxAttempts}) without passing verification`,
  history
 };
}
