import {validateGithubPatchProposal} from './github-patch-proposal.js';
import {githubPatchPreflight} from './github-patch-preflight.js';
const OWNER='saoluucvhak-pixel';
const SHA=/^[a-f0-9]{40}$/;
function safeBranch(name){if(typeof name!=='string'||!/^hak-fix\/[a-z0-9][a-z0-9-]{2,50}$/.test(name))throw new Error('Invalid dedicated fix branch');return name;}
export async function executeGithubPatchProposal(proposal,{branch,authorized=false,fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 const p=validateGithubPatchProposal(proposal);
 safeBranch(branch);
 if(authorized!==true)throw new Error('Explicit write authorization required');
 if(typeof token!=='string'||!token)throw new Error('GitHub token required for writes');
 // Phase 1 deliberately supports one file: avoid partially applied multi-file patches.
 if(p.changes.length!==1)throw new Error('Single-file patches only; atomic multi-file support pending');
 const pre=await githubPatchPreflight(p,{fetchImpl,token});
 if(!pre.allPreconditionsMatch)throw new Error('Patch preflight failed');
 const root='https://api.github.com/repos/'+OWNER+'/'+p.repository;
 const headers={Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'HAK-Operations-Dashboard',Authorization:'Bearer '+token};
 async function request(path,method='GET',body){
  const r=await fetchImpl(root+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(12000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){if(r.status===409||r.status===422)throw new Error('GitHub conflict; branch or file changed');throw new Error('GitHub HTTP '+r.status);}
  return r.json();
 }
 // Verify target branch remains on the exact reviewed base before branch creation.
 const base=await request('/git/ref/heads/main');
 if(!SHA.test(base?.object?.sha||'')||base.object.sha!==p.baseSha)throw new Error('Default branch advanced; refresh proposal');
 const change=p.changes[0];
 const current=await request('/contents/'+change.path+'?ref='+p.baseSha);
 if(current?.sha!==change.expectedBlobSha)throw new Error('Source blob changed; patch blocked');
 await request('/git/refs','POST',{ref:'refs/heads/'+branch,sha:p.baseSha});
 const branchRef=await request('/git/ref/heads/'+branch);
 if(branchRef?.object?.sha!==p.baseSha)throw new Error('Dedicated branch SHA mismatch; patch blocked');
 // GitHub contents API uses sha as compare-and-swap precondition for this file.
 const written=await request('/contents/'+change.path,'PUT',{message:'fix: '+p.rationale.slice(0,70),content:Buffer.from(change.newContent,'utf8').toString('base64'),sha:change.expectedBlobSha,branch});
 if(!SHA.test(written?.commit?.sha||''))throw new Error('GitHub write response missing commit SHA');
 // Never merge automatically. Draft PR ensures review and CI before approval.
 const pr=await request('/pulls','POST',{title:'fix: '+p.rationale.slice(0,70),head:branch,base:'main',draft:true,body:'CI run: '+p.runId+'\nOriginal commit: '+p.baseSha+'\nChanged file: '+change.path+'\n\n'+p.rationale+'\n\nRequires human review and passing CI. Generated from untrusted CI evidence; verify independently.'});
 if(!Number.isSafeInteger(pr?.number)||typeof pr?.html_url!=='string')throw new Error('Patch committed but PR response invalid; manual recovery required');
 return {kind:'hak-github-patch-execution',repository:p.repository,branch,commitSha:written.commit.sha,prNumber:pr.number,prUrl:pr.html_url,draft:true,requiresHumanReview:true,ciVerified:false,readyToMerge:false};
}
