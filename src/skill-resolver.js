import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {skillObservation} from './core.js';

const SKILL_NAME=/^(?:hak-[a-z0-9][a-z0-9-]{1,62}|archify)$/;
const MAX_SKILL_BYTES=64000;
const DEFAULT_OWNER='saoluucvhak-pixel';
const DEFAULT_SKILL_REPO='HAK_AI_SKILLS';
const EMBEDDED_SKILLS_DIR=resolve(fileURLToPath(new URL('../skills',import.meta.url)));

const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');

export function resolveDefaultSkillsDir(customDir=''){
 if(customDir&&existsSync(customDir))return customDir;
 if(existsSync(EMBEDDED_SKILLS_DIR))return EMBEDDED_SKILLS_DIR;
 const peerSkills=resolve(process.cwd(),'..','HAK_AI_SKILLS','skills');
 if(existsSync(peerSkills))return peerSkills;
 const peerRoot=resolve(process.cwd(),'..','HAK_AI_SKILLS');
 if(existsSync(peerRoot))return peerRoot;
 return null;
}

export function safeSkillName(name){
 if(typeof name!=='string'||!SKILL_NAME.test(name))throw new Error('Invalid HAK skill identifier');
 return name;
}

export function parseSkillMarkdown(expectedName,rawText){
 safeSkillName(expectedName);
 if(typeof rawText!=='string'||!rawText.trim()||Buffer.byteLength(rawText,'utf8')>MAX_SKILL_BYTES||rawText.includes('\0'))
  throw new Error('Invalid or oversized SKILL.md content');
 const match=rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
 if(!match)throw new Error('Missing SKILL.md YAML frontmatter');
 const meta={};
 for(const line of match[1].split(/\r?\n/)){
  const kv=line.match(/^([A-Za-z_-]+):\s*(.*)$/);
  if(kv)meta[kv[1]]=kv[2].replace(/^"(.*)"$/,'$1').replace(/^'(.*)'$/,'$1').trim();
 }
 if(meta.name!==expectedName)throw new Error('Skill frontmatter name mismatch');
 if(typeof meta.description!=='string'||meta.description.length<12||meta.description.length>1024)
  throw new Error('Invalid skill description');
 const body=match[2].trim();
 if(!body)throw new Error('Empty skill instruction body');
 return Object.freeze({
  name:meta.name,
  description:meta.description,
  body,
  sha256:sha256(rawText),
  bytes:Buffer.byteLength(rawText,'utf8')
 });
}

export function recommendSkillsForMission({type='bug',description='',filePaths=[]}={}){
 const text=(String(description)+' '+(Array.isArray(filePaths)?filePaths.join(' '):'')).toLowerCase();
 const selected=new Set(['hak-code-auditor']);
 if(type==='security'||/electron|preload|ipc|auth|password|token|csp/.test(text))selected.add('hak-electron-security');
 if(/backup|restore|sqlite|jsonstore|subcontract|schema|transaction|integrity|db/.test(text))selected.add('hak-data-integrity');
 if(/migration|upgrade|schema-sync|version/.test(text))selected.add('hak-migration-manager');
 if(/xlsx|excel|bkvc|report|hoa_don|pdf|uom|vat|money|ton|accounting/.test(text))selected.add('hak-accounting-report');
 if(/filter|smart-filter|popover/.test(text))selected.add('hak-smart-filter');
 if(/parent|child|master-detail|dntt|batches/.test(text))selected.add('hak-parent-child-data-model');
 if(/payroll|luong|overtime|cham-cong/.test(text))selected.add('hak-payroll-validator');
 if(/nsis|installer|release|dist|readme|phat_hanh|package\.json/.test(text))selected.add('hak-release-builder');
 if(/readme|docs\/|\.md/.test(text))selected.add('hak-vercel-writing');
 if(/ui|css|renderer|theme|contrast/.test(text))selected.add('hak-ui-designer');
 return [...selected];
}

export async function loadSkillDefinition(skillName,{localSkillsDir='',fetchImpl=fetch,token=process.env.GITHUB_TOKEN,owner=DEFAULT_OWNER,skillRepo=DEFAULT_SKILL_REPO,ref='main'}={}){
 const safeName=safeSkillName(skillName);
 if(localSkillsDir){
  let file=join(localSkillsDir,safeName,'SKILL.md');
  if(!existsSync(file))file=join(localSkillsDir,'skills',safeName,'SKILL.md');
  if(!existsSync(file))throw new Error('Skill not found in local catalog: '+safeName);
  const raw=readFileSync(file,'utf8');
  return {...parseSkillMarkdown(safeName,raw),source:'local-skill-catalog'};
 }
 if(fetchImpl===fetch&&existsSync(EMBEDDED_SKILLS_DIR)){
  let file=join(EMBEDDED_SKILLS_DIR,safeName,'SKILL.md');
  if(!existsSync(file))file=join(EMBEDDED_SKILLS_DIR,'skills',safeName,'SKILL.md');
  if(existsSync(file)){
   const raw=readFileSync(file,'utf8');
   return {...parseSkillMarkdown(safeName,raw),source:'embedded-skill-catalog'};
  }
 }
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(skillRepo)||!/^[A-Za-z0-9_./-]{1,120}$/.test(ref)||ref.includes('..'))
  throw new Error('Invalid GitHub skill catalog coordinates');
 const headers={Accept:'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 const url='https://api.github.com/repos/'+owner+'/'+skillRepo+'/contents/skills/'+safeName+'/SKILL.md?ref='+encodeURIComponent(ref);
 const response=await fetchImpl(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status===404)throw new Error('Skill not found in GitHub catalog: '+safeName);
 if(!response.ok)throw new Error('GitHub skill catalog HTTP '+response.status);
 const data=await response.json();
 if(data?.type!=='file'||data?.encoding!=='base64'||typeof data?.content!=='string')
  throw new Error('Unsupported GitHub skill payload');
 const buf=Buffer.from(data.content.replace(/\s/g,''),'base64');
 if(buf.length>MAX_SKILL_BYTES||buf.includes(0))throw new Error('Invalid or oversized GitHub skill payload');
 return {...parseSkillMarkdown(safeName,buf.toString('utf8')),blobSha:data.sha||null,source:'github-skill-catalog'};
}

export async function loadSkills(skillNames,options={}){
 if(!Array.isArray(skillNames)||skillNames.length<1||skillNames.length>12)
  throw new Error('Skill list must contain 1 to 12 skills');
 const unique=[...new Set(skillNames.map(safeSkillName))];
 if(unique.length!==skillNames.length)throw new Error('Duplicate skill requested');
 const loaded=[];
 for(const name of unique)loaded.push(await loadSkillDefinition(name,options));
 return loaded;
}

export function listLocalSkillCatalog(localSkillsDir=''){
 const target=resolveDefaultSkillsDir(localSkillsDir);
 if(!target||!existsSync(target))
  throw new Error('Local skills directory unavailable');
 const dir=existsSync(join(target,'skills'))&&!readdirSync(target).some(d=>SKILL_NAME.test(d))?join(target,'skills'):target;
 const dirs=readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()&&SKILL_NAME.test(d.name)).map(d=>d.name).sort();
 return dirs.map(name=>{
  const parsed=parseSkillMarkdown(name,readFileSync(join(dir,name,'SKILL.md'),'utf8'));
  return {name:parsed.name,description:parsed.description,sha256:parsed.sha256,bytes:parsed.bytes};
 });
}

export function buildSkillObservations(loadedSkills,problemSummary,proposalSummary){
 if(!Array.isArray(loadedSkills)||loadedSkills.length===0)throw new Error('Loaded skills required for observation');
 return loadedSkills.map(s=>skillObservation({
  skill:s.name,
  problem:problemSummary,
  proposal:`[${s.name}@${s.sha256.slice(0,12)}] ${proposalSummary}`.slice(0,2000)
 }));
}

export function formatSkillsForPrompt(loadedSkills,{maxCharsPerSkill=2500}={}){
 if(!Array.isArray(loadedSkills)||loadedSkills.length===0)return '';
 return loadedSkills.map(s=>{
  const excerpt=s.body.length>maxCharsPerSkill?s.body.slice(0,maxCharsPerSkill)+'\n...[truncated]':s.body;
  return `### Skill: ${s.name} (sha256:${s.sha256.slice(0,12)})\nDescription: ${s.description}\n${excerpt}`;
 }).join('\n\n');
}
