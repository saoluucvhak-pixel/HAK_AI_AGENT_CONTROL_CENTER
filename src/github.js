import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const DEFAULT_OWNER='saoluucvhak-pixel';
export const REPOSITORIES=Object.freeze(['HAK_AI_AGENT_CONTROL_CENTER','HAK_AI_SKILLS','HAK_KHO_OFFLINE','HAK_CODE_QUALITY_TEST','HAK_OCR_ENGINE','HAK_SMART_FILTER','HAK_ACCOUNTING_REPORT_STANDARD']);
const REPO_SLUG=/^[A-Za-z0-9_.-]{1,100}$/;
const CONFIG_PATH=fileURLToPath(new URL('../config/repos.json',import.meta.url));

function readRepoConfig(){
 try{
  const parsed=JSON.parse(readFileSync(CONFIG_PATH,'utf8'));
  return parsed&&typeof parsed==='object'?parsed:{};
 }catch{
  return {};
 }
}

function normalizeEntry(entry,defaultOwner=DEFAULT_OWNER){
 if(typeof entry!=='string')return null;
 const trimmed=entry.trim();
 if(!trimmed)return null;
 const parts=trimmed.split('/');
 if(parts.length===1&&REPO_SLUG.test(parts[0]))return {owner:defaultOwner,repo:parts[0],fullName:defaultOwner+'/'+parts[0]};
 if(parts.length===2&&REPO_SLUG.test(parts[0])&&REPO_SLUG.test(parts[1]))return {owner:parts[0],repo:parts[1],fullName:parts[0]+'/'+parts[1]};
 return null;
}

export function getAllowedRepositories({env=process.env,extraRepos=[]}={}){
 const config=readRepoConfig();
 const defaultOwner=typeof config.defaultOwner==='string'&&REPO_SLUG.test(config.defaultOwner)?config.defaultOwner:DEFAULT_OWNER;
 const raw=[...REPOSITORIES,...(Array.isArray(config.repositories)?config.repositories:[]),...(Array.isArray(config.skillRepositories)?config.skillRepositories:[])];
 if(typeof env?.HAK_ALLOWED_REPOS==='string'&&env.HAK_ALLOWED_REPOS.trim()){
  raw.push(...env.HAK_ALLOWED_REPOS.split(','));
 }
 if(Array.isArray(extraRepos))raw.push(...extraRepos);
 const seen=new Map();
 for(const item of raw){
  const parsed=normalizeEntry(item,defaultOwner);
  if(parsed&&!seen.has(parsed.fullName))seen.set(parsed.fullName,parsed);
 }
 return [...seen.values()];
}

export function getSkillRepositories(){
 const config=readRepoConfig();
 const defaultOwner=typeof config.defaultOwner==='string'&&REPO_SLUG.test(config.defaultOwner)?config.defaultOwner:DEFAULT_OWNER;
 const raw=Array.isArray(config.skillRepositories)?config.skillRepositories:['saoluucvhak-pixel/HAK_AI_SKILLS','vercel-labs/skills'];
 return raw.map(item=>normalizeEntry(item,defaultOwner)).filter(Boolean);
}

export function parseRepoRef(name,options={}){
 const parsed=normalizeEntry(name,DEFAULT_OWNER);
 if(!parsed)throw new Error('Repository not allowlisted');
 const allowed=getAllowedRepositories(options);
 const match=allowed.find(entry=>entry.fullName===parsed.fullName);
 if(!match)throw new Error('Repository not allowlisted');
 return match;
}

export function safeRepo(name,options={}){
 return parseRepoRef(name,options).repo;
}

export async function githubSnapshot(name,{fetchImpl=fetch,token=process.env.GITHUB_TOKEN,env=process.env,extraRepos=[]}={}){
 const ref=parseRepoRef(name,{env,extraRepos});
 const headers={'Accept':'application/vnd.github+json','User-Agent':'HAK-Operations-Dashboard'};
 if(token)headers.Authorization='Bearer '+token;
 async function read(path){
  const response=await fetchImpl('https://api.github.com/repos/'+ref.fullName+path,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok){
   const remaining=response.headers?.get?.('x-ratelimit-remaining');
   if(response.status===403&&remaining==='0')throw new Error('GitHub API rate limit exhausted (HTTP 403); wait for reset or configure GITHUB_TOKEN');
   throw new Error('GitHub HTTP '+response.status);
  }
  return response.json();
 }
 const [repo,prs,runs]=await Promise.all([read(''),read('/pulls?state=open&per_page=30'),read('/actions/runs?per_page=10')]);
 const latest=runs.workflow_runs?.[0];
 return {name:ref.repo,fullName:ref.fullName,visibility:repo.private?'private':'public',defaultBranch:repo.default_branch,openPullRequests:prs.length,openPullRequestsCountIsLowerBound:prs.length===30,prs:prs.map(p=>({number:p.number,title:p.title,draft:p.draft,url:p.html_url,updatedAt:p.updated_at})),latestRun:latest?{id:latest.id,name:latest.name,status:latest.status,conclusion:latest.conclusion,url:latest.html_url,createdAt:latest.created_at}:null,observedAt:new Date().toISOString(),source:'github-api'};
}

export async function snapshots(options={}){
 return Promise.all(REPOSITORIES.map(async name=>{try{return await githubSnapshot(name,options)}catch(e){return{name,error:String(e.message||e),source:'github-api',observedAt:new Date().toISOString()}}}));
}
