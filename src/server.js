import http from 'node:http';
import {TaskRegistry,skillObservation} from './core.js';
const registry=new TaskRegistry();const observations=[];
const port=Number(process.env.PORT||8080);
const token=process.env.HAK_OBSERVER_TOKEN;
if(!token || token.length<24){console.error('Set HAK_OBSERVER_TOKEN to a random secret >=24 chars');process.exit(1);}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  const respond=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
  if(req.headers.authorization!==`Bearer ${token}`)return respond(401,{error:'unauthorized'});
  if(req.method==='GET'&&req.url==='/health')return respond(200,{status:'ok'});
  if(req.method==='GET'&&req.url==='/tasks')return respond(200,{tasks:registry.summary()});
  if(req.method==='GET'&&req.url==='/observations')return respond(200,{observations});
  if(req.method==='POST'&&['/events','/observations'].includes(req.url)){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return respond(413,{error:'payload too large'});}
    try{const payload=JSON.parse(body);if(req.url==='/events')return respond(201,registry.add(payload));const o=skillObservation(payload);observations.push(o);return respond(201,o);}catch{return respond(400,{error:'invalid payload'});}
  }
  return respond(404,{error:'not found'});
});
server.listen(port,'127.0.0.1',()=>console.log(`HAK observer local API on 127.0.0.1:${port}`));
