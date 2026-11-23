import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {buildLocalAcceptancePacket} from './acceptance-packet.js';

export function acceptanceDirectory({platform=process.platform,env=process.env,home=homedir()}={}){
 const base=platform==='win32'?(env.LOCALAPPDATA||join(home,'AppData','Local')):join(home,'.local','state');
 return resolve(base,'HAK','acceptance');
}
export async function exportLocalAcceptance({platform=process.platform,env=process.env,home=homedir(),build=buildLocalAcceptancePacket,write=writeFile,makeDir=mkdir,now=new Date()}={}){
 const packet=await build({platform,env});
 const directory=acceptanceDirectory({platform,env,home});
 await makeDir(directory,{recursive:true,mode:0o700});
 const stamp=now.toISOString().replace(/[:.]/g,'-');
 const file=join(directory,'acceptance-'+stamp+'.json');
 await write(file,JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
 return {path:file,localChecksPassed:packet.localChecksPassed,readyForProduction:false,sha256:packet.sha256};
}
