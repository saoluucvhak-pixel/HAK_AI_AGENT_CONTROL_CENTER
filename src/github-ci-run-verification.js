import {DEFAULT_OWNER,parseRepoTarget} from './github.js';
export async function githubVerifiedCiRun(name,runId,expectedSha,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,owner=DEFAULT_OWNER,allowlistedRepos=[]}={}){
 const target=parseRepoTarget(name,{owner,allowlistedRepos});
 if(!Number.isSafeInteger(runId)||runId<1)throw new Error('Invalid run ID');
 if(typeof expectedSha!=='string'||!/^[a-f0-9]{40}$/.test(expectedSha))throw new Error('Full expected commit SHA required');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetchImpl('https://api.github.com/repos/'+target.owner+'/'+target.repo+'/actions/runs/'+runId,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('GitHub HTTP '+response.status);
 const run=await response.json();
 if(!run||typeof run.head_sha!=='string'||!/^[a-f0-9]{40}$/.test(run.head_sha)||!run.id)throw new Error('Invalid GitHub run response');
 const verified=run.id===runId&&run.head_sha===expectedSha;
 return {kind:'hak-github-ci-run-sha-verification',repository:target.repo,owner:target.owner,runId,expectedSha,observedSha:run.head_sha,verified,runConclusion:run.conclusion??null,runStatus:run.status??null,source:'github-api',readyForSourceInspection:verified,notice:verified?'Run head SHA matches requested immutable source revision.':'CI run SHA mismatch; do not inspect or patch requested revision.'};
}
export async function findLatestSuccessfulCiRun(name,expectedSha,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,owner=DEFAULT_OWNER,allowlistedRepos=[],workflowNames=null}={}){
 const target=parseRepoTarget(name,{owner,allowlistedRepos});
 if(typeof expectedSha!=='string'||!/^[a-f0-9]{40}$/.test(expectedSha))throw new Error('Full expected commit SHA required');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetchImpl('https://api.github.com/repos/'+target.owner+'/'+target.repo+'/actions/runs?head_sha='+expectedSha+'&status=completed&per_page=20',{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('GitHub HTTP '+response.status);
 const data=await response.json();
 const runs=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
 const match=runs.find(r=>{
  if(!Number.isSafeInteger(r.id)||r.head_sha!==expectedSha||r.status!=='completed'||r.conclusion!=='success')return false;
  if(Array.isArray(workflowNames)&&workflowNames.length>0)return workflowNames.includes(r.name);
  return !/release|deploy|publish/i.test(r.name||'');
 });
 if(!match)throw new Error('No completed successful CI (test) run found for commit '+expectedSha);
 return {runId:match.id,name:match.name||null,headSha:match.head_sha,url:match.html_url||null};
}
