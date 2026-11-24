import {parseRepoRef} from './github.js';
export async function githubPrEvidence(name,number,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,env=process.env,extraRepos=[]}={}){
 const ref=parseRepoRef(name,{env,extraRepos});
 if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid PR number');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const root='https://api.github.com/repos/'+ref.fullName;
 async function read(path){
  const response=await fetchImpl(root+path,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('GitHub HTTP '+response.status);
  return response.json();
 }
 const pr=await read('/pulls/'+number);
 if(!pr?.head?.sha||!/^[a-f0-9]{40}$/.test(pr.head.sha))throw new Error('Invalid PR head SHA');
 const sha=pr.head.sha;
 // Bound pagination to prevent unbounded API work. An exact full last page remains incomplete.
 async function pages(path,extract){
  const items=[];
  for(let page=1;page<=10;page++){
   const payload=await read(path+'&page='+page);
   const batch=extract(payload);
   if(!Array.isArray(batch))throw new Error('Invalid GitHub evidence');
   items.push(...batch);
   if(batch.length<100)return {items,truncated:false};
  }
  return {items,truncated:true};
 }
 const [checks,commits]=await Promise.all([
  pages('/commits/'+sha+'/check-runs?per_page=100',x=>x?.check_runs),
  pages('/pulls/'+number+'/commits?per_page=100',x=>x)
 ]);
 const jobs=checks.items.map(c=>({name:String(c.name||'').slice(0,100),status:c.status,conclusion:c.conclusion,runId:c.check_suite?.id??null}));
 const checkListTruncated=checks.truncated;
 const commitListTruncated=commits.truncated;
 // GitHub paginates these endpoints. A first page of 100 is not proof that all checks passed.
 const evidenceComplete=!checkListTruncated&&!commitListTruncated;
 const allGreen=evidenceComplete&&jobs.length>0&&jobs.every(j=>j.status==='completed'&&j.conclusion==='success');
 return {schemaVersion:1,kind:'hak-github-pr-ci-evidence',repository:name,prNumber:number,headSha:sha,prState:pr.state,draft:pr.draft===true,commitCountObserved:commits.items.length,commitListTruncated,checkListTruncated,evidenceComplete,checks:jobs,allChecksPassed:allGreen,source:'github-api',codeReviewed:false,agentExecutionVerified:false,readyToMerge:false,notice:'Check-runs are GitHub-reported status only; independent code review and approval remain required.'};
}
