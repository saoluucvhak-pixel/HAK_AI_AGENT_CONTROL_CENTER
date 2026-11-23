import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export function validPort(raw){
 const n=Number(raw);
 if(!Number.isInteger(n)||n<1||n>65535)throw new Error('Invalid PORT');
 return n;
}
export async function inspectDashboard(url,fetchImpl=fetch){
 try{
  const response=await fetchImpl(url+'/api/health',{signal:AbortSignal.timeout(800)});
  if(!response.ok)return 'occupied';
  const json=await response.json();
  return json.app==='hak-agent-control-center'&&json.host==='127.0.0.1'?'running':'occupied';
 }catch{return 'free';}
}
export async function waitForDashboard(url,child,attempts=40){
 for(let i=0;i<attempts;i++){
  if(child.exitCode!==null)throw new Error('Dashboard process exited: '+child.exitCode);
  const state=await inspectDashboard(url);
  if(state==='running')return;
  if(state==='occupied')throw new Error('Port is occupied by another application');
  await sleep(150);
 }
 throw new Error('Dashboard did not become healthy');
}
export function openBrowser(url,platform=process.platform,spawnImpl=spawn){
 if(platform==='win32')return spawnImpl('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore',detached:true}).unref();
 if(platform==='darwin')return spawnImpl('open',[url],{stdio:'ignore',detached:true}).unref();
 return spawnImpl('xdg-open',[url],{stdio:'ignore',detached:true}).unref();
}
async function main(){
 const envPath=join(root,'.env');
 if(existsSync(envPath)){
  if(typeof process.loadEnvFile!=='function')throw new Error('Node.js 22+ is required to load local AI settings');
  process.loadEnvFile(envPath);
 }
 const port=validPort(process.env.PORT||4317);
 const url='http://127.0.0.1:'+port;
 const state=await inspectDashboard(url);
 if(state==='occupied')throw new Error('Port '+port+' is already used by a different service. HAK did not start a second server.');
 if(state==='running'){
  console.log('HAK is already running: '+url);
  if(process.env.HAK_NO_BROWSER!=='1')openBrowser(url);
  return;
 }
 const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:process.env,stdio:'inherit'});
 try{await waitForDashboard(url,child)}catch(error){child.kill();throw error}
 console.log('HAK is ready: '+url);
 if(process.env.HAK_NO_BROWSER!=='1')openBrowser(url);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error('HAK startup failed: '+error.message);process.exitCode=1});
}
