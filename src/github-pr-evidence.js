import {safeRepo} from './github.js';
const OWNER='saoluucvhak-pixel';
export async function githubPrEvidence(name,number,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 safeRepo(name);
 if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid PR number');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const root='https://api.github.com/repos/'+OWNER+'/'+name;
 async function read(path){
  const response=await fetchImpl(root+path,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('GitHub HTTP '+response.status);
  return response.json();
 }
 const pr=await read('/pulls/'+number);
 if(!pr?.head?.sha||!/^[a-f0-9]{40}$/.test(pr.head.sha))throw new Error('Invalid PR head SHA');
 const sha=pr.head.sha;
 const MAX_PAGES=10;
 const [firstChecks,firstCommits]=await Promise.all([read('/commits/'+sha+'/check-runs?per_page=100&page=1'),read('/pulls/'+number+'/commits?per_page=100&page=1')]);
 if(!Array.isArray(firstChecks?.check_runs)||!Array.isArray(firstCommits))throw new Error('Invalid GitHub evidence');
 const totalChecks=firstChecks.total_count;
 const checkRows=[...firstChecks.check_runs],commits=[...firstCommits];
 let checksIncomplete=!Number.isSafeInteger(totalChecks)||totalChecks<0||totalChecks<checkRows.length;
 let commitsIncomplete=false;
 if(!checksIncomplete){
  for(let page=2;checkRows.length<totalChecks&&page<=MAX_PAGES;page++){
   const next=await read('/commits/'+sha+'/check-runs?per_page=100&page='+page);
   if(!Array.isArray(next?.check_runs)||next.total_count!==totalChecks||next.check_runs.length===0){checksIncomplete=true;break;}
   checkRows.push(...next.check_runs);
  }
  if(checkRows.length!==totalChecks)checksIncomplete=true;
 }
 if(!checksIncomplete&&new Set(checkRows.map(c=>c.id)).size!==checkRows.length)checksIncomplete=true;
 if(firstCommits.length===100){
  for(let page=2;page<=MAX_PAGES;page++){
   const next=await read('/pulls/'+number+'/commits?per_page=100&page='+page);
   if(!Array.isArray(next)){commitsIncomplete=true;break;}
   commits.push(...next);
   if(next.length<100)break;
   if(page===MAX_PAGES)commitsIncomplete=true;
  }
 }
 if(new Set(commits.map(c=>c.sha)).size!==commits.length)commitsIncomplete=true;
 const evidenceComplete=!checksIncomplete&&!commitsIncomplete;
 const jobs=checkRows.map(c=>({name:String(c.name||'').slice(0,100),status:c.status,conclusion:c.conclusion,runId:c.check_suite?.id??null}));
 const allGreen=evidenceComplete&&jobs.length>0&&jobs.every(j=>j.status==='completed'&&j.conclusion==='success');
 return {schemaVersion:1,kind:'hak-github-pr-ci-evidence',repository:name,prNumber:number,headSha:sha,prState:pr.state,draft:pr.draft===true,commitCountObserved:commits.length,commitListTruncated:commitsIncomplete,checkListTruncated:checksIncomplete,evidenceComplete,checks:jobs,allChecksPassed:allGreen,source:'github-api',codeReviewed:false,agentExecutionVerified:false,readyToMerge:false,notice:'Check-runs are GitHub-reported status only; independent code review and approval remain required.'};
}
