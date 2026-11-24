import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSkillMarkdown,findSkills,fetchGithubSkillsIndex,fetchGithubSkill} from '../src/skills-registry.js';

test('parseSkillMarkdown extracts frontmatter, body, and sha256',()=>{
 const parsed=parseSkillMarkdown('---\nname: find-skills\ndescription: "Discover skills"\n---\n\n# Find Skills\nRun npx skills find.',{source:'github:vercel-labs/skills'});
 assert.equal(parsed.name,'find-skills');
 assert.equal(parsed.description,'Discover skills');
 assert.match(parsed.body,/Run npx skills find/);
 assert.match(parsed.sha256,/^[a-f0-9]{64}$/);
});

test('findSkills ranks keyword and role matches',()=>{
 const skills=[
  {name:'hak-ui-designer',description:'Design UI',body:'',source:'github:saoluucvhak-pixel/HAK_AI_SKILLS'},
  {name:'hak-code-auditor',description:'Audit code quality and tests',body:'',source:'github:saoluucvhak-pixel/HAK_AI_SKILLS'},
  {name:'find-skills',description:'Discover agent skills',body:'',source:'github:vercel-labs/skills'}
 ];
 const byQuery=findSkills('discover skills',{skills});
 assert.equal(byQuery[0].name,'find-skills');
 const byRole=findSkills('',{role:'testing',skills});
 assert.equal(byRole[0].name,'hak-code-auditor');
});

test('fetchGithubSkillsIndex and fetchGithubSkill read mocked GitHub contents',async()=>{
 const mockFetch=async(url)=>{
  if(url.endsWith('/contents/skills')){
   return {ok:true,status:200,json:async()=>[{type:'dir',name:'find-skills',path:'skills/find-skills',html_url:'https://github.com/vercel-labs/skills/tree/main/skills/find-skills'}]};
  }
  if(url.endsWith('/contents/skills/find-skills/SKILL.md')){
   const b64=Buffer.from('---\nname: find-skills\ndescription: Discover skills\n---\n# Guide','utf8').toString('base64');
   return {ok:true,status:200,json:async()=>({type:'file',encoding:'base64',size:64,content:b64})};
  }
  return {ok:false,status:404};
 };
 const idx=await fetchGithubSkillsIndex('vercel-labs/skills',{fetchImpl:mockFetch});
 assert.equal(idx.length,1);
 assert.equal(idx[0].name,'find-skills');
 const skill=await fetchGithubSkill('vercel-labs/skills','find-skills',{fetchImpl:mockFetch});
 assert.equal(skill.name,'find-skills');
 assert.equal(skill.source,'github:vercel-labs/skills');
});
