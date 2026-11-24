import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildCodeGenerationPrompt,
 generateAutonomousPatch,
 runSelfHealingCodeLoop
} from '../src/auto-code-generator.js';

test('auto-code-generator: builds prompt incorporating work order, files, skills, and feedback', () => {
 const prompt=buildCodeGenerationPrompt({
  workOrder:{
   id:'WO-01',
   title:'Fix subcontract backup',
   description:'Pack subcontract folder in zip',
   acceptanceCriteria:['Subcontract files restored intact']
  },
  inspectedFiles:[{path:'app/main/BackupService.js',content:'function backup(){}'}],
  loadedSkills:[{name:'hak-data-integrity',sha256:'abcdef1234567890',description:'Data integrity rules',body:'Rule: Always pack auxiliary stores.'}],
  feedback:{stage:'verification',summary:'AssertionError: subcontract/batches.json missing'}
 });

 assert.match(prompt,/Work Order: WO-01/);
 assert.match(prompt,/MANDATORY HAK ARCHITECTURE & CODE STANDARDS/);
 assert.match(prompt,/hak-data-integrity/);
 assert.match(prompt,/FILE: app\/main\/BackupService\.js/);
 assert.match(prompt,/PREVIOUS ATTEMPT FAILED VERIFICATION/);
 assert.match(prompt,/subcontract\/batches\.json missing/);
});

test('auto-code-generator: extracts structured patch and enforces code policy', async () => {
 const mockRunner=async()=>{
  return {
   answer:[
    'Here is the fix:',
    '```json',
    '{',
    '  "rationale": "Add subcontract pack loop",',
    '  "changes": [',
    '    { "path": "app/main/BackupService.js", "createNew": false, "newContent": "export function backup(){ packSubcontract(); }" }',
    '  ]',
    '}',
    '```'
   ].join('\n')
  };
 };

 const patch=await generateAutonomousPatch({
  workOrder:{id:'WO-01',title:'Test',description:'Test',acceptanceCriteria:[]},
  modelRunner:mockRunner
 });

 assert.equal(patch.rationale,'Add subcontract pack loop');
 assert.equal(patch.changes.length,1);
 assert.equal(patch.changes[0].path,'app/main/BackupService.js');
});

test('auto-code-generator: self-healing loop recovers from verification failure on retry', async () => {
 let turn=0;
 const mockRunner=async({prompt})=>{
  turn++;
  if(turn===1){
   return {
    answer:'```json\n{ "rationale": "First try with bug", "changes": [{ "path": "app/main/fix.js", "newContent": "const v = 1;" }] }\n```'
   };
  }
  // Turn 2 receives feedback
  assert.match(prompt,/PREVIOUS ATTEMPT FAILED VERIFICATION/);
  assert.match(prompt,/v must equal 2/);
  return {
   answer:'```json\n{ "rationale": "Second try fixed", "changes": [{ "path": "app/main/fix.js", "newContent": "const v = 2;" }] }\n```'
  };
 };

 const mockVerifier=async(patch)=>{
  const content=patch.changes[0].newContent;
  if(content.includes('v = 2;')) return {passed:true,summary:'All 10 tests passed'};
  return {passed:false,summary:'AssertionError: v must equal 2; received 1'};
 };

 const recordedStages=[];
 const result=await runSelfHealingCodeLoop({
  workOrder:{id:'WO-02',title:'Fix value',description:'v should be 2',acceptanceCriteria:['v === 2']},
  inspectedFiles:[{path:'app/main/fix.js',content:'const v = 0;'}],
  verifyChanges:mockVerifier,
  maxAttempts:3,
  modelRunner:mockRunner,
  onAttempt:async({attempt,stage})=>{
   recordedStages.push(`${attempt}:${stage}`);
  }
 });

 assert.equal(result.success,true);
 assert.equal(result.attempts,2);
 assert.equal(result.patch.rationale,'Second try fixed');
 assert.equal(result.history.length,2);
 assert.equal(result.history[0].passed,false);
 assert.equal(result.history[1].passed,true);
 assert.ok(recordedStages.includes('1:verifying'));
 assert.ok(recordedStages.includes('1:refining'));
 assert.ok(recordedStages.includes('2:verifying'));
 assert.ok(recordedStages.includes('2:passed'));
});

test('auto-code-generator: self-healing fails closed when maxAttempts exceeded', async () => {
 const alwaysFailingRunner=async()=>({
  answer:'```json\n{ "rationale": "Still broken", "changes": [{ "path": "app/main/broken.js", "newContent": "error" }] }\n```'
 });
 const failingVerifier=async()=>({passed:false,summary:'Persistent test failure'});

 const result=await runSelfHealingCodeLoop({
  workOrder:{id:'WO-03',title:'Failing',description:'Failing',acceptanceCriteria:[]},
  verifyChanges:failingVerifier,
  maxAttempts:2,
  modelRunner:alwaysFailingRunner
 });

 assert.equal(result.success,false);
 assert.equal(result.attempts,2);
 assert.match(result.error,/Exceeded maximum refinement attempts/);
 assert.equal(result.history.length,2);
});
