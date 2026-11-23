import {safeRepo} from './github.js';
import {githubFailedJobTriage} from './github-ci-triage.js';
import {githubRemediationContext} from './github-remediation-context.js';
export async function githubCiInvestigation(name,runId,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 safeRepo(name);
 if(!Number.isSafeInteger(runId)||runId<1)throw new Error('Invalid run ID');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetchImpl('https://api.github.com/repos/saoluucvhak-pixel/'+name+'/actions/runs/'+runId,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('GitHub HTTP '+response.status);
 const run=await response.json();
 if(run?.id!==runId||typeof run.head_sha!=='string'||!/^[a-f0-9]{40}$/.test(run.head_sha))throw new Error('Invalid CI run identity');
 const triage=await githubFailedJobTriage(name,runId,{fetchImpl,token});
 const context=await githubRemediationContext(triage,run.head_sha,{fetchImpl,token});
 return {kind:'hak-github-ci-investigation',repository:name,runId,headSha:run.head_sha,runStatus:run.status??null,runConclusion:run.conclusion??null,failedJobCount:triage.failedJobCount,findings:triage.reports.map(r=>({jobId:r.jobId,name:r.name,classification:r.classification,fileHints:r.fileHints,nextAction:r.nextAction})),remediationPlan:context.plan,sourceFiles:context.sourceFiles.map(f=>({path:f.path,status:f.status,bytes:f.bytes??null,blobSha:f.blobSha??null})),shaVerified:context.verification.verified,sourceInspectionSkipped:context.sourceInspectionSkipped,readOnly:true,patchGenerated:false,prCreated:false,readyToMerge:false,notice:'Source contents and CI logs are not returned. Review findings before any patch or PR operation.'};
}
