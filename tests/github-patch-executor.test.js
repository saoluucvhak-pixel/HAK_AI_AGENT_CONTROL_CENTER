import test from 'node:test';
import assert from 'node:assert/strict';
import {executeGithubPatchProposal} from '../src/github-patch-executor.js';
const sha='a'.repeat(40),blob='b'.repeat(40),newSha='c'.repeat(40);
const proposal={repository:'HAK_AI_SKILLS',runId:7,baseSha:sha,rationale:'Fix failing deterministic CI test',changes:[{path:'tests/example.test.js',expectedBlobSha:blob,newContent:'assert.ok(true);'}]};
function fake({mainSha=sha,fileSha=blob}={}){
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET'});
  let data;
  if(url.includes('/actions/runs/7'))data={id:7,head_sha:sha};
  else if(url.includes('/git/ref/heads/main'))data={object:{sha:mainSha}};
  else if(url.includes('/git/ref/heads/hak-fix/'))data={object:{sha}};
  else if(url.includes('/git/refs'))data={ref:'refs/heads/hak-fix/test'};
  else if(url.includes('/contents/')&&opts.method==='PUT')data={commit:{sha:newSha}};
  else if(url.includes('/contents/'))data={type:'file',encoding:'base64',size:4,sha:fileSha,content:Buffer.from('test').toString('base64')};
  else if(url.includes('/pulls'))data={number:8,html_url:'https://github.com/example/pull/8'};
  return {ok:true,json:async()=>data};
 };
 return {calls,fetchImpl};
}
test('creates isolated branch, writes one file and opens draft PR',async()=>{const x=fake();const r=await executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl});assert.equal(r.draft,true);assert.equal(r.readyToMerge,false);assert.deepEqual(x.calls.filter(c=>c.method!=='GET').map(c=>c.method),['POST','PUT','POST'])});
test('requires explicit authorization and token before network',async()=>{const x=fake();await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',token:'fake',fetchImpl:x.fetchImpl}),/authorization/);assert.equal(x.calls.length,0)});
test('rejects advanced main without writing',async()=>{const x=fake({mainSha:'d'.repeat(40)});await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}),/advanced/);assert.equal(x.calls.some(c=>c.method!=='GET'),false)});
test('rejects stale blob without writing',async()=>{const x=fake({fileSha:'d'.repeat(40)});await assert.rejects(()=>executeGithubPatchProposal(proposal,{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}),/preflight/);assert.equal(x.calls.some(c=>c.method!=='GET'),false)});
test('blocks multi-file patch until atomic write support',async()=>{const x=fake();await assert.rejects(()=>executeGithubPatchProposal({...proposal,changes:[...proposal.changes,{...proposal.changes[0],path:'src/a.js'}]},{branch:'hak-fix/test',authorized:true,token:'fake',fetchImpl:x.fetchImpl}),/Single-file/);assert.equal(x.calls.length,0)});
