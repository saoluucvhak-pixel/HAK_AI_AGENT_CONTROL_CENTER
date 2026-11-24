import {lstat,realpath} from 'node:fs/promises';
import {join,sep,resolve} from 'node:path';

const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// Files that change what runs (or leak secrets): denied unless the approved scope names the exact file.
const SENSITIVE=[/^\.git/i,/^\.github\//i,/^package\.json$/i,/^package-lock\.json$/i,/^yarn\.lock$/i,/^pnpm-lock\.yaml$/i,/(^|\/)\.env/i,/\.(cmd|bat|ps1|vbs|sh|exe|dll|msi)$/i,/(^|\/)node_modules\//i,/(^|\/)\.git(\/|$)/i];
export class PathError extends Error{constructor(message){super(message);this.code='PATH';}}
function globToRegExp(glob){
 let re='';
 for(let i=0;i<glob.length;i++){
  const c=glob[i];
  if(c==='*'){if(glob[i+1]==='*'){re+='.*';i++;if(glob[i+1]==='/')i++;}else re+='[^/]*';}
  else if(c==='?')re+='[^/]';
  else re+=c.replace(/[.+^${}()|[\]\\]/g,'\\$&');
 }
 return new RegExp('^'+re+'$','i');
}
export function matchesScope(rel,scope){return scope.some(p=>globToRegExp(p).test(rel));}
function namedExactly(rel,scope){return scope.some(p=>!/[*?]/.test(p)&&p.toLowerCase()===rel.toLowerCase());}
/** Returns the normalised repo-relative path or throws PathError. Pure string checks, Windows hazards included. */
export function validateEditPath(rel,scope){
 if(typeof rel!=='string'||!rel||rel.length>240||rel.includes('\0'))throw new PathError('Đường dẫn không hợp lệ');
 if(!Array.isArray(scope)||scope.length===0)throw new PathError('Cần khai báo phạm vi được phép sửa');
 if(rel.includes('\\'))throw new PathError('Không dùng dấu \\ trong đường dẫn');
 if(rel.startsWith('/')||/^[a-zA-Z]:/.test(rel))throw new PathError('Không dùng đường dẫn tuyệt đối');
 if(rel.includes(':'))throw new PathError('Không dùng ":" (luồng dữ liệu thay thế NTFS)');
 for(const seg of rel.split('/')){
  if(!seg||seg==='.'||seg==='..')throw new PathError('Đường dẫn chứa đoạn rỗng hoặc ..');
  if(/[. ]$/.test(seg))throw new PathError('Đoạn đường dẫn không được kết thúc bằng dấu chấm hoặc khoảng trắng');
  if(RESERVED.test(seg))throw new PathError('Tên dành riêng của Windows: '+seg);
  if(/[<>"|?*]/.test(seg))throw new PathError('Ký tự không hợp lệ trong tên tệp');
 }
 if(!matchesScope(rel,scope))throw new PathError('Ngoài phạm vi được phê duyệt: '+rel);
 if(SENSITIVE.some(r=>r.test(rel))&&!namedExactly(rel,scope))throw new PathError('Tệp nhạy cảm cần được nêu đích danh trong phạm vi: '+rel);
 return rel;
}
/** Refuses to write through symlinks/junctions: every existing component must be a real directory inside the root. */
export async function assertInsideRoot(root,rel){
 const realRoot=await realpath(root);
 let cur=resolve(root);
 const parts=rel.split('/');
 for(let i=0;i<parts.length;i++){
  cur=join(cur,parts[i]);
  let st;
  try{st=await lstat(cur);}catch(e){if(e.code==='ENOENT')break;throw e;}
  if(st.isSymbolicLink())throw new PathError('Từ chối ghi qua liên kết tượng trưng: '+rel);
  if(i<parts.length-1&&!st.isDirectory())throw new PathError('Thành phần đường dẫn không phải thư mục');
 }
 const parent=join(resolve(root),...parts.slice(0,-1));
 let realParent;
 try{realParent=await realpath(parent);}catch(e){if(e.code==='ENOENT')return join(resolve(root),...parts);throw e;}
 if(realParent!==realRoot&&!realParent.startsWith(realRoot+sep))throw new PathError('Đường dẫn thoát khỏi workspace');
 return join(resolve(root),...parts);
}
