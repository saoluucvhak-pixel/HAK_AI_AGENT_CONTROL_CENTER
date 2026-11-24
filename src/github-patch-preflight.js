import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {githubVerifiedCiRun} from './github-ci-run-verification.js';
import {githubSourceInspection} from './github-source-inspection.js';
export async function githubPatchPreflight(proposal,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,env=process.env,extraRepos=[],allowAnyTarget=false}={}){
 const checked=validateGithubPatchProposal(proposal,{allowAnyTarget});
 const verification=await githubVerifiedCiRun(checked.repository,checked.runId,checked.baseSha,{fetchImpl,token,env,extraRepos,allowAnyTarget});
 if(!verification.verified)throw new Error('CI run SHA mismatch; patch blocked');
 if(verification.runStatus!=='completed'||verification.runConclusion!=='success')throw new Error('CI run is not completed successfully; patch blocked');
 const inspection=await githubSourceInspection(checked.repository,checked.baseSha,checked.changes.map(c=>c.path),{fetchImpl,token,env,extraRepos,allowAnyTarget});
 const files=checked.changes.map(change=>{
  const found=inspection.files.find(f=>f.path===change.path);
  const matches=found?.status==='available'&&found.blobSha===change.expectedBlobSha;
  return {path:change.path,status:found?.status??'not-found',expectedBlobSha:change.expectedBlobSha,observedBlobSha:found?.blobSha??null,matches};
 });
 return {kind:'hak-github-patch-preflight',repository:checked.repository,runId:checked.runId,baseSha:checked.baseSha,shaVerified:true,files,allPreconditionsMatch:files.every(f=>f.matches),writeAuthorized:false,branchCreated:false,prCreated:false,readyToMerge:false,notice:'This is a read-only preflight. A future writer must recheck branch HEAD and blob SHA at write time; passing preflight alone never authorizes changes.'};
}
