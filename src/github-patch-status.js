const OWNER='saoluucvhak-pixel',REPO='HAK_AI_AGENT_CONTROL_CENTER';
export function classifyPatchPr(pr){
 const branch=pr?.head?.ref||'';
 if(!/^hak-fix\/[a-z0-9][a-z0-9-]{2,50}$/.test(branch))return null;
 const acceptance=/^hak-fix\/acceptance-[0-9]+$/.test(branch);
 const runId=acceptance?Number(branch.slice('hak-fix/acceptance-'.length)):null;
 return {number:pr.number,title:pr.title,draft:!!pr.draft,state:pr.state,branch,headSha:pr.head.sha,url:pr.html_url,runId,kind:acceptance?'acceptance':'patch',stage:pr.state==='closed'?(pr.merged_at?'merged':'closed'):pr.draft?'review-required':'ready-for-review',nextAction:pr.state==='closed'?'No action':pr.draft?(acceptance?'Review fixture-only diff; do not merge acceptance PR':'Review patch diff and CI; human approval required'):'Confirm policy and human approval before merge'};
}
export function classifyPatchRun(run){
 const state=run.status==='completed'?(run.conclusion==='success'?'passed':run.conclusion==='failure'?'failed':'needs-attention'):['queued','in_progress','waiting','pending','requested'].includes(run.status)?'running':'unknown';
 return {id:run.id,status:state,conclusion:run.conclusion||null,url:run.html_url,sha:run.head_sha,createdAt:run.created_at,nextAction:state==='failed'?'Inspect workflow logs and use recovery for a created branch':state==='running'?'Wait for completion':state==='passed'?'Check linked Draft PR and evidence artifact':'Inspect GitHub run status manually; do not assume success'};
}
export async function githubPatchStatus({fetchImpl=fetch,token=process.env.GITHUB_TOKEN}={}){
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 async function get(path){const r=await fetchImpl('https://api.github.com/repos/'+OWNER+'/'+REPO+path,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('GitHub HTTP '+r.status);return r.json();}
 const [runs,firstPrs]=await Promise.all([get('/actions/workflows/github-patch-live-acceptance.yml/runs?per_page=10'),get('/pulls?state=all&per_page=100&page=1')]);
 if(!Array.isArray(runs?.workflow_runs)||!Array.isArray(firstPrs))throw new Error('Invalid GitHub patch status response');
 const allPrs=[...firstPrs];let complete=firstPrs.length<100;
 for(let page=2;!complete&&page<=10;page++){
  const next=await get('/pulls?state=all&per_page=100&page='+page);
  if(!Array.isArray(next))throw new Error('Invalid GitHub PR page');
  allPrs.push(...next);
  complete=next.length<100;
 }
 if(new Set(allPrs.map(p=>p.number)).size!==allPrs.length)complete=false;
 const entries=runs.workflow_runs.filter(r=>r.name==='GitHub Patch Live Acceptance (manual only)'&&r.event==='workflow_dispatch').map(classifyPatchRun);
 const patches=allPrs.map(classifyPatchPr).filter(Boolean);
 return {kind:'hak-github-patch-status',repository:OWNER+'/'+REPO,readOnly:true,complete,updatedAt:new Date().toISOString(),runs:entries,prs:patches,notice:'Acceptance fixture PRs are evidence, not production fixes. No automatic merge. PR listing is bounded; check complete flag.'};
}
