import {spawnSync} from 'node:child_process';
import {probeTools} from './readiness-probes.js';

export function runNpmScript(name,{spawnImpl=spawnSync,platform=process.platform}={}){
 if(!['check','test'].includes(name))throw new Error('Unsupported acceptance script');
 // Windows .cmd shims require cmd.exe; the command is strictly allowlisted and contains no user input.
 const isWindows=platform==='win32';
 const command=isWindows?'cmd.exe':'npm';
 const args=isWindows?['/d','/s','/c','npm run '+name]:['run',name];
 const result=spawnImpl(command,args,{shell:false,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,windowsHide:true,stdio:'pipe'});
 return {id:'npm-'+name,status:result.error?'blocked':result.status===0?'passed':'failed',exitCode:Number.isInteger(result.status)?result.status:null};
}
export async function localAcceptance({env=process.env,platform=process.platform,nodeVersion=process.versions.node,spawnImpl=spawnSync,probeImpl=probeTools}={}){
 const major=Number(nodeVersion.split('.')[0]);
 const node={id:'node-version',status:Number.isInteger(major)&&major>=22?'passed':'failed',major:Number.isInteger(major)?major:null};
 const scripts=['check','test'].map(name=>runNpmScript(name,{spawnImpl,platform}));
 let connectivity;
 try{
  const probe=await probeImpl({env});
  connectivity=probe.checks.map(c=>({id:c.id,status:c.status,verified:false}));
 }catch{connectivity=[{id:'tool-connectivity',status:'blocked',verified:false}];}
 const localChecks=[node,...scripts];
 return {schemaVersion:1,kind:'hak-local-acceptance-diagnostics',platform,nodeMajor:node.major,checks:localChecks,connectivity,localChecksPassed:localChecks.every(c=>c.status==='passed'),externalAgentsVerified:false,readyForProduction:false,notice:'Local checks and endpoint connectivity do not prove actual Ruflo, Claude-Mem or other provider execution. No credentials or command output are collected.'};
}
