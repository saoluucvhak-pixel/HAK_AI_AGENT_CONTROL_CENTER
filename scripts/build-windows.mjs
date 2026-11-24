// Builds the Windows distribution: staged app + bundled Node runtime, portable zip. The installer is compiled by Inno Setup in CI.
// Usage: node scripts/build-windows.mjs [--version X] [--skip-runtime] [--out dist]
import {mkdir,rm,cp,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2);
const opt=(name,def)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:def;};
const flag=name=>args.includes('--'+name);
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const version=opt('version',pkg.version);
if(!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version))throw new Error('Invalid version: '+version);
const out=resolve(opt('out',join(root,'dist')));
const stage=join(out,'stage');
const cache=join(out,'cache');
const sha256=buf=>createHash('sha256').update(buf).digest('hex');

async function fetchBuffer(url){
 const r=await fetch(url,{redirect:'follow'});
 if(!r.ok)throw new Error('Download failed '+r.status+' '+url);
 return Buffer.from(await r.arrayBuffer());
}
/** Download the official Node.js Windows runtime and verify it against the published SHASUMS256.txt. */
async function nodeRuntime(nodeVersion){
 await mkdir(cache,{recursive:true});
 const zipName='node-v'+nodeVersion+'-win-x64.zip';
 const zipPath=join(cache,zipName);
 if(!existsSync(zipPath)){
  const base='https://nodejs.org/dist/v'+nodeVersion+'/';
  const sums=(await fetchBuffer(base+'SHASUMS256.txt')).toString('utf8');
  const line=sums.split('\n').find(l=>l.trim().endsWith('  '+zipName));
  if(!line)throw new Error('No checksum published for '+zipName);
  const zip=await fetchBuffer(base+zipName);
  if(sha256(zip)!==line.split(/\s+/)[0])throw new Error('Node runtime checksum mismatch');
  await writeFile(zipPath,zip);
 }
 const extract=join(cache,'node-'+nodeVersion);
 if(!existsSync(join(extract,'node-v'+nodeVersion+'-win-x64','node.exe'))){
  await rm(extract,{recursive:true,force:true});await mkdir(extract,{recursive:true});
  const attempts=[['tar',['-xf',zipPath,'-C',extract]],['unzip',['-q',zipPath,'-d',extract]],['powershell',['-NoProfile','-Command','Expand-Archive -LiteralPath "'+zipPath+'" -DestinationPath "'+extract+'" -Force']]];
  let done=false;
  for(const [cmd,a] of attempts){
   const r=spawnSync(cmd,a,{stdio:'ignore'});
   if(r.status===0&&existsSync(join(extract,'node-v'+nodeVersion+'-win-x64','node.exe'))){done=true;break;}
  }
  if(!done)throw new Error('Could not extract Node runtime (tried tar, unzip, Expand-Archive)');
 }
 return join(extract,'node-v'+nodeVersion+'-win-x64');
}

await rm(stage,{recursive:true,force:true});
await mkdir(stage,{recursive:true});
for(const dir of ['src','web'])await cp(join(root,dir),join(stage,dir),{recursive:true});
await mkdir(join(stage,'scripts'));
for(const f of ['launch.mjs','stop.mjs'])await copyFile(join(root,'scripts',f),join(stage,'scripts',f));
for(const f of ['HAK_AI_AGENT.vbs','HAK_STOP.vbs'])await copyFile(join(root,'packaging','windows',f),join(stage,f));
for(const f of ['README.md']){if(existsSync(join(root,f)))await copyFile(join(root,f),join(stage,f));}
if(existsSync(join(root,'docs','USER_GUIDE_VI.md')))await copyFile(join(root,'docs','USER_GUIDE_VI.md'),join(stage,'USER_GUIDE_VI.md'));
await writeFile(join(stage,'package.json'),JSON.stringify({name:pkg.name,version,private:true,type:'module',engines:pkg.engines,scripts:{start:'node src/server.js'}},null,1));
await writeFile(join(stage,'installed.json'),JSON.stringify({layout:'windows-installed',version,builtAt:new Date().toISOString(),signed:false}));
// Runtime dependencies: the app has none (Node built-ins only). Fail the build if that ever changes silently.
if(pkg.dependencies&&Object.keys(pkg.dependencies).length)throw new Error('Runtime dependencies must be vendored before packaging');
if(!flag('skip-runtime')){
 const nodeVersion=process.version.slice(1);
 const dir=await nodeRuntime(nodeVersion);
 await mkdir(join(stage,'runtime'));
 await copyFile(join(dir,'node.exe'),join(stage,'runtime','node.exe'));
 if(existsSync(join(dir,'LICENSE')))await copyFile(join(dir,'LICENSE'),join(stage,'runtime','NODE_LICENSE'));
 await writeFile(join(stage,'runtime','NODE_VERSION.txt'),'v'+nodeVersion+'\n');
}
const files=(await readdir(stage,{recursive:true})).length;
console.log(JSON.stringify({ok:true,version,stage,files,runtimeBundled:!flag('skip-runtime')}));
