import {readFile,mkdir,open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {EventStore} from './event-store.js';

export async function backupObserver({source='./data/agent-events.jsonl',destination}={}){
 if(typeof destination!=='string'||!destination.trim())throw new Error('Backup destination required');
 const src=resolve(source),dest=resolve(destination);
 if(src===dest)throw new Error('Backup destination must differ from source');
 const before=await stat(src);
 if(!before.isFile())throw new Error('Observer source must be a regular file');
 const original=await readFile(src);
 const store=new EventStore(src);await store.load();
 const after=await stat(src);
 const confirmed=await readFile(src);
 if(!original.equals(confirmed)||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw new Error('Observer source changed during backup; stop the dashboard and retry');
 const events=store.list();
 if(events.length===0)throw new Error('Observer source has no events; refusing empty backup');
 const data=original;
 const digest=createHash('sha256').update(data).digest('hex');
 await mkdir(dirname(dest),{recursive:true,mode:0o700});
 const file=await open(dest,'wx',0o600);
 try{await file.writeFile(data);await file.sync()}finally{await file.close()}
 return {kind:'hak-observer-backup',eventCount:events.length,sha256:digest,readyForProduction:false};
}
export async function verifyObserverBackup({path,expectedSha256}={}){
 if(typeof path!=='string'||!path.trim())throw new Error('Backup path required');
 if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))throw new Error('Expected SHA256 required');
 const data=await readFile(path,'utf8');
 const actual=createHash('sha256').update(data).digest('hex');
 if(actual!==expectedSha256)return {valid:false,reason:'checksum-mismatch'};
 const store=new EventStore(path);await store.load();
 return {valid:true,eventCount:store.list().length,sha256:actual,restored:false};
}
