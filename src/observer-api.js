import {TaskRegistry} from './core.js';
import {timingSafeEqual} from 'node:crypto';

function authorized(header,token){
 if(typeof header!=='string'||!header.startsWith('Bearer '))return false;
 const supplied=Buffer.from(header.slice(7),'utf8');
 const expected=Buffer.from(token,'utf8');
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}

export function createObserverApi({token,registry=new TaskRegistry(),localReadOnly=false}={}){
 if(typeof token!=='string'||token.length<24)throw new Error('Observer token must be at least 24 characters');
 return async function handle(req,res,path){
  if(path!=='/api/agent-events'&&path!=='/api/agent-status')return false;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const respond=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
  if(!(localReadOnly&&path==='/api/agent-status'&&req.method==='GET')&&!authorized(req.headers.authorization,token)){respond(401,{error:'unauthorized'});return true;}
  if(path==='/api/agent-status'&&req.method==='GET'){respond(200,{tasks:registry.summary(),source:registry.persistent?'local-observer-jsonl':'local-observer-memory',persistent:registry.persistent===true});return true;}
  if(path==='/api/agent-events'&&req.method==='POST'){
   const chunks=[];let size=0;
   try{
    for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,'utf8');size+=bytes.length;if(size>8192){respond(413,{error:'payload too large'});return true;}chunks.push(bytes);}
    const event=await registry.add(JSON.parse(Buffer.concat(chunks,size).toString('utf8')));
    respond(201,event);
   }catch{respond(400,{error:'invalid event'});}
   return true;
  }
  respond(405,{error:'method not allowed'});return true;
 };
}
