import test from 'node:test';
import assert from 'node:assert/strict';
import {executeGithubPatchProposal} from '../src/github-patch-executor.js';
const sha='a'.repeat(40),blob='b'.repeat(40),treeSha='c'.repeat(40),commitSha='d'.repeat(40);
const proposal={repository:'HAK_AI_SKILLS',runId:7,baseSha:sha,rationale:'Fix failing deterministic CI test',changes:[{path:'tests/example.test.js',expectedBlobSha:blob,newContent:'assert.ok(true);'},{path:'src/example.js',expectedBlobSha:blob,newContent:'export const ok = true;'}]};
function fake({mainSha=sha,fileSha=blob,prFails=false,repoName='saoluucvhak-pixel/HAK_AI_SKILLS',defaultBranch='main',archived=false,fileMode='100644',truncated=false}={}){
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  const method=opts.method||'GET';const body=opts.body?JSON.parse(opts.body):null;calls.push({url,method,body});
  if(prFails&&url.endsWith('/pulls'))return {ok:false,status:422};
  let data;
  if(url.includes('/actions/runs/7'))data={id:7,head_sha:sha,status:'completed',conclusion:'success'};
  else if(url.endsWith('/HAK_AI_SKILLS'))data={full_name:repoName,default_branch:defaultBranch,archived};
  else if(url.includes('/git/ref/heads/main'))data={object:{sha:mainSha}};
  else if(url.includes('/git/ref/heads/hak-fix/'))data={object:{sha:commitSha}};
  else if(url.endsWith('/git/refs'))data={ref:'refs/heads/hak-fix/test'};
  else if(url.endsWith('/git/trees'))data={sha:treeSha};
  else if(url.includes('/git/trees/')&&method==='GET')data={truncated,tree:proposal.changes.map(c=>({path:c.path,type:'blob',mode:fileMode,sha:fileSha}))};
  else if(url.endsWith('/git/commits')&&method==='POST')data={sha:commitSha};
  else if(url.includes('/git/commits/'))data={tree:{sha:treeSha}};
  else if(url.includes('/contents/'))data={type:'file',encoding:'base64',size:4,sha:fileSha,content:Buffer.from('test').toString('base64')};
  else if(url.endsWith('/pulls'))data={number:8,html_url:'https://github.com/example/pull/8'};
  return {ok:true,json:async()=>data};
 };
 return {calls,fetchImpl};
}
test('publishes two file changes in one atomic commit and opens draft PR',async()=>{
 const x=fake();const r=await executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl});
 assert.equal(r.changedFiles.length,2);assert.equal(r.draft,true);assert.deepEqual(x.calls.filter(c=>c.method!=='GET').map(c=>new URL(c.url).pathname.split('/').slice(-1)[0]),['trees','commits','refs','pulls']);
 const tree=x.calls.find(c=>c.url.endsWith('/git/trees'));assert.equal(tree.body.tree.length,2);assert.equal(x.calls.filter(c=>c.method==='PUT').length,0);
});
test('requires authorization before network',async()=>{const x=fake();await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',token:'fake',fetchImpl:x.fetchImpl}),/authorization/);assert.equal(x.calls.length,0)});
test('rejects stale base and blob without writing',async()=>{for(const cfg of [{mainSha:'e'.repeat(40)},{fileSha:'e'.repeat(40)}]){const x=fake(cfg);await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}));assert.equal(x.calls.some(c=>c.method!=='GET'),false)}});
test('reports recoverable branch after draft PR failure',async()=>{const x=fake({prFails:true});await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}),/recover manually/)});

test('main advances after commit preparation: no fix branch is published',async()=>{
 const x=fake();let mainReads=0;
 const fetchImpl=async(url,opts)=>{
  if(url.includes('/git/ref/heads/main')){
   mainReads++;
   if(mainReads===2)return {ok:true,json:async()=>({object:{sha:'e'.repeat(40)}})};
  }
  return x.fetchImpl(url,opts);
 };
 await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl}),/advanced during patch/);
 assert.equal(x.calls.some(c=>c.url.endsWith('/git/refs')),false);
 assert.equal(x.calls.some(c=>c.url.endsWith('/pulls')),false);
});
test('concurrent branch name collision does not open a PR',async()=>{
 const x=fake();
 const fetchImpl=async(url,opts)=>{
  if(url.endsWith('/git/refs')&&opts?.method==='POST')return {ok:false,status:422};
  return x.fetchImpl(url,opts);
 };
 await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl}),/GitHub conflict/);
 assert.equal(x.calls.some(c=>c.url.endsWith('/pulls')),false);
});
test('branch reference drift after publication prevents PR',async()=>{
 const x=fake();
 const fetchImpl=async(url,opts)=>{
  if(url.includes('/git/ref/heads/hak-fix/'))return {ok:true,json:async()=>({object:{sha:'e'.repeat(40)}})};
  return x.fetchImpl(url,opts);
 };
 await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl}),/Dedicated branch SHA mismatch/);
 assert.equal(x.calls.some(c=>c.url.endsWith('/pulls')),false);
});
test('rejects unsafe branch names before GitHub access',async()=>{
 const x=fake();
 await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'main',authorized:true,token:'fake',fetchImpl:x.fetchImpl}),/Invalid dedicated/);
 assert.equal(x.calls.length,0);
});

test('blocks wrong repository identity or default branch before any write',async()=>{
 for(const cfg of [{repoName:'other/HAK_AI_SKILLS'},{defaultBranch:'develop'},{archived:true}]){
  const x=fake(cfg);
  await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}),/Repository identity/);
  assert.equal(x.calls.some(c=>c.method!=='GET'),false);
 }
});

test('preserves executable bit when publishing a multi-file patch',async()=>{
 const x=fake({fileMode:'100755'});
 await executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl});
 const tree=x.calls.find(c=>c.url.endsWith('/git/trees')&&c.method==='POST');
 assert.deepEqual(tree.body.tree.map(e=>e.mode),['100755','100755']);
});
test('rejects symlinks, tree mismatch and truncated trees before publishing',async()=>{
 for(const cfg of [{fileMode:'120000'},{fileSha:'e'.repeat(40)},{truncated:true}]){
  const x=fake(cfg);
  await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}));
  assert.equal(x.calls.some(c=>c.url.endsWith('/git/refs')&&c.method==='POST'),false);
 }
});

test('main advances after fix branch publication: no draft PR is created',async()=>{
 const x=fake();let mainReads=0;
 const fetchImpl=async(url,opts)=>{
  if(url.includes('/git/ref/heads/main')){
   mainReads++;
   if(mainReads===3)return {ok:true,json:async()=>({object:{sha:'e'.repeat(40)}})};
  }
  return x.fetchImpl(url,opts);
 };
 await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl}),/advanced after fix branch publication/);
 assert.equal(x.calls.some(c=>c.url.endsWith('/git/refs')&&c.method==='POST'),true);
 assert.equal(x.calls.some(c=>c.url.endsWith('/pulls')),false);
});
