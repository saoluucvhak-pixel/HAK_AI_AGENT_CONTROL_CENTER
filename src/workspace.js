import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {existsSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runGit,runProcess,scrubbedEnv} from './safe-process.js';
import {validateEditPath,assertInsideRoot,matchesScope,PathError} from './code-paths.js';

const SHA=/^[a-f0-9]{40}$/;
const MAX_EDITS=20,MAX_FILE=100*1024,MAX_TOTAL=300*1024;
export class WorkspaceError extends Error{constructor(code,message){super(message);this.code=code;}}
function canonical(p){
 let real=p;try{real=realpathSync.native(p);}catch{/* fall back to the raw path */}
 const n=real.replace(/\\/g,'/').replace(/\/+$/,'');
 return process.platform==='win32'?n.toLowerCase():n;
}
const sha256=t=>createHash('sha256').update(t).digest('hex');

function npmCli(){
 const bases=[join(resolve(process.execPath,'..'),'node_modules','npm','bin','npm-cli.js'),join(resolve(process.execPath,'..','..'),'lib','node_modules','npm','bin','npm-cli.js')];
 return bases.find(existsSync)||null;
}
/** Verification commands are fixed argv arrays chosen by id from the approval record, never text from model output. */
export function verifyCommand(id){
 if(id==='node-test')return {cmd:process.execPath,args:['--test']};
 if(id==='npm-test'){const cli=npmCli();if(!cli)throw new WorkspaceError('NO_NPM','Không tìm thấy npm đi kèm Node; dùng lệnh node-test');return {cmd:process.execPath,args:[cli,'test']};}
 throw new WorkspaceError('BAD_COMMAND','Lệnh kiểm thử không nằm trong danh sách cho phép');
}
export const VERIFY_IDS=Object.freeze(['node-test','npm-test']);

/** Isolated git worktrees: the user's checkout (HEAD, index, working tree) is never touched. */
export class Workspace{
 #dir;#locks=new Map();
 constructor({dir}){this.#dir=resolve(dir);}
 path(id){return join(this.#dir,id);}
 async #withLock(key,fn){
  const prev=this.#locks.get(key)||Promise.resolve();
  const next=prev.then(fn,fn);
  this.#locks.set(key,next.catch(()=>{}));
  return next;
 }
 async #git(args,opts){
  const r=await runGit(args,opts);
  if(r.error==='ENOENT')throw new WorkspaceError('NO_GIT','Không tìm thấy git trên máy này. Cài Git for Windows rồi thử lại.');
  return r;
 }
 async inspectRepo(repoPath){
  const root=resolve(repoPath);
  const top=await this.#git(['rev-parse','--show-toplevel'],{cwd:root});
  if(top.code!==0)throw new WorkspaceError('NOT_REPO','Đường dẫn không phải repository git');
  // Compare real paths: on Windows one side may be an 8.3 short name (RUNNER~1) and the other the long name, with / vs \.
  if(canonical(top.stdout.trim())!==canonical(root))throw new WorkspaceError('NOT_REPO','Hãy chỉ định thư mục gốc của repository');
  return {root};
 }
 async resolveBase(repoPath,ref){
  if(typeof ref!=='string'||!/^[A-Za-z0-9_./-]{1,100}$/.test(ref)||ref.startsWith('-'))throw new WorkspaceError('BAD_REF','Tham chiếu nhánh không hợp lệ');
  const r=await this.#git(['rev-parse','--verify',ref+'^{commit}'],{cwd:repoPath});
  const sha=r.stdout.trim();
  if(r.code!==0||!SHA.test(sha))throw new WorkspaceError('BAD_REF','Không tìm thấy commit cho '+ref);
  return sha;
 }
 async headSha(worktree){const r=await this.#git(['rev-parse','HEAD'],{cwd:worktree});return r.stdout.trim();}
 async create({id,repoPath,baseSha,branch}){
  if(!SHA.test(baseSha))throw new WorkspaceError('BAD_REF','Cần SHA đầy đủ của commit gốc');
  if(!/^hak\/[a-z0-9][a-z0-9-]{2,60}$/.test(branch))throw new WorkspaceError('BAD_BRANCH','Tên nhánh làm việc không hợp lệ');
  const wt=this.path(id);
  return this.#withLock(resolve(repoPath),async()=>{
   await this.remove({id,repoPath}).catch(()=>{});
   await mkdir(this.#dir,{recursive:true,mode:0o700});
   const r=await this.#git(['worktree','add','-b',branch,wt,baseSha],{cwd:repoPath});
   if(r.code!==0)throw new WorkspaceError('WORKTREE','Không tạo được workspace: '+r.stderr.trim().slice(0,200));
   return wt;
  });
 }
 async remove({id,repoPath}){
  const wt=this.path(id);
  await this.#git(['worktree','remove','--force',wt],{cwd:repoPath});
  await rm(wt,{recursive:true,force:true});
  await this.#git(['worktree','prune'],{cwd:repoPath});
 }
 async listFiles(repoPath,sha,scope){
  const r=await this.#git(['ls-tree','-r','--name-only','-z',sha],{cwd:repoPath,maxBytes:2*1024*1024});
  if(r.code!==0)throw new WorkspaceError('GIT','Không đọc được cây thư mục');
  return r.stdout.split('\0').filter(p=>p&&matchesScope(p,scope));
 }
 /** Reads a file as it is at the approved base commit (not the working tree). */
 async readAtBase(repoPath,sha,rel,maxBytes=40*1024){
  const r=await this.#git(['show',sha+':'+rel],{cwd:repoPath,maxBytes});
  return r.code===0?r.stdout:null;
 }
 validateEdits(edits,scope){
  if(!Array.isArray(edits)||edits.length<1||edits.length>MAX_EDITS)throw new WorkspaceError('BAD_EDITS','Số tệp chỉnh sửa phải từ 1 đến '+MAX_EDITS);
  const seen=new Set();let total=0;
  return edits.map(e=>{
   if(!e||typeof e!=='object'||typeof e.content!=='string')throw new WorkspaceError('BAD_EDITS','Chỉnh sửa không hợp lệ');
   const path=validateEditPath(e.path,scope);
   if(seen.has(path.toLowerCase()))throw new WorkspaceError('BAD_EDITS','Trùng đường dẫn: '+path);
   seen.add(path.toLowerCase());
   const bytes=Buffer.byteLength(e.content,'utf8');total+=bytes;
   if(bytes>MAX_FILE||total>MAX_TOTAL||e.content.includes('\0'))throw new WorkspaceError('BAD_EDITS','Nội dung quá lớn hoặc chứa byte NUL');
   return {path,content:e.content};
  });
 }
 async applyEdits(worktree,edits,scope){
  const checked=this.validateEdits(edits,scope);
  for(const e of checked){
   const target=await assertInsideRoot(worktree,e.path);
   await mkdir(dirname(target),{recursive:true});
   await writeFile(target,e.content,'utf8');
  }
  return checked.map(e=>({path:e.path,sha256:sha256(e.content),bytes:Buffer.byteLength(e.content)}));
 }
 async commit(worktree,message,paths){
  const add=await this.#git(['add','--',...paths],{cwd:worktree});
  if(add.code!==0)throw new WorkspaceError('GIT','git add thất bại');
  const diff=await this.#git(['diff','--cached','--quiet'],{cwd:worktree});
  if(diff.code===0)return null; // nothing changed
  const c=await this.#git(['commit','--no-verify','-m',message.slice(0,200)],{cwd:worktree});
  if(c.code!==0)throw new WorkspaceError('GIT','git commit thất bại: '+c.stderr.slice(0,200));
  return this.headSha(worktree);
 }
 async verify(worktree,commandId,{timeoutMs=300000,signal}={}){
  const {cmd,args}=verifyCommand(commandId);
  const started=Date.now();
  const r=await runProcess(cmd,args,{cwd:worktree,timeoutMs,signal,maxBytes:64*1024,env:scrubbedEnv({CI:'1'})});
  const text=(r.stdout+(r.stderr?'\n'+r.stderr:'')).slice(-8000);
  return {passed:r.code===0&&!r.timedOut&&!r.aborted,exitCode:r.code,timedOut:r.timedOut,aborted:r.aborted,durationMs:Date.now()-started,output:text,outputSha256:sha256(text)};
 }
 async push(worktree,{remote='origin',branch,token=null}){
  if(!/^hak\/[a-z0-9][a-z0-9-]{2,60}$/.test(branch))throw new WorkspaceError('BAD_BRANCH','Chỉ được đẩy nhánh hak/*');
  const extraConfig=token?[['http.extraheader','AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')]]:[];
  const r=await this.#git(['push','--',remote,'refs/heads/'+branch+':refs/heads/'+branch],{cwd:worktree,timeoutMs:120000,network:true,extraConfig,secrets:token?[token]:[]});
  if(r.code!==0)throw new WorkspaceError('PUSH','Đẩy nhánh thất bại: '+r.stderr.trim().slice(0,300));
  return true;
 }
}
export {PathError};
