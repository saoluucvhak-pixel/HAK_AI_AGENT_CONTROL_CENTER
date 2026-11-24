import {mkdir,writeFile,rm,stat,readFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {existsSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runGit,runProcess,scrubbedEnv,npmInstallEnv} from './safe-process.js';
import {validateEditPath,assertInsideRoot,matchesScope,PathError} from './code-paths.js';

const SHA=/^[a-f0-9]{40}$/;
const MAX_EDITS=20,MAX_FILE=100*1024,MAX_TOTAL=300*1024,MAX_FULL_EXISTING=30*1024,MAX_REPLACE=30,MAX_EDITABLE=2*1024*1024;
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
/**
 * Verification commands are fixed argv lists chosen by id from the approval record, never text from model output.
 * Each step: {cmd,args,install?}. `install` steps get proxy/CA variables (they download dependencies) and run with --ignore-scripts.
 */
export function verifySteps(id){
 if(id==='node-test')return [{cmd:process.execPath,args:['--test']}];
 if(id==='npm-test'||id==='npm-ci-test'){
  const cli=npmCli();if(!cli)throw new WorkspaceError('NO_NPM','Không tìm thấy npm đi kèm Node; dùng lệnh node-test');
  const test={cmd:process.execPath,args:[cli,'test']};
  return id==='npm-test'?[test]:[{cmd:process.execPath,args:[cli,'ci','--ignore-scripts','--no-audit','--no-fund'],install:true},test];
 }
 throw new WorkspaceError('BAD_COMMAND','Lệnh kiểm thử không nằm trong danh sách cho phép');
}
export const verifyCommand=id=>verifySteps(id)[0];
export const VERIFY_IDS=Object.freeze(['node-test','npm-test','npm-ci-test']);

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
 /** Every path at a commit (no checkout needed). */
 async listAll(repoPath,sha){
  const r=await this.#git(['ls-tree','-r','-l','-z',sha],{cwd:repoPath,maxBytes:8*1024*1024});
  if(r.code!==0)throw new WorkspaceError('GIT','Không đọc được cây thư mục');
  return r.stdout.split('\0').filter(Boolean).map(l=>{const m=/^(\d+) (\w+) ([0-9a-f]{40})\s+(\S+)\t(.+)$/.exec(l);return m?{path:m[5],size:m[4]==='-'?0:Number(m[4]),type:m[2]}:null;}).filter(x=>x&&x.type==='blob');
 }
 /** git grep over a commit: [{path,line,text}] (binary files skipped, output bounded). */
 async grepAt(repoPath,sha,pattern,{max=300}={}){
  const r=await this.#git(['grep','-I','-n','-E','--no-color','-e',pattern,sha,'--'],{cwd:repoPath,maxBytes:2*1024*1024,timeoutMs:60000});
  if(r.code===1)return [];
  if(r.code!==0)throw new WorkspaceError('GIT','git grep thất bại');
  const out=[];
  for(const l of r.stdout.split('\n')){
   const m=/^[0-9a-f]{40}:(.+?):(\d+):(.*)$/.exec(l);if(m)out.push({path:m[1],line:Number(m[2]),text:m[3]});
   if(out.length>=max)break;
  }
  return out;
 }
 /** Detached worktree (no branch is created) for read-only execution checks. */
 async createDetached({id,repoPath,baseSha}){
  if(!SHA.test(baseSha))throw new WorkspaceError('BAD_REF','Cần SHA đầy đủ của commit gốc');
  const wt=this.path(id);
  return this.#withLock(resolve(repoPath),async()=>{
   await this.remove({id,repoPath}).catch(()=>{});
   await mkdir(this.#dir,{recursive:true,mode:0o700});
   const r=await this.#git(['worktree','add','--detach',wt,baseSha],{cwd:repoPath});
   if(r.code!==0)throw new WorkspaceError('WORKTREE','Không tạo được workspace: '+r.stderr.trim().slice(0,200));
   return wt;
  });
 }
 /** `npm ci --ignore-scripts` then `npm audit --omit=dev --json`; audit exit 1 means "vulnerabilities found", not failure. */
 async npmAudit(worktree,{timeoutMs=240000,signal}={}){
  const cli=npmCli();if(!cli)throw new WorkspaceError('NO_NPM','Không tìm thấy npm đi kèm Node');
  const started=Date.now();
  const inst=await runProcess(process.execPath,[cli,'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:worktree,timeoutMs,signal,env:npmInstallEnv()});
  if(inst.code!==0)return {ok:false,stage:'install',exitCode:inst.code,output:(inst.stdout+inst.stderr).slice(-2000),durationMs:Date.now()-started};
  const aud=await runProcess(process.execPath,[cli,'audit','--omit=dev','--json'],{cwd:worktree,timeoutMs,signal,env:npmInstallEnv(),maxBytes:512*1024});
  let counts=null;try{const j=JSON.parse(aud.stdout);counts=j.metadata?.vulnerabilities||null;}catch{/* not JSON */}
  return {ok:counts!==null,stage:'audit',exitCode:aud.code,counts,output:counts?'':(aud.stdout+aud.stderr).slice(-2000),outputSha256:sha256(aud.stdout),durationMs:Date.now()-started};
 }
 async listFiles(repoPath,sha,scope){
  const r=await this.#git(['ls-tree','-r','--name-only','-z',sha],{cwd:repoPath,maxBytes:2*1024*1024});
  if(r.code!==0)throw new WorkspaceError('GIT','Không đọc được cây thư mục');
  return r.stdout.split('\0').filter(p=>p&&matchesScope(p,scope));
 }
 /** Reads a file as it is at the approved base commit (not the working tree). */
 async readAtBase(repoPath,sha,rel,maxBytes=40*1024,{head=false}={}){
  if(typeof rel!=='string'||rel.startsWith('-')||rel.includes('\0'))return null;
  const r=await this.#git(['show',sha+':'+rel],{cwd:repoPath,maxBytes:8*1024*1024});
  if(r.code!==0||r.truncated)return null;            // missing, or larger than the 8 MB hard ceiling
  if(r.stdout.length>maxBytes)return head?r.stdout.slice(0,maxBytes):null;   // head: the beginning of the file, never the tail
  return r.stdout;
 }
 validateEdits(edits,scope){
  if(!Array.isArray(edits)||edits.length<1||edits.length>MAX_EDITS)throw new WorkspaceError('BAD_EDITS','Số tệp chỉnh sửa phải từ 1 đến '+MAX_EDITS);
  const seen=new Set();let total=0;
  return edits.map(e=>{
   if(!e||typeof e!=='object')throw new WorkspaceError('BAD_EDITS','Chỉnh sửa không hợp lệ');
   const path=validateEditPath(e.path,scope);
   if(seen.has(path.toLowerCase()))throw new WorkspaceError('BAD_EDITS','Trùng đường dẫn: '+path);
   seen.add(path.toLowerCase());
   if(typeof e.content==='string'){
    const bytes=Buffer.byteLength(e.content,'utf8');total+=bytes;
    if(bytes>MAX_FILE||total>MAX_TOTAL||e.content.includes('\0'))throw new WorkspaceError('BAD_EDITS','Nội dung quá lớn hoặc chứa byte NUL');
    return {path,content:e.content};
   }
   if(Array.isArray(e.replace)&&e.replace.length>=1&&e.replace.length<=MAX_REPLACE){
    const replace=e.replace.map(r=>{
     if(!r||typeof r.find!=='string'||!r.find||typeof r.with!=='string'||r.find.length>20000||r.with.length>50000||r.find.includes('\0')||r.with.includes('\0'))throw new WorkspaceError('BAD_EDITS','Khối thay thế không hợp lệ trong '+path);
     total+=Buffer.byteLength(r.with,'utf8');
     return {find:r.find,with:r.with};
    });
    if(total>MAX_TOTAL)throw new WorkspaceError('BAD_EDITS','Tổng nội dung thay thế quá lớn');
    return {path,replace};
   }
   throw new WorkspaceError('BAD_EDITS','Mỗi chỉnh sửa cần "content" (tệp mới/nhỏ) hoặc "replace" (1–'+MAX_REPLACE+' khối {find,with}): '+path);
  });
 }
 /** Exact-anchor replacement: every `find` must occur exactly once. CRLF files accept LF anchors. */
 static applyReplacements(text,replace,path){
  const crlf=text.includes('\r\n');
  let out=text;
  for(const [i,r] of replace.entries()){
   let find=r.find,w=r.with;
   if(crlf&&!find.includes('\r\n')){find=find.replace(/\n/g,'\r\n');w=w.replace(/\r?\n/g,'\r\n');}
   const parts=out.split(find);
   if(parts.length===1)throw new WorkspaceError('ANCHOR','Không tìm thấy đoạn cần thay #'+(i+1)+' trong '+path+' (phải khớp chính xác từng ký tự): "'+r.find.slice(0,60).replace(/\n/g,'\\n')+'"');
   if(parts.length>2)throw new WorkspaceError('ANCHOR','Đoạn cần thay #'+(i+1)+' trong '+path+' khớp '+(parts.length-1)+' chỗ; hãy thêm ngữ cảnh để chỉ khớp đúng một chỗ');
   out=parts.join(w);
  }
  return out;
 }
 /** Two-phase: compute every new file in memory first, then write; a failing anchor leaves the worktree untouched. */
 async applyEdits(worktree,edits,scope){
  const checked=this.validateEdits(edits,scope);
  const plan=[];
  for(const e of checked){
   const target=await assertInsideRoot(worktree,e.path);
   let existing=null;
   try{const st=await stat(target);if(!st.isFile())throw new WorkspaceError('BAD_EDITS','Không phải tệp thường: '+e.path);if(st.size>MAX_EDITABLE)throw new WorkspaceError('BAD_EDITS','Tệp quá lớn để chỉnh sửa: '+e.path);existing=await readFile(target,'utf8');}
   catch(err){if(err.code!=='ENOENT')throw err;}
   if(e.replace){
    if(existing===null)throw new WorkspaceError('BAD_EDITS','Không thể "replace" trên tệp chưa tồn tại: '+e.path);
    plan.push({path:e.path,target,mode:'replace',n:e.replace.length,content:Workspace.applyReplacements(existing,e.replace,e.path)});
   }else{
    if(existing!==null&&Buffer.byteLength(existing,'utf8')>MAX_FULL_EXISTING)throw new WorkspaceError('BAD_EDITS','Tệp '+e.path+' lớn hơn '+(MAX_FULL_EXISTING/1024)+' KB: dùng "replace" thay vì ghi lại toàn bộ');
    plan.push({path:e.path,target,mode:'content',n:1,content:e.content});
   }
  }
  for(const p of plan){await mkdir(dirname(p.target),{recursive:true});await writeFile(p.target,p.content,'utf8');}
  return plan.map(p=>({path:p.path,mode:p.mode,changes:p.n,sha256:sha256(p.content),bytes:Buffer.byteLength(p.content)}));
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
  const steps=verifySteps(commandId);
  const started=Date.now();let text='',code=0,timedOut=false,aborted=false;
  for(const st of steps){
   const left=Math.max(1000,timeoutMs-(Date.now()-started));
   const r=await runProcess(st.cmd,st.args,{cwd:worktree,timeoutMs:left,signal,maxBytes:64*1024,env:st.install?npmInstallEnv():scrubbedEnv({CI:'1'})});
   text+=(st.install?'[cài phụ thuộc]\n':'')+(r.stdout+(r.stderr?'\n'+r.stderr:''))+'\n';
   code=r.code;timedOut=r.timedOut;aborted=r.aborted;
   if(r.code!==0||r.timedOut||r.aborted)break;
  }
  const out=text.slice(-8000);
  return {passed:code===0&&!timedOut&&!aborted,exitCode:code,timedOut,aborted,durationMs:Date.now()-started,output:out,outputSha256:sha256(out)};
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
