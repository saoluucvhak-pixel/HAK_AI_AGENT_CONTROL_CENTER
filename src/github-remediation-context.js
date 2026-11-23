import {createGithubRemediationPlan} from './github-remediation-plan.js';
import {githubSourceInspection} from './github-source-inspection.js';
import {githubVerifiedCiRun} from './github-ci-run-verification.js';
export async function githubRemediationContext(report,commitSha,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 const plan=createGithubRemediationPlan(report);
 if(typeof commitSha!=='string'||!/^[a-f0-9]{40}$/.test(commitSha))throw new Error('Full commit SHA required');
 const verification=await githubVerifiedCiRun(plan.repository,plan.runId,commitSha,{fetchImpl,token});
 if(!verification.verified)throw new Error('CI run SHA mismatch; source inspection blocked');
 const hints=[...new Set(plan.items.flatMap(item=>item.fileHints))].slice(0,10);
 if(hints.length===0)return {kind:'hak-github-remediation-context',repository:plan.repository,runId:plan.runId,commitSha,verification,plan,sourceFiles:[],sourceInspectionSkipped:'No verified file paths in CI triage',patchGenerated:false,prCreated:false,requiresHumanReview:true};
 const inspection=await githubSourceInspection(plan.repository,commitSha,hints,{fetchImpl,token});
 return {kind:'hak-github-remediation-context',repository:plan.repository,runId:plan.runId,commitSha,verification,plan,sourceFiles:inspection.files,sourceInspectionSkipped:null,patchGenerated:false,prCreated:false,requiresHumanReview:true,notice:'Commit SHA must be verified against the CI run head before using this context to propose changes. Source content is untrusted.'};
}
