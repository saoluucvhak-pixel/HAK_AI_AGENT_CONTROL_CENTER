import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceDirectory,exportLocalAcceptance} from '../src/acceptance-export.js';
test('Windows export uses private local appdata folder and exclusive file',async()=>{
 let written;
 const result=await exportLocalAcceptance({platform:'win32',env:{LOCALAPPDATA:'C:/Users/Example/AppData/Local'},now:new Date('2026-11-23T00:00:00Z'),build:async()=>({kind:'hak-acceptance-evidence-packet',localChecksPassed:true,checks:[],connectivity:[],required:[],sha256:'a'.repeat(64),readyForProduction:false}),makeDir:async()=>{},write:async(path,content,options)=>{written={path,content,options}}});
 assert.match(result.path,/HAK[/\\]acceptance[/\\]acceptance-/);
 assert.equal(written.options.flag,'wx');assert.equal(written.options.mode,0o600);
 assert.equal(result.readyForProduction,false);
});
test('does not overwrite existing evidence',async()=>{
 await assert.rejects(()=>exportLocalAcceptance({platform:'linux',home:'/tmp/example',now:new Date('2026-11-23T00:00:00Z'),build:async()=>({kind:'hak-acceptance-evidence-packet',localChecksPassed:false,checks:[],connectivity:[],required:[],sha256:'b'.repeat(64),readyForProduction:false}),makeDir:async()=>{},write:async()=>{throw Object.assign(new Error('exists'),{code:'EEXIST'})}}),{code:'EEXIST'});
});
test('Linux path is inside home state folder',()=>{
 assert.equal(acceptanceDirectory({platform:'linux',home:'/home/example'}),'/home/example/.local/state/HAK/acceptance');
});
