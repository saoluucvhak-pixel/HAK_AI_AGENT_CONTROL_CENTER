import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runGit} from '../src/safe-process.js';
import {tempDir} from './helpers.js';

export async function makeRepo(files={'src/a.js':'export const a=1;\n','README.md':'hi\n'},{pkgTest=true}={}){
 const t=await tempDir();
 const repo=join(t.dir,'repo');
 await mkdir(repo,{recursive:true});
 const g=(...a)=>runGit(a,{cwd:repo});
 await g('init','-q','-b','main');
 if(pkgTest)files={...files,'test/ok.test.js':"import test from 'node:test';import assert from 'node:assert/strict';test('ok',()=>assert.equal(1,1));\n"};
 for(const [p,c] of Object.entries(files)){await mkdir(join(repo,p,'..'),{recursive:true});await writeFile(join(repo,p),c);}
 await g('add','-A');await g('commit','-q','-m','init');
 const sha=(await g('rev-parse','HEAD')).stdout.trim();
 return {...t,repo,sha,g};
}
