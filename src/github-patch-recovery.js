import {DEFAULT_OWNER,parseRepoTarget} from './github.js';
const SHA=/^[a-f0-9]{40}$/;
export async function githubPatchRecovery(name,branch,expectedCommitSha,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,owner=DEFAULT_OWNER,allowlistedRepos=[]}={}){
 const target=parseRepoTarget(name,{owner,allowlistedRepos});
 if(typeof branch!=='string'||!/^hak-fix\/[a-z0-9][a-z0-9-]{2,50}$/.test(branch))throw new Error('Invalid fix branch');
 if(typeof expectedCommitSha!=='string'||!SHA.test(expectedCommitSha))throw new Error('Full expected commit SHA required');
 const root='https://api.github.com/repos/'+target.owner+'/'+target.repo;
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 async function read(path){
  const r=await fetchImpl(root+path,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(r.status===404)return null;
  if(!r.ok)throw new Error('GitHub HTTP '+r.status);
  return r.json();
 }
 const ref=await read('/git/ref/heads/'+branch);
 if(!ref)return {kind:'hak-github-patch-recovery',repository:target.repo,owner:target.owner,branch,branchExists:false,expectedCommitSha,matchingCommit:false,prFound:false,nextAction:'Investigate branch creation failure; do not retry blindly.',writeAuthorized:false};
 const observedSha=ref.object?.sha??null;
 if(observedSha!==expectedCommitSha)return {kind:'hak-github-patch-recovery',repository:target.repo,owner:target.owner,branch,branchExists:true,observedSha,expectedCommitSha,matchingCommit:false,prFound:false,nextAction:'Branch head differs from expected commit. Stop and review manually.',writeAuthorized:false};
 const prs=await read('/pulls?state=all&head='+encodeURIComponent(target.owner+':'+branch)+'&per_page=100');
 if(!Array.isArray(prs))throw new Error('Invalid pull request response');
 const matching=prs.find(pr=>pr.head?.sha===expectedCommitSha&&pr.head?.ref===branch);
 return {kind:'hak-github-patch-recovery',repository:target.repo,owner:target.owner,branch,branchExists:true,observedSha,expectedCommitSha,matchingCommit:true,prFound:!!matching,prNumber:matching?.number??null,prUrl:matching?.html_url??null,prState:matching?.state??null,nextAction:matching?'Inspect existing PR and CI; do not create duplicate.':'Branch is intact; draft PR can be created after explicit authorization and fresh base verification.',writeAuthorized:false};
}
