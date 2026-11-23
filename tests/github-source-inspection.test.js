import test from 'node:test';
import assert from 'node:assert/strict';
import {safeSourcePath,githubSourceInspection} from '../src/github-source-inspection.js';
const sha='a'.repeat(40);
test('rejects traversal and out-of-scope paths',()=>{for(const path of ['../secret','src/../secret.js','.github/workflows/ci.yml','src/x.env','src//x.js'])assert.throws(()=>safeSourcePath(path))});
test('pins content request to full SHA and returns source',async()=>{
 const urls=[];const fetchImpl=async url=>{urls.push(url);return {ok:true,json:async()=>({type:'file',encoding:'base64',size:4,sha:'blob',content:Buffer.from('test').toString('base64')})}};
 const r=await githubSourceInspection('HAK_AI_SKILLS',sha,['src/index.js'],{fetchImpl,token:''});
 assert.match(urls[0],/ref=aaaaaaaa/);assert.equal(r.files[0].content,'test');assert.equal(r.patchGenerated,false);
});
test('missing file is reported, not guessed',async()=>{const r=await githubSourceInspection('HAK_AI_SKILLS',sha,['tests/x.test.js'],{fetchImpl:async()=>({status:404,ok:false})});assert.equal(r.files[0].status,'not-found')});
test('oversized file not returned',async()=>{const r=await githubSourceInspection('HAK_AI_SKILLS',sha,['src/large.js'],{fetchImpl:async()=>({ok:true,json:async()=>({type:'file',encoding:'base64',size:50000,content:''})})});assert.equal(r.files[0].status,'unsupported-or-too-large')});
test('requires SHA and allowlisted repository',async()=>{await assert.rejects(()=>githubSourceInspection('unknown',sha,['src/a.js']),/allowlisted/);await assert.rejects(()=>githubSourceInspection('HAK_AI_SKILLS','main',['src/a.js']),/SHA/)});
