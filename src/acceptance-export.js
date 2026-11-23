import {mkdir,writeFile} from 'node:fs/promises';
import {posix,win32} from 'node:path';
import {homedir} from 'node:os';
import {buildLocalAcceptancePacket} from './acceptance-packet.js';

export function acceptanceDirectory({platform=process.platform,env=process.env,home=homedir()}={}){
 const path=platform==='win32'?win32:posix;
 const base=platform==='win32'?(env.LOCALAPPDATA||path.join(home,'AppData','Local')):path.join(home,'.local','state');
 return path.resolve(base,'HAK','acceptance');
}
export async function exportLocalAcceptance({platform=process.platform,env=process.env,home=homedir(),build=buildLocalAcceptancePacket,write=writeFile,makeDir=mkdir,now=new Date()}={}){
 const packet=await build({platform,env});
 const directory=acceptanceDirectory({platform,env,home});
 await makeDir(directory,{recursive:true,mode:0o700});
 const stamp=now.toISOString().replace(/[:.]/g,'-');
 const file=(platform==='win32'?win32:posix).join(directory,'acceptance-'+stamp+'.json');
 await write(file,JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
 return {path:file,localChecksPassed:packet.localChecksPassed,readyForProduction:false,sha256:packet.sha256};
}
