import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {runGit} from './safe-process.js';
import {Workspace,sandboxMode,VERIFY_IDS} from './workspace.js';
import {ReviewService} from './repo-review.js';
import {CodeChangeService} from './code-change.js';
import {Orchestrator} from './orchestrator.js';
import {ApprovalStore,scopeHash} from './approvals.js';
import {ProviderManager} from './provider-manager.js';
import {FileSecretBackend,redact} from './secrets.js';
import {defaultEndpoint} from './providers.js';
import {createDraftPr} from './github-pr.js';

/** Exit codes (stable, documented): CI scripts and approval gates depend on them. */
export const EXIT=Object.freeze({OK:0,FINDINGS:1,USAGE:2,TOOL:3,APPROVAL_MISMATCH:4,REMOTE_MISMATCH:5,AWAITING_APPROVAL:10});
const BOOL=new Set(['execute','ai','consent-execute-code','json-stdout','help']);
const MULTI=new Set(['scope']);

export function parseArgs(argv){
 const cmd=argv[0]&&!argv[0].startsWith('--')?argv[0]:null;
 const flags={};
 for(let i=cmd?1:0;i<argv.length;i++){
  const a=argv[i];
  if(!a.startsWith('--'))throw usage('Tham số không hợp lệ: '+a);
  const k=a.slice(2);
  if(BOOL.has(k)){flags[k]=true;continue;}
  const v=argv[++i];
  if(v===undefined||v.startsWith('--'))throw usage('Thiếu giá trị cho --'+k);
  if(MULTI.has(k))(flags[k]??=[]).push(v);else flags[k]=v;
 }
 return {cmd,flags};
}
const usage=m=>Object.assign(new Error(m),{exit:EXIT.USAGE});

export const HELP=`HAK Control Center (dòng lệnh, dùng trong container/CI)

  hak review  --repo <thư-mục> [--ref <nhánh>] [--execute --consent-execute-code] [--ai] [--max-tokens N]
              [--out báo-cáo.md] [--json kết-quả.json] [--fail-on error|warning|never]
  hak write   --repo <thư-mục> --goal "<mục tiêu>" --scope <glob> [--scope ...] --consent-execute-code
              [--verify node-test|npm-test|npm-ci-test] [--repairs 0-3] [--agents backend,...] [--max-tokens N]
              [--github-repo owner/name] [--out-dir <thư-mục>] [--approve <băm-kế-hoạch>]
  hak publish --repo <thư-mục> --bundle <tệp.bundle> --approve-publish <SHA> [--github-repo owner/name] [--base main] [--title "..."]
  hak serve                       (giao diện web; HAK_BIND=0.0.0.0 chỉ khi cổng được publish về loopback)

Mô hình (chỉ cho write/review --ai), qua biến môi trường:
  HAK_PROVIDER=anthropic|gemini|openai-compatible  HAK_MODEL=<model>  [HAK_ENDPOINT=<url>]
  khóa: ANTHROPIC_API_KEY | GEMINI_API_KEY | HAK_API_KEY      token GitHub (PR): HAK_GITHUB_TOKEN
Cô lập khi chạy test mã AI viết: HAK_SANDBOX=netns (mặc định, fail-closed) | container | off
Mã thoát: 0 ok · 1 có phát hiện/không đạt · 2 sai cấu hình · 3 lỗi công cụ · 4 phê duyệt không khớp · 5 remote không khớp · 10 chờ phê duyệt
`;

async function providersFromEnv(env,dir,fetchImpl){
 const kind=env.HAK_PROVIDER;
 if(!kind)return null;
 const keys={anthropic:'ANTHROPIC_API_KEY',gemini:'GEMINI_API_KEY','openai-compatible':'HAK_API_KEY'};
 if(!keys[kind])throw usage('HAK_PROVIDER phải là anthropic, gemini hoặc openai-compatible');
 if(!env.HAK_MODEL)throw usage('Thiếu HAK_MODEL');
 const pm=new ProviderManager({dir,secrets:new FileSecretBackend(join(dir,'secrets.json')),fetchImpl,env});
 await pm.load();
 try{
  await pm.upsert({type:kind,name:'env',endpoint:env.HAK_ENDPOINT||defaultEndpoint(kind),model:env.HAK_MODEL,apiKeyEnv:keys[kind],timeoutMs:Number(env.HAK_TIMEOUT_MS)||120000,maxTokens:Number(env.HAK_MAX_TOKENS)||4096,retries:2,maxConcurrency:2,
   priceInputPerMTok:env.HAK_PRICE_IN?Number(env.HAK_PRICE_IN):null,priceOutputPerMTok:env.HAK_PRICE_OUT?Number(env.HAK_PRICE_OUT):null});
 }catch(e){throw usage(e.message);}
 return pm;
}
async function currentRef(repo){
 const r=await runGit(['symbolic-ref','--short','-q','HEAD'],{cwd:repo});
 return r.code===0&&r.stdout.trim()?r.stdout.trim():'HEAD';
}
const actor=env=>'cli:'+(env.GITHUB_ACTOR||env.USER||'operator').replace(/[^A-Za-z0-9_.@-]/g,'_').slice(0,60);

async function withData(env,fn){
 const given=env.HAK_DATA_DIR;
 const dir=given?resolve(given):await mkdtemp(join(tmpdir(),'hak-cli-'));
 await mkdir(dir,{recursive:true,mode:0o700});
 try{return await fn(dir);}finally{if(!given)await rm(dir,{recursive:true,force:true}).catch(()=>{});}
}

export async function cmdReview(flags,{env,out,err,fetchImpl}){
 if(!flags.repo)throw usage('Thiếu --repo');
 const failOn=flags['fail-on']||'error';
 if(!['error','warning','never'].includes(failOn))throw usage('--fail-on phải là error, warning hoặc never');
 if(flags.execute&&!flags['consent-execute-code'])throw usage('Tầng thực thi chạy mã của repo: cần --consent-execute-code');
 const maxTokens=flags['max-tokens']?Number(flags['max-tokens']):20000;
 const repoPath=resolve(flags.repo);
 return withData(env,async dir=>{
  const ws=new Workspace({dir:join(dir,'workspaces')});
  const info=await ws.inspectRepo(repoPath).catch(e=>{throw usage(e.message);});
  const ref=flags.ref||await currentRef(info.root);
  const providers=flags.ai?await providersFromEnv(env,dir,fetchImpl):null;
  const svc=new ReviewService({dir,workspace:ws,providers,repos:{getRepo:()=>({id:'cli',name:basename(info.root),path:info.root,defaultBranch:ref,defaultVerify:flags.verify||'node-test',githubRepo:null})}});
  await svc.load();
  const started=await svc.start({repoId:'cli',ref,execute:Boolean(flags.execute),consentExecuteCode:Boolean(flags['consent-execute-code']),ai:Boolean(flags.ai),maxTokens}).catch(e=>{throw usage(e.message);});
  await svc.whenIdle(started.id);
  const r=svc.get(started.id);
  const md=svc.report(started.id);
  if(flags.out)await writeFile(resolve(flags.out),md);
  if(flags.json)await writeFile(resolve(flags.json),JSON.stringify({id:r.id,repo:r.repo,sha:r.sha,ref:r.ref,source:r.source,status:r.status,counts:r.counts,tiers:r.tiers,ai:r.ai,evidence:r.evidence.map(({outputTail,...e})=>e),findings:r.findings},null,1));
  const c=r.counts||{error:0,warning:0,info:0,unverified:0};
  out('Review '+r.repo+' @ '+r.sha.slice(0,8)+' ('+r.source+') → '+r.status+': '+c.error+' lỗi · '+c.warning+' cảnh báo · '+c.info+' thông tin · '+c.unverified+' nhận định AI chưa xác minh');
  if(r.ai)out('  tầng AI: '+r.ai.status+(r.ai.reason?' ('+r.ai.reason+')':''));
  for(const f of r.findings.filter(f=>f.severity!=='info'&&f.verified!==false))out('  ['+f.severity+'] '+f.rule+' '+f.path+':'+f.line+' — '+f.title);
  if(r.status!=='COMPLETED'){err('Review không hoàn tất: '+(r.error||r.status));return EXIT.TOOL;}
  if(r.evidence.some(e=>e.passed===false))out('  kiểm thử của repo KHÔNG đạt');
  if(failOn==='never')return EXIT.OK;
  const bad=failOn==='warning'?c.error+c.warning:c.error;
  return bad>0||r.evidence.some(e=>e.passed===false)?EXIT.FINDINGS:EXIT.OK;
 });
}

export async function cmdWrite(flags,{env,out,err,fetchImpl}){
 if(!flags.repo||!flags.goal)throw usage('Thiếu --repo hoặc --goal');
 const scope=flags.scope||[];
 if(!scope.length)throw usage('Cần ít nhất một --scope (phạm vi được phép sửa)');
 if(!flags['consent-execute-code'])throw usage('Kiểm thử chạy mã do AI viết: cần --consent-execute-code');
 const verify=flags.verify||'node-test';
 if(!VERIFY_IDS.includes(verify))throw usage('--verify phải là một trong: '+VERIFY_IDS.join(', '));
 const repairs=flags.repairs===undefined?2:Number(flags.repairs);
 if(!Number.isInteger(repairs)||repairs<0||repairs>3)throw usage('--repairs phải từ 0 đến 3');
 const agents=(flags.agents||'backend').split(',').map(s=>s.trim()).filter(Boolean).sort();
 const maxTokens=flags['max-tokens']?Number(flags['max-tokens']):100000;
 const repoPath=resolve(flags.repo);
 return withData(env,async dir=>{
  const providers=await providersFromEnv(env,dir,fetchImpl);
  if(!providers){err('HAK_PROVIDER chưa được đặt: chế độ write cần mô hình thật; công cụ không giả lập.');return EXIT.USAGE;}
  const ws=new Workspace({dir:join(dir,'workspaces')});
  const info=await ws.inspectRepo(repoPath).catch(e=>{throw usage(e.message);});
  const ref=flags.ref||await currentRef(info.root);
  const fetched=await ws.fetchRemote(info.root,ref);
  const baseSha=await ws.resolveBase(info.root,fetched.ok?'origin/'+ref:ref).catch(e=>{throw usage(e.message);});
  const remote=(await ws.remoteTarget(info.root)).url;
  const plan={repo:basename(info.root),goal:flags.goal,scope:[...scope].sort(),verify,repairs,agents,maxTokens,baseSha,baseSource:fetched.ok?'remote':'local',remote,githubRepo:flags['github-repo']||null,sandbox:sandboxMode(env),consentExecuteCode:true};
  const planHash=scopeHash(plan);
  if(!flags.approve){
   out(JSON.stringify({status:'AWAITING_APPROVAL',planHash,plan},null,1));
   err('Chưa chạy gì và chưa gọi mô hình. Người có thẩm quyền xem kế hoạch rồi chạy lại với --approve '+planHash);
   return EXIT.AWAITING_APPROVAL;
  }
  if(flags.approve!==planHash){
   err('Phê duyệt không khớp kế hoạch hiện tại (mục tiêu/phạm vi/lệnh kiểm thử đổi, hoặc nhánh gốc đã tiến). Băm hiện tại: '+planHash);
   return EXIT.APPROVAL_MISMATCH;
  }
  const approvals=new ApprovalStore({path:join(dir,'approvals.json')});await approvals.load();
  const orch=new Orchestrator({dir,providers,approvals});await orch.load();
  const svc=new CodeChangeService({dir,workspace:ws,providers,approvals,orchestrator:orch,secrets:new FileSecretBackend(join(dir,'secrets.json')),fetchImpl});await svc.load();
  const who=actor(env);
  const repo=await svc.registerRepo({name:plan.repo,path:info.root,githubRepo:plan.githubRepo,defaultBranch:ref,defaultVerify:verify}).catch(e=>{throw Object.assign(new Error(e.message),{exit:e.code==='REMOTE_MISMATCH'?EXIT.REMOTE_MISMATCH:EXIT.USAGE});});
  const order=await orch.create({title:flags.goal.slice(0,160),description:flags.goal,agents,budget:{maxTokens}});
  await orch.approve(order.id,{approver:who,reason:'CLI: kế hoạch '+planHash.slice(0,12)});
  await orch.start(order.id,who);await orch.whenIdle(order.id);
  const done=orch.get(order.id);
  if(done.status!=='COMPLETED'){err('Giai đoạn đề xuất không hoàn tất: '+done.status+' — '+(done.tasks.find(t=>t.error)?.error?.message||''));return EXIT.FINDINGS;}
  const cc=await svc.create({orderId:order.id,repoId:repo.id,scope,verifyCommand:verify,maxRepairs:repairs,consentExecuteCode:true},who);
  if(cc.baseSha!==baseSha){err('Nền đã đổi giữa lúc phê duyệt và lúc chạy; chạy lại để có băm mới.');return EXIT.APPROVAL_MISMATCH;}
  await svc.approve(cc.id,{approver:who,reason:'CLI: kế hoạch '+planHash.slice(0,12)});
  await svc.start(cc.id,who);await svc.whenIdle(cc.id);
  const r=svc.get(cc.id);
  const summary={status:r.status,branch:r.branch,baseSha:r.baseSha,headSha:r.headSha,planHash,sandbox:sandboxMode(env),attempts:r.attempts.map(a=>({n:a.n,files:(a.files||[]).map(f=>f.path),commit:a.commit||null,error:a.error||null,verify:a.verify&&{passed:a.verify.passed,exitCode:a.verify.exitCode,durationMs:a.verify.durationMs,sandbox:a.verify.sandbox}})),usage:orch.get(order.id).usage,error:r.error};
  if(r.status==='VERIFIED'){
   const outDir=resolve(flags['out-dir']||'.');await mkdir(outDir,{recursive:true});
   const bundle=join(outDir,'hak-change.bundle');
   const b=await runGit(['bundle','create',bundle,'refs/heads/'+r.branch],{cwd:info.root,timeoutMs:120000});
   if(b.code!==0){err('Không tạo được bundle: '+redact(b.stderr).slice(0,200));return EXIT.TOOL;}
   const stat=await runGit(['diff','--stat',r.baseSha,r.headSha],{cwd:info.root});
   summary.bundle=bundle;summary.diffStat=stat.stdout.trim();
   await writeFile(join(outDir,'hak-change.json'),JSON.stringify(summary,null,1));
   out(JSON.stringify(summary,null,1));
   err('Đã kiểm thử đạt. Chưa đẩy gì. Để xuất bản: hak publish --bundle '+bundle+' --approve-publish '+r.headSha);
   await svc.cleanup(cc.id).catch(()=>{});
   await ws.deleteBranch(info.root,r.branch).catch(()=>{});   // the bundle carries the commit; leave the checkout clean
   return EXIT.OK;
  }
  out(JSON.stringify(summary,null,1));
  await svc.cleanup(cc.id).catch(()=>{});
  return EXIT.FINDINGS;
 });
}

export async function cmdPublish(flags,{env,out,err,fetchImpl}){
 if(!flags.repo||!flags.bundle)throw usage('Thiếu --repo hoặc --bundle');
 const repoPath=resolve(flags.repo),bundle=resolve(flags.bundle);
 const ws=new Workspace({dir:join(tmpdir(),'hak-cli-pub')});
 const info=await ws.inspectRepo(repoPath).catch(e=>{throw usage(e.message);});
 const ver=await runGit(['bundle','verify',bundle],{cwd:info.root});
 if(ver.code!==0){err('Bundle không hợp lệ hoặc không áp dụng được vào repo này: '+redact(ver.stderr).slice(0,200));return EXIT.TOOL;}
 const heads=(await runGit(['bundle','list-heads',bundle],{cwd:info.root})).stdout.trim().split('\n').map(l=>l.split(' ')).filter(x=>x.length===2);
 const hak=heads.filter(([,ref])=>/^refs\/heads\/hak\/[a-z0-9][a-z0-9-]{2,60}$/.test(ref));
 if(hak.length!==1||heads.length!==1){err('Bundle phải chứa đúng một nhánh hak/*.');return EXIT.TOOL;}
 const [tip,ref]=hak[0],branch=ref.slice('refs/heads/'.length);
 if(!flags['approve-publish']){out(JSON.stringify({status:'AWAITING_PUBLISH_APPROVAL',branch,commit:tip}));err('Chưa đẩy gì. Duyệt commit '+tip+' rồi chạy lại với --approve-publish '+tip);return EXIT.AWAITING_APPROVAL;}
 if(flags['approve-publish']!==tip){err('Phê duyệt xuất bản gắn commit '+flags['approve-publish']+' nhưng bundle chứa '+tip+'. Không đẩy.');return EXIT.APPROVAL_MISMATCH;}
 const slug=flags['github-repo']||null;
 const tgt=await ws.remoteTarget(info.root);
 if(slug&&tgt.slug!==slug.toLowerCase()){err('Remote origin ('+(tgt.url||'không có')+') không khớp '+slug+'. Không đẩy.');return EXIT.REMOTE_MISMATCH;}
 const f=await runGit(['fetch','--no-tags','--',bundle,ref+':'+ref],{cwd:info.root,timeoutMs:120000});
 if(f.code!==0){err('Không nạp được nhánh từ bundle (nhánh đã tồn tại khác commit?): '+redact(f.stderr).slice(0,200));return EXIT.TOOL;}
 const token=env.HAK_GITHUB_TOKEN||null;
 try{await ws.push(info.root,{branch,token});}catch(e){err(redact(e.message,[token||'']));return EXIT.TOOL;}
 let pr=null,prError=null;
 if(slug&&token){try{pr=await createDraftPr({fetchImpl,slug,token,head:branch,base:flags.base||'main',title:flags.title||'hak: thay đổi do AI đề xuất',body:'Thay đổi do AI đề xuất, đã qua kiểm thử trong sandbox ('+sandboxMode(env)+') ở commit '+tip+'. PR nháp: cần con người rà soát và CI đạt. Không tự động merge.'});}catch(e){prError=redact(e.message,[token]);}}
 out(JSON.stringify({status:'PUBLISHED',branch,commit:tip,pr,prError}));
 if(prError)err('Đã đẩy nhánh nhưng tạo PR nháp thất bại: '+prError);
 return EXIT.OK;
}

export async function main(argv,{env=process.env,out=console.log,err=console.error,fetchImpl=fetch}={}){
 try{
  const {cmd,flags}=parseArgs(argv);
  if(!cmd||flags.help||cmd==='help'){out(HELP);return cmd||flags.help?EXIT.OK:EXIT.USAGE;}
  const ctx={env,out,err,fetchImpl};
  if(cmd==='review')return await cmdReview(flags,ctx);
  if(cmd==='write')return await cmdWrite(flags,ctx);
  if(cmd==='publish')return await cmdPublish(flags,ctx);
  throw usage('Lệnh không hợp lệ: '+cmd);
 }catch(e){
  err('Lỗi: '+redact(e.message));
  return e.exit??EXIT.TOOL;
 }
}
