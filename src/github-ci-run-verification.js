import {safeRepo} from './github.js';
const OWNER='saoluucvhak-pixel';
export async function githubVerifiedCiRun(name,runId,expectedSha,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 safeRepo(name);
 if(!Number.isSafeInteger(runId)||runId<1)throw new Error('Invalid run ID');
 if(typeof expectedSha!=='string'||!/^[a-f0-9]{40}$/.test(expectedSha))throw new Error('Full expected commit SHA required');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetchImpl('https://api.github.com/repos/'+OWNER+'/'+name+'/actions/runs/'+runId,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('GitHub HTTP '+response.status);
 const run=await response.json();
 if(!run||typeof run.head_sha!=='string'||!/^[a-f0-9]{40}$/.test(run.head_sha)||!run.id)throw new Error('Invalid GitHub run response');
 const verified=run.id===runId&&run.head_sha===expectedSha;
 const trustedSource=run.name==='Operations Dashboard CI'&&run.event==='push'&&run.head_branch==='main'&&run.repository?.full_name===OWNER+'/'+name&&run.head_repository?.full_name===OWNER+'/'+name;
 return {kind:'hak-github-ci-run-sha-verification',repository:name,runId,expectedSha,observedSha:run.head_sha,verified,trustedSource,runConclusion:run.conclusion??null,runStatus:run.status??null,source:'github-api',readyForSourceInspection:verified&&trustedSource,notice:!verified?'CI run SHA mismatch; do not inspect or patch requested revision.':!trustedSource?'CI source provenance is not trusted; do not inspect or patch until an approved per-repository workflow policy is established.':'Run head SHA and approved CI provenance match requested source revision.'};
}
