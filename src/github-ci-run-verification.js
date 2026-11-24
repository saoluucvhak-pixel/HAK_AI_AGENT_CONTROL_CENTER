import {parseRepoRef} from './github.js';
export async function githubVerifiedCiRun(name,runId,expectedSha,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,env=process.env,extraRepos=[],allowAnyTarget=false}={}){
 const ref=parseRepoRef(name,{env,extraRepos,allowAnyTarget});
 if(!Number.isSafeInteger(runId)||runId<1)throw new Error('Invalid run ID');
 if(typeof expectedSha!=='string'||!/^[a-f0-9]{40}$/.test(expectedSha))throw new Error('Full expected commit SHA required');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetchImpl('https://api.github.com/repos/'+ref.fullName+'/actions/runs/'+runId,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('GitHub HTTP '+response.status);
 const run=await response.json();
 if(!run||typeof run.head_sha!=='string'||!/^[a-f0-9]{40}$/.test(run.head_sha)||!run.id)throw new Error('Invalid GitHub run response');
 const verified=run.id===runId&&run.head_sha===expectedSha;
 return {kind:'hak-github-ci-run-sha-verification',repository:name,runId,expectedSha,observedSha:run.head_sha,verified,runConclusion:run.conclusion??null,runStatus:run.status??null,source:'github-api',readyForSourceInspection:verified,notice:verified?'Run head SHA matches requested immutable source revision.':'CI run SHA mismatch; do not inspect or patch requested revision.'};
}
