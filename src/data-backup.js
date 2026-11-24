import {mkdir,readdir,readFile,writeFile,copyFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative,resolve,sep,dirname} from 'node:path';

const SKIP_DIRS=new Set(['backups','logs','workspaces']); // workspaces are disposable git worktrees
const SKIP_FILE=/^secrets(\..+)?\.json(\.bak)?$/;   // API keys / tokens are never copied into backups
const sha=buf=>createHash('sha256').update(buf).digest('hex');
async function walk(dir,base=dir,out=[]){
 for(const e of await readdir(dir,{withFileTypes:true})){
  const full=join(dir,e.name);
  if(e.isDirectory()){if(dir===base&&SKIP_DIRS.has(e.name))continue;await walk(full,base,out);}
  else if(e.isFile()&&!e.name.endsWith('.tmp')&&!(dir===base&&SKIP_FILE.test(e.name)))out.push(relative(base,full).split(sep).join('/'));
 }
 return out;
}
/** Copy user data into <dataDir>/backups/backup-<stamp>/ with a SHA-256 manifest. Secrets files are excluded on purpose: back up keys through the platform secret store. */
export async function createBackup(dataDir,{now=()=>new Date()}={}){
 const root=resolve(dataDir);
 const stamp=now().toISOString().replace(/[:.]/g,'-');
 const target=join(root,'backups','backup-'+stamp);
 await mkdir(target,{recursive:true,mode:0o700});
 const files=[];
 for(const rel of (await walk(root)).sort()){
  const data=await readFile(join(root,rel));
  const dest=join(target,'data',rel);
  await mkdir(dirname(dest),{recursive:true,mode:0o700});
  await writeFile(dest,data,{mode:0o600});
  files.push({path:rel,bytes:data.length,sha256:sha(data)});
 }
 const manifest={schemaVersion:1,createdAt:now().toISOString(),fileCount:files.length,files};
 await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,1),{mode:0o600});
 return {path:target,fileCount:files.length};
}
export async function verifyBackup(backupDir){
 const root=resolve(backupDir);
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 const problems=[];
 for(const f of manifest.files){
  if(f.path.includes('..')||f.path.startsWith('/')){problems.push('unsafe path '+f.path);continue;}
  try{if(sha(await readFile(join(root,'data',f.path)))!==f.sha256)problems.push('checksum mismatch '+f.path);}
  catch{problems.push('missing '+f.path);}
 }
 const known=new Set(manifest.files.map(f=>f.path));
 for(const rel of await walk(join(root,'data'),join(root,'data')))if(!known.has(rel))problems.push('unexpected file '+rel);
 return {ok:problems.length===0,fileCount:manifest.fileCount,problems};
}
/** Restore into an empty (or non-existent) directory. Never overwrites existing user data. */
export async function restoreBackup(backupDir,targetDir){
 const verdict=await verifyBackup(backupDir);
 if(!verdict.ok)throw new Error('Bản sao lưu không toàn vẹn: '+verdict.problems.slice(0,3).join('; '));
 const target=resolve(targetDir);
 try{if((await readdir(target)).length)throw new Error('Thư mục đích không trống; chọn thư mục trống để tránh ghi đè dữ liệu');}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const staging=target+'.restoring-'+process.pid;
 await rm(staging,{recursive:true,force:true});
 const manifest=JSON.parse(await readFile(join(resolve(backupDir),'manifest.json'),'utf8'));
 for(const f of manifest.files){
  const dest=join(staging,f.path);await mkdir(dirname(dest),{recursive:true,mode:0o700});
  await copyFile(join(resolve(backupDir),'data',f.path),dest);
 }
 await rm(target,{recursive:true,force:true});
 await mkdir(dirname(target),{recursive:true});
 await rename(staging,target);
 const check=await Promise.all(manifest.files.map(async f=>sha(await readFile(join(target,f.path)))===f.sha256));
 if(!check.every(Boolean))throw new Error('Đối chiếu sau khi phục hồi thất bại');
 return {restoredFiles:manifest.files.length,target};
}
export async function listBackups(dataDir){
 const dir=join(resolve(dataDir),'backups');
 try{return (await readdir(dir)).filter(n=>n.startsWith('backup-')).sort().reverse();}catch{return [];}
}
