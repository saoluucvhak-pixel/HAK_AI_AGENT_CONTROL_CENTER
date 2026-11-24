import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {githubPatchPreflight} from './github-patch-preflight.js';
import {parseRepoRef} from './github.js';
const SHA=/^[a-f0-9]{40}$/;
function safeBranch(name){if(typeof name!=='string'||!/^hak-fix\/[a-z0-9][a-z0-9-]{2,50}$/.test(name))throw new Error('Invalid dedicated fix branch');return name;}
export async function executeGithubPatchProposal(proposal,{branch,authorized=false,fetchImpl=fetch,token=process.env.GITHUB_TOKEN,env=process.env,extraRepos=[],allowAnyTarget=false}={}){
 const p=validateGithubPatchProposal(proposal,{allowAnyTarget});
 const ref=parseRepoRef(p.repository,{env,extraRepos,allowAnyTarget});
 safeBranch(branch);
 if(authorized!==true)throw new Error('Explicit write authorization required');
 if(typeof token!=='string'||!token)throw new Error('GitHub token required for writes');
 const pre=await githubPatchPreflight(p,{fetchImpl,token,env,extraRepos,allowAnyTarget});
 if(!pre.allPreconditionsMatch)throw new Error('Patch preflight failed');
 const root='https://api.github.com/repos/'+ref.fullName;
 const headers={Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'HAK-Operations-Dashboard',Authorization:'Bearer '+token};
 async function request(path,method='GET',body){
  const r=await fetchImpl(root+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(12000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){if(r.status===409||r.status===422)throw new Error('GitHub conflict; branch or file changed');throw new Error('GitHub HTTP '+r.status);}
  return r.json();
 }
 const target=await request('');
 if(target?.full_name!==ref.fullName||target?.default_branch!=='main'||target?.archived===true||target?.disabled===true)throw new Error('Repository identity, default branch or writable state mismatch; patch blocked');
 const base=await request('/git/ref/heads/main');
 if(!SHA.test(base?.object?.sha||'')||base.object.sha!==p.baseSha)throw new Error('Default branch advanced; refresh proposal');
 // Re-read every file immediately before preparing the tree.
 for(const change of p.changes){
  const current=await request('/contents/'+change.path+'?ref='+p.baseSha);
  if(current?.sha!==change.expectedBlobSha)throw new Error('Source blob changed; patch blocked');
 }
 const baseCommit=await request('/git/commits/'+p.baseSha);
 if(!SHA.test(baseCommit?.tree?.sha||''))throw new Error('Invalid base tree');
 // Preserve each existing file mode. Never silently strip executable bits or replace symlinks/submodules.
 const originalTree=await request('/git/trees/'+baseCommit.tree.sha+'?recursive=1');
 if(originalTree?.truncated!==false||!Array.isArray(originalTree.tree))throw new Error('Cannot verify complete source tree; patch blocked');
 const originalFiles=new Map(originalTree.tree.filter(e=>e.type==='blob').map(e=>[e.path,e]));
 const entries=p.changes.map(c=>{
  const original=originalFiles.get(c.path);
  if(!original||original.sha!==c.expectedBlobSha||!['100644','100755'].includes(original.mode))throw new Error('Source tree blob or file mode mismatch; patch blocked');
  return {path:c.path,mode:original.mode,type:'blob',content:c.newContent};
 });
 // Prepare the entire new tree and commit without moving any branch ref.
 const tree=await request('/git/trees','POST',{base_tree:baseCommit.tree.sha,tree:entries});
 if(!SHA.test(tree?.sha||''))throw new Error('Invalid generated tree');
 const commit=await request('/git/commits','POST',{message:'fix: '+p.rationale.slice(0,70),tree:tree.sha,parents:[p.baseSha]});
 if(!SHA.test(commit?.sha||''))throw new Error('Invalid generated commit');
 // A single ref creation publishes all file changes atomically; no partial file PUTs.
 const baseAgain=await request('/git/ref/heads/main');
 if(baseAgain?.object?.sha!==p.baseSha)throw new Error('Default branch advanced during patch; no fix branch published');
 await request('/git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
 const branchRef=await request('/git/ref/heads/'+branch);
 if(branchRef?.object?.sha!==commit.sha)throw new Error('Dedicated branch SHA mismatch; manual recovery required');
 const publishedBase=await request('/git/ref/heads/main');
 if(publishedBase?.object?.sha!==p.baseSha)throw new Error('Default branch advanced after fix branch publication; branch requires manual recovery; no PR created');
 // Draft PR: never auto-merge; on PR failure branch remains available for recovery.
 let pr;
 try{
  pr=await request('/pulls','POST',{title:'fix: '+p.rationale.slice(0,70),head:branch,base:'main',draft:true,body:'CI run: '+p.runId+'\nOriginal commit: '+p.baseSha+'\nChanged files: '+p.changes.map(c=>c.path).join(', ')+'\n\n'+p.rationale+'\n\nRequires human review and passing CI. Generated from untrusted CI evidence; verify independently.'});
 }catch(error){throw new Error('Patch branch '+branch+' created at '+commit.sha+' but draft PR failed; recover manually: '+error.message);}
 if(!Number.isSafeInteger(pr?.number)||typeof pr?.html_url!=='string')throw new Error('Patch branch '+branch+' created but PR response invalid; manual recovery required');
 return {kind:'hak-github-patch-execution',repository:p.repository,branch,commitSha:commit.sha,changedFiles:p.changes.map(c=>c.path),prNumber:pr.number,prUrl:pr.html_url,draft:true,requiresHumanReview:true,ciVerified:false,readyToMerge:false};
}
