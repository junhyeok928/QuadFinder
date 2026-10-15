const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {UndoManager}=require('../src/undo.cjs'),{OperationQueue,renameItem}=require('../src/operations.cjs');
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-undo-'));try{const source=path.join(root,'source'),target=path.join(root,'target'),bin=path.join(root,'bin');await Promise.all([source,target,bin].map(dir=>fs.mkdir(dir)));let serial=0;const trash=file=>fs.rename(file,path.join(bin,String(++serial)));const undo=new UndoManager({trash});await run({root,source,target,bin,trash,undo});}finally{assert(path.basename(root).startsWith('quadfinder-undo-'));await fs.rm(root,{recursive:true,force:true});}}
test('undo copy preserves original and refuses a modified copy even with identical size and timestamp',()=>fixture(async({source,target,undo})=>{
 const original=path.join(source,'a.txt'),copy=path.join(target,'a.txt');await fs.writeFile(original,'first');await fs.copyFile(original,copy);await undo.record([{kind:'copy',source:original,target:copy}],'복사');
 const stat=await fs.stat(copy);await fs.writeFile(copy,'other');await fs.utimes(copy,stat.atime,stat.mtime);await assert.rejects(undo.undo(),/변경/);assert.equal(await fs.readFile(copy,'utf8'),'other');assert.equal(await fs.readFile(original,'utf8'),'first');assert.equal(undo.snapshot().count,1);
}));
test('undo grouped copies moves only completed copies to recycle bin',()=>fixture(async({source,target,undo,bin})=>{
 const actions=[];for(const name of ['a.txt','b.txt']){const from=path.join(source,name),to=path.join(target,name);await fs.writeFile(from,name);await fs.copyFile(from,to);actions.push({kind:'copy',source:from,target:to});}await undo.record(actions,'복사');await undo.undo();assert.equal((await fs.readdir(target)).length,0);assert.equal((await fs.readdir(source)).length,2);assert.equal((await fs.readdir(bin)).length,2);assert.equal(undo.snapshot().count,0);
}));
test('undo rename restores name, refuses occupied original path and permits retry',()=>fixture(async({source,undo})=>{
 const from=path.join(source,'old.txt');await fs.writeFile(from,'content');const to=await renameItem(from,'new.txt');await undo.record([{kind:'rename',source:from,target:to}],'이름 변경');await fs.writeFile(from,'different');await assert.rejects(undo.undo(),/다른 항목/);assert.equal(await fs.readFile(from,'utf8'),'different');await fs.unlink(from);await undo.undo();assert.equal(await fs.readFile(from,'utf8'),'content');await assert.rejects(fs.stat(to),{code:'ENOENT'});
}));
test('undo move restores conflict-renamed destination to the exact original name',()=>fixture(async({source,target,undo,trash})=>{
 const from=path.join(source,'old.txt'),to=path.join(target,'old (2).txt');await fs.writeFile(to,'moved');await undo.record([{kind:'move',source:from,target:to}],'이동');await undo.undo();assert.equal(await fs.readFile(from,'utf8'),'moved');await assert.rejects(fs.stat(to),{code:'ENOENT'});assert.equal(undo.snapshot().count,0);
}));
test('folder undo refuses added files and blocked operations cannot run concurrently',()=>fixture(async({source,target,undo})=>{
 const folder=path.join(target,'folder');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'a'),'a');await undo.record([{kind:'copy',source:path.join(source,'folder'),target:folder}],'복사');await fs.writeFile(path.join(folder,'new'),'new');await assert.rejects(undo.undo(),/변경/);assert.equal(await fs.readFile(path.join(folder,'new'),'utf8'),'new');undo.working=()=>true;await assert.rejects(undo.undo(),/진행 중/);
}));
test('operation queue records successful copies and undo chains survive a later rename',()=>fixture(async({source,target,undo,trash})=>{
 const original=path.join(source,'a.txt'),copy=path.join(target,'a.txt');await fs.writeFile(original,'data');const queue=new OperationQueue({trash,completed:(actions,label)=>undo.record(actions,label)});queue.enqueue({kind:'copy',sources:[original],destination:target});for(let i=0;i<200&&queue.active();i++)await new Promise(resolve=>setTimeout(resolve,10));while(queue.running)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(undo.snapshot().count,1);
 const renamed=await renameItem(copy,'b.txt');await undo.record([{kind:'rename',source:copy,target:renamed}],'이름 변경');await undo.undo();await undo.undo();await assert.rejects(fs.stat(copy),{code:'ENOENT'});assert.equal(await fs.readFile(original,'utf8'),'data');
}));
test('cancelling undo preparation leaves files intact and clears stale previous history',()=>fixture(async({source,target,undo})=>{
 const original=path.join(source,'a'),copy=path.join(target,'a');await fs.writeFile(original,'data');await fs.copyFile(original,copy);await undo.record([{kind:'copy',source:original,target:copy}],'복사');const preparing=undo.record([{kind:'copy',source:original,target:copy}],'복사');undo.cancel();await assert.rejects(preparing,{name:'AbortError'});assert.equal(await fs.readFile(copy,'utf8'),'data');assert.equal(undo.snapshot().count,0);assert.equal(undo.snapshot().busy,false);
}));
test('a direct trash operation clears older undo records instead of undoing an unrelated copy',()=>fixture(async({source,target,undo,trash})=>{
 const original=path.join(source,'a'),copy=path.join(target,'a');await fs.writeFile(original,'data');await fs.copyFile(original,copy);await undo.record([{kind:'copy',source:original,target:copy}],'복사');const queue=new OperationQueue({trash});queue.on('trashed',()=>undo.clear());queue.enqueue({kind:'trash',sources:[original]});while(queue.active()||queue.running)await new Promise(r=>setTimeout(r,10));assert.equal(undo.snapshot().count,0);assert.equal(await fs.readFile(copy,'utf8'),'data');
}));
