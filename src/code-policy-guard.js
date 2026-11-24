const SECRET_PATTERNS=[
 /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/,
 /github_pat_[a-zA-Z0-9_]{82}/,
 /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
 /(?:api[_-]?key|secret|password|auth[_-]?token)\s*[:=]\s*["'][a-zA-Z0-9_!@#$%^&*-]{10,}["']/i,
 /Bearer\s+[a-zA-Z0-9_\-\.]{24,}/
];

const ALLOWED_PATH_PATTERN=/^(?:(?:app|docs|desk|src|tests|scripts)\/[a-zA-Z0-9_./-]{1,180}|README\.md|package\.json|\.gitignore)$/;

export function inspectCodePolicy(changes,{
 maxFiles=10,
 maxTotalBytes=80000,
 maxFileBytes=64000
}={}){
 if(!Array.isArray(changes)||changes.length===0)throw new Error('Changes array must not be empty');
 if(changes.length>maxFiles)throw new Error(`Changes exceed limit of ${maxFiles} files`);

 const violations=[];
 let totalBytes=0;

 for(let i=0;i<changes.length;i++){
  const change=changes[i];
  if(!change||typeof change!=='object'||Array.isArray(change)){
   violations.push({index:i,rule:'format',message:'Invalid change object'});
   continue;
  }
  const path=change.path;
  if(typeof path!=='string'||!ALLOWED_PATH_PATTERN.test(path)||path.includes('..')||path.startsWith('/')||path.startsWith('\\')){
   violations.push({index:i,path:String(path),rule:'path-safety',message:'Path outside allowlisted project structure or traversal attempted'});
  }

  const content=change.newContent;
  if(typeof content!=='string'){
   violations.push({index:i,path:String(path),rule:'content-type',message:'newContent must be a UTF-8 string'});
   continue;
  }
  if(content.includes('\0')){
   violations.push({index:i,path:String(path),rule:'null-byte',message:'Content contains illegal null bytes'});
  }

  const bytes=Buffer.byteLength(content,'utf8');
  totalBytes+=bytes;
  if(bytes>maxFileBytes){
   violations.push({index:i,path:String(path),rule:'file-size',message:`File exceeds size limit of ${maxFileBytes} bytes (${bytes} bytes)`});
  }

  for(const pattern of SECRET_PATTERNS){
   if(pattern.test(content)){
    violations.push({index:i,path:String(path),rule:'secret-leak',message:'Potential secret, private key, or credential detected in patch'});
    break;
   }
  }
 }

 if(totalBytes>maxTotalBytes){
  violations.push({rule:'total-size',message:`Total patch exceeds limit of ${maxTotalBytes} bytes (${totalBytes} bytes)`});
 }

 return {
  valid:violations.length===0,
  violations,
  stats:{
   filesCount:changes.length,
   totalBytes
  }
 };
}

export function assertCodePolicy(changes,options={}){
 const inspection=inspectCodePolicy(changes,options);
 if(!inspection.valid){
  const first=inspection.violations[0];
  throw new Error(`HAK Code Policy violation (${first.rule}): ${first.message}${first.path?' in '+first.path:''}`);
 }
 return inspection;
}
