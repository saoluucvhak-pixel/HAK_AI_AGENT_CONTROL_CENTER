import {timingSafeEqual} from 'node:crypto';

export function allowedHosts(port){return new Set(['127.0.0.1:'+port,'localhost:'+port,'[::1]:'+port]);}
export function allowedOrigins(port){return new Set(['http://127.0.0.1:'+port,'http://localhost:'+port,'http://[::1]:'+port]);}
/** DNS-rebinding defence: the Host header must be this machine on this port. */
export function hostAllowed(req,port){return allowedHosts(port).has(String(req.headers.host||'').toLowerCase());}
export function originAllowed(req,port){return allowedOrigins(port).has(String(req.headers.origin||''));}
/** Reads that return secrets/tokens: refuse anything a browser marks cross-site or with a foreign Origin. */
export function sameOriginRead(req,port){
 if(req.headers['sec-fetch-site']==='cross-site')return false;
 if(req.headers.origin&&!originAllowed(req,port))return false;
 return true;
}
export function tokenMatches(req,token){
 const candidate=req.headers['x-hak-operator-token'];
 if(typeof candidate!=='string'||candidate.length!==token.length)return false;
 return timingSafeEqual(Buffer.from(candidate),Buffer.from(token));
}
export function sendJson(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
export async function readJsonBody(req,limit=64*1024){
 let bytes=0;const parts=[];
 for await(const part of req){bytes+=part.length;if(bytes>limit){const e=new Error('Request too large');e.code='TOO_LARGE';throw e;}parts.push(part);}
 if(bytes===0)return {};
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{const e=new Error('Invalid JSON');e.code='BAD_JSON';throw e;}
}
/** Sliding-window limiter for mutating API calls. */
export function createRateLimiter({limit=120,windowMs=60000,now=()=>Date.now()}={}){
 const hits=[];
 return ()=>{const t=now();while(hits.length&&hits[0]<=t-windowMs)hits.shift();if(hits.length>=limit)return false;hits.push(t);return true;};
}
