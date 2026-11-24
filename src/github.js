export const REPOSITORIES=Object.freeze(['HAK_AI_AGENT_CONTROL_CENTER','HAK_AI_SKILLS','HAK_KHO_OFFLINE','HAK_CODE_QUALITY_TEST','HAK_OCR_ENGINE','HAK_SMART_FILTER','HAK_ACCOUNTING_REPORT_STANDARD']);
const OWNER='saoluucvhak-pixel';
export function safeRepo(name){if(!REPOSITORIES.includes(name))throw new Error('Repository not allowlisted');return name;}
export async function githubSnapshot(name,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 safeRepo(name);
 const headers={'Accept':'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 async function read(path){
  const response=await fetchImpl('https://api.github.com/repos/'+OWNER+'/'+name+path,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok){
   const remaining=response.headers?.get?.('x-ratelimit-remaining');
   if(response.status===403&&remaining==='0')throw new Error('GitHub API rate limit exhausted (HTTP 403); wait for reset or configure GITHUB_TOKEN');
   throw new Error('GitHub HTTP '+response.status);
  }
  return response.json();
 }
 const [repo,prs,runs]=await Promise.all([read(''),read('/pulls?state=open&per_page=30'),read('/actions/runs?per_page=10')]);
 const latest=runs.workflow_runs?.[0];
 return {name,visibility:repo.private?'private':'public',defaultBranch:repo.default_branch,openPullRequests:prs.length,openPullRequestsCountIsLowerBound:prs.length===30,prs:prs.map(p=>({number:p.number,title:p.title,draft:p.draft,url:p.html_url,updatedAt:p.updated_at})),latestRun:latest?{id:latest.id,name:latest.name,status:latest.status,conclusion:latest.conclusion,url:latest.html_url,createdAt:latest.created_at}:null,observedAt:new Date().toISOString(),source:'github-api'};
}
export async function snapshots(options={}){
 return Promise.all(REPOSITORIES.map(async name=>{try{return await githubSnapshot(name,options)}catch(e){return{name,error:String(e.message||e),source:'github-api',observedAt:new Date().toISOString()}}}));
}
