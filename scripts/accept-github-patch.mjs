import {executeGithubPatchProposal} from '../src/github-patch-executor.js';
import {githubPatchRecovery} from '../src/github-patch-recovery.js';
import {readFile} from 'node:fs/promises';
import {githubVerifiedCiRun} from '../src/github-ci-run-verification.js';
const file=process.argv[2],branch=process.argv[3];
if(!file||!branch){console.error('Usage: node scripts/accept-github-patch.mjs <proposal.json> <hak-fix/branch>');process.exitCode=2;}
else {
 try {
  const proposal=JSON.parse(await readFile(file,'utf8'));
  if(process.env.HAK_PATCH_ACCEPTANCE!=='I_ACKNOWLEDGE_GITHUB_WRITES')throw new Error('Set HAK_PATCH_ACCEPTANCE=I_ACKNOWLEDGE_GITHUB_WRITES to authorize real GitHub writes');
  if(proposal.repository!=='HAK_AI_AGENT_CONTROL_CENTER')throw new Error('Acceptance restricted to HAK_AI_AGENT_CONTROL_CENTER');
  if(!/^hak-fix\/acceptance-[a-z0-9][a-z0-9-]{2,35}$/.test(branch))throw new Error('Acceptance branch must use a valid hak-fix/acceptance- prefix');
  if(proposal.changes?.length!==1||proposal.changes[0]?.path!=='tests/fixtures/patch-acceptance.txt')throw new Error('Live acceptance is restricted to one isolated fixture file');
  const ci=await githubVerifiedCiRun(proposal.repository,proposal.runId,proposal.baseSha);
  if(!ci.verified||ci.runStatus!=='completed'||ci.runConclusion!=='success')throw new Error('Live acceptance requires successful completed CI for the exact base SHA');
  const result=await executeGithubPatchProposal(proposal,{branch,authorized:true});
  const recovery=await githubPatchRecovery(proposal.repository,branch,result.commitSha);
  if(!recovery.matchingCommit||!recovery.prFound||recovery.prNumber!==result.prNumber||recovery.prState!=='open')throw new Error('GitHub post-write verification failed');
  console.log(JSON.stringify({status:'verified',...result,recovery},null,2));
 }catch(error){console.error('Acceptance failed:',error.message);process.exitCode=1;}
}
