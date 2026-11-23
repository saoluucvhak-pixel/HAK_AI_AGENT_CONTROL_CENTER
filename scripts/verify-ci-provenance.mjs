import {readFileSync} from 'node:fs';
const file=process.argv[2]||'ci-provenance.json';
const p=JSON.parse(readFileSync(file,'utf8'));
const valid=p?.schemaVersion===1&&p.kind==='hak-github-ci-provenance'&&
 /^[a-f0-9]{40}$/.test(p.commitSha||'')&&
 /^[1-9][0-9]*$/.test(p.runId||'')&&
 ['Windows','Linux'].includes(p.runnerOS)&&
 typeof p.repository==='string'&&p.repository.includes('/')&&
 typeof p.nodeVersion==='string'&&p.nodeVersion.startsWith('v22.');
if(!valid)throw new Error('Invalid GitHub-hosted CI provenance');
if(p.event==='push'){
 if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==p.commitSha)
  throw new Error('Main release gate: unexpected branch or commit');
}else if(p.event==='pull_request'){
 if(process.env.GITHUB_SHA!==p.commitSha)throw new Error('PR gate: commit mismatch');
}else throw new Error('Unsupported workflow event');
process.stdout.write(JSON.stringify({kind:'hak-ci-provenance-check',event:p.event,commitSha:p.commitSha,verified:true,productionApproved:false})+'\n');
