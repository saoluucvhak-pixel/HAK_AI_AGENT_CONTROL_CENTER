import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {runOrchestratedMission} from '../src/orchestrator.js';

const specPath=process.argv[2];
if(!specPath){
 console.error('Usage: node scripts/dispatch-mission.mjs <mission-spec.json> [--publish] [--out <report.json>]');
 process.exit(2);
}
const args=process.argv.slice(3);
const publish=args.includes('--publish');
const useGitCred=args.includes('--use-git-credential');
const outIdx=args.indexOf('--out');
const outPath=outIdx>=0?args[outIdx+1]:'';
const authorized=publish&&(args.includes('--authorize-draft-pr')||process.env.HAK_AUTHORIZE_DRAFT_PR==='I_APPROVE_DRAFT_PR_ONLY');

function resolveToken(){
 if(process.env.GITHUB_TOKEN)return process.env.GITHUB_TOKEN;
 if(!useGitCred)return '';
 const out=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','ignore'],timeout:10000});
 const line=out.split(/\r?\n/).find(l=>l.startsWith('password='));
 return line?line.slice('password='.length).trim():'';
}

const token=resolveToken();
const spec=JSON.parse(readFileSync(resolve(specPath),'utf8'));
const changes=spec.changes.map(c=>({
 path:c.path,
 createNew:c.createNew===true,
 ...(c.expectedBlobSha!==undefined?{expectedBlobSha:c.expectedBlobSha}:{}),
 newContent:c.contentFile?readFileSync(resolve(c.contentFile),'utf8'):c.newContent
}));

const report=await runOrchestratedMission(
 {...spec,changes},
 {
  token,
  localSkillsDir:spec.localSkillsDir||process.env.HAK_LOCAL_SKILLS_DIR||'',
  publishDraftPr:publish,
  authorized,
  verifyChanges:async()=>{
   if(!Array.isArray(spec.verificationCommands)||spec.verificationCommands.length===0){
    if(spec.verifiedSummary&&spec.allowPreverified===true)return {passed:true,summary:String(spec.verifiedSummary)};
    throw new Error('Mission spec must define verificationCommands');
   }
   const outputs=[];
   for(const item of spec.verificationCommands){
    const cwd=item.cwd?resolve(item.cwd):process.cwd();
    execFileSync(item.cmd,item.args||[],{cwd,stdio:'pipe',encoding:'utf8',timeout:180000});
    outputs.push(`${item.cmd} ${(item.args||[]).join(' ')}`.trim());
   }
   return {passed:true,summary:`Executed ${outputs.length} check(s): ${outputs.join(' ; ')}`};
  }
 }
);

const json=JSON.stringify(report,null,2)+'\n';
if(outPath)writeFileSync(resolve(outPath),json,'utf8');
process.stdout.write(json);
