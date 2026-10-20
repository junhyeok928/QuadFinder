const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {createLauncher}=require('../src/terminal.cjs');
function fixture(errors=[]){
 const calls=[];const launch=(file,args,options)=>{const child=new EventEmitter();child.unref=()=>{child.unreferenced=true;};calls.push({file,args,options,child});queueMicrotask(()=>{const code=errors.shift();child.emit(code?'error':'spawn',code?Object.assign(new Error(code),{code}):undefined);});return child;};
 return {calls,open:createLauncher({launch,stat:async()=>({isDirectory:()=>true}),environment:{LOCALAPPDATA:path.resolve('test-appdata'),SystemRoot:'C:\\Windows'}})};
}
test('terminal keeps special folder characters outside command arguments',async()=>{
 const {calls,open}=fixture();const folder=path.resolve('한글 폴더; $문자 & 괄호(1)');await open(folder);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].args,['--startingDirectory','.']);assert.equal(calls[0].options.cwd,folder);assert.equal(calls[0].options.shell,false);assert(calls[0].child.unreferenced);
});
test('missing Windows Terminal falls back to Windows PowerShell',async()=>{
 const {calls,open}=fixture(['ENOENT']);const folder=path.parse(process.cwd()).root;const result=await open(folder);
 assert.equal(calls.length,2);assert.match(calls[1].file,/WindowsPowerShell/);assert.deepEqual(calls[1].args,['-NoExit']);assert.equal(calls[1].options.cwd,folder);assert.equal(result.program,'Windows PowerShell');
});
test('terminal launch errors are reported without another launch',async()=>{
 const {calls,open}=fixture(['EACCES']);await assert.rejects(open(process.cwd()),{code:'EACCES'});assert.equal(calls.length,1);
});
test('terminal rejects files and relative paths before launching',async()=>{
 let launched=false;const open=createLauncher({launch:()=>{launched=true;},stat:async()=>({isDirectory:()=>false})});
 await assert.rejects(open(process.cwd()),/폴더/);await assert.rejects(open('relative'),/절대 경로/);assert.equal(launched,false);
});
