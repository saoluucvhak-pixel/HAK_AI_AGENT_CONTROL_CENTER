import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshots} from './github.js';
import {createObserverApi} from './observer-api.js';
const htmlPath=fileURLToPath(new URL('../web/index.html',import.meta.url));
const port=Number(process.env.PORT||4317);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const host='127.0.0.1';
const observer=process.env.HAK_OBSERVER_TOKEN?.length>=24?createObserverApi({token:process.env.HAK_OBSERVER_TOKEN}):null;
let cache=null,cacheTime=0;
export const server=createServer(async(req,res)=>{
 const path=new URL(req.url||'/', 'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
 try{
  if(path==='/api/agent-events'||path==='/api/agent-status'){
   if(!observer){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Observer disabled; set HAK_OBSERVER_TOKEN'}));return;}
   await observer(req,res,path);return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end('Method Not Allowed');return;}
  if(path==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,mode:'read-only',host}));return;}
  if(path==='/api/repos'){
   if(!cache||Date.now()-cacheTime>60000){cache=await snapshots();cacheTime=Date.now();}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({repos:cache,updatedAt:new Date(cacheTime).toISOString()}));return;
  }
  if(path==='/'||path==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(htmlPath));return;}
  if(path==='/app.js'||path==='/style.css'){const file=fileURLToPath(new URL('../web/'+path.slice(1),import.meta.url));res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});res.end(await readFile(file));return;}
  res.writeHead(404);res.end('Not Found');
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Dashboard unavailable'}));}
});
if(process.env.NODE_ENV!=='test')server.listen(port,host,()=>console.log('HAK dashboard on http://'+host+':'+port));
