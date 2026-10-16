const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {IndexEngine,targets}=require('../src/index-engine.cjs');
const {networkPath,indexable,key}=require('../src/index-paths.cjs');
const root=path.resolve('index-fixture');
const entry=(name,directory=false)=>({name:path.basename(name),path:path.join(root,name),directory,size:1,modified:1});
const info={isSymbolicLink:()=>false,isDirectory:()=>true,size:0,mtimeMs:1,birthtimeMs:1,atimeMs:1};

test('network shares and mapped drives are excluded before filesystem reads and cache restore',async()=>{
  const unc='\\\\192.168.0.77\\Shareds\\',mapped=path.resolve('mapped-network');let reads=0;
  assert(networkPath(unc));assert(networkPath('//server/share'));assert(networkPath(path.join(mapped,'child'),[mapped]));
  assert.equal(indexable(unc,[unc]),false);
  const engine=new IndexEngine({roots:[root,unc,mapped],excluded:[mapped],read:async()=>{reads++;return {entries:[]};}});
  engine.restore([entry('local.txt'),{...entry('remote.txt'),path:path.join(mapped,'remote.txt')},null,{name:'bad'}]);
  assert.equal(engine.entries.size,1);await engine.scan([unc,mapped],{full:true});assert.equal(reads,0);
});
test('case equivalent change notifications coalesce instead of cancelling each other',()=>{
  const value=path.join(root,'Folder');assert.equal(targets([value,value.toUpperCase(),path.join(value,'child')]).length,1);
  assert.equal(targets([value,path.join(root,'Folder-other'),path.join(value,'child')]).length,2);
});
test('directory notifications reconcile immediate children and scan only new subtrees',async()=>{
  const reads=[];const nested=entry('nested',true),old=entry(path.join('nested','old.txt')),added=entry('new',true),newFile=entry(path.join('new','new.txt'));
  const engine=new IndexEngine({roots:[root],read:async value=>{reads.push(value);return {entries:key(value)===key(root)?[nested,added]:[newFile]};}});
  engine.restore([nested,old]);await engine.scan([root]);assert.deepEqual(reads,[root,added.path]);assert(engine.entries.has(key(old.path)));assert(engine.entries.has(key(newFile.path)));
});
test('unresponsive folders time out, preserve cached records and complete with a warning',async()=>{
  const engine=new IndexEngine({roots:[root],timeout:25,read:()=>new Promise(()=>{})});engine.restore([entry('kept.txt')]);
  const started=Date.now(),status=await engine.scan([root],{full:true});assert(Date.now()-started<1000);assert.equal(status.skipped,1);assert.equal(status.warnings[0].code,'ETIMEDOUT');assert.equal(engine.entries.size,1);
});
test('root removal cancels blocked I/O immediately without resurrecting old results',async()=>{
  let complete;const controller=new AbortController();const engine=new IndexEngine({roots:[root],read:()=>new Promise(resolve=>{complete=resolve;})});engine.restore([entry('old.txt')]);
  const running=engine.scan([root],{full:true,signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));engine.setRoots([]);controller.abort();await assert.rejects(running,{code:'ABORT_ERR'});complete({entries:[entry('late.txt')]});await new Promise(resolve=>setImmediate(resolve));assert.equal(engine.entries.size,0);
});
test('verified deletion removes descendants, unreadable parents preserve previous results',async()=>{
  const folder=entry('nested',true),file=entry(path.join('nested','file.txt'));
  const engine=new IndexEngine({roots:[root],stat:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},read:async()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});}});engine.restore([folder,file]);
  assert.equal((await engine.scan([folder.path])).skipped,1);assert.equal(engine.entries.size,2);
  engine.read=async()=>({entries:[]});await engine.scan([folder.path]);assert.equal(engine.entries.size,0);
});
test('capacity limit still permits existing records to update and never exceeds the cap',async()=>{
  const a=entry('a.txt'),b=entry('b.txt');const engine=new IndexEngine({roots:[root],maxEntries:1,read:async()=>({entries:[{...a,size:10},b]})});engine.restore([a]);const result=await engine.scan([root]);assert.equal(engine.entries.size,1);assert.equal(engine.entries.get(key(a.path)).size,10);assert(result.limited);
});
test('unchanged scans do not mutate the cache revision and failed child reads preserve subtrees',async()=>{
  const folder=entry('nested',true),file=entry(path.join('nested','file.txt'));const engine=new IndexEngine({roots:[root],read:async value=>{if(key(value)!==key(root))throw Object.assign(new Error('denied'),{code:'EACCES'});return {entries:[folder]};}});engine.restore([folder,file]);const revision=engine.revision;
  const result=await engine.scan([root],{full:true});assert.equal(result.skipped,1);assert.equal(engine.revision,revision);assert.equal(engine.entries.size,2);
});
test('excluded directories are filtered before metadata reads',async()=>{
  const engine=new IndexEngine({roots:[root],excluded:[path.join(root,'excluded')],stat:async()=>info,read:async(value,options)=>{assert.equal(options.include(path.join(root,'excluded','large')),false);assert.equal(options.include(path.join(root,'normal.txt')),true);return {entries:[]};}});await engine.scan([root],{full:true});
});
test('updates through a linked ancestor never publish external file metadata',async()=>{
  const folder=entry('linked',true),file=entry(path.join('linked','outside.txt'));let reads=0;
  const engine=new IndexEngine({roots:[root],stat:async value=>({...info,isDirectory:()=>key(value)!==key(file.path),isSymbolicLink:()=>key(value)===key(folder.path)}),read:async()=>{reads++;return {entries:[]};}});
  await engine.scan([file.path]);assert.equal(reads,0);assert.equal(engine.entries.size,0);
});
test('a shallow parent notification does not swallow an explicit deep file update',async()=>{
  const folder=entry('nested',true),file=entry(path.join('nested','file.txt'));const engine=new IndexEngine({roots:[root],stat:async value=>({...info,isDirectory:()=>key(value)!==key(file.path),size:99}),read:async()=>({entries:[folder]})});engine.restore([folder,file]);
  await engine.scan([root,file.path]);assert.equal(engine.entries.get(key(file.path)).size,99);
});


test('diagnostics distinguish permission, timeout and disappearing paths and clear recovered or deleted failures',async()=>{
  const folder=entry('blocked',true);let fail=true;
  const engine=new IndexEngine({roots:[root],read:async value=>{if(value===root)return {entries:[folder]};if(fail)throw Object.assign(new Error('denied'),{code:'EACCES'});return {entries:[]};}});
  let status=await engine.scan([root],{full:true});assert.equal(status.issues.denied,1);assert.equal(status.issues.timedOut,0);
  fail=false;status=await engine.scan([root],{full:true});assert.equal(status.problemCount,0);
  fail=true;await engine.scan([root],{full:true});engine.read=async()=>({entries:[]});status=await engine.scan([root],{full:true});assert.equal(status.problemCount,0);
  engine.failures.set('timeout',{path:root,code:'ETIMEDOUT'});engine.failures.set('missing',{path:root,code:'ENOENT'});assert.equal(engine.diagnostics().issues.timedOut,1);assert.equal(engine.diagnostics().issues.missing,1);
});


test('root changes cancel an in-flight metadata request before a new native directory request',async()=>{
  let cancelled=false;const controller=new AbortController();
  const engine=new IndexEngine({roots:[root],stat:(_value,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{cancelled=true;reject(Object.assign(new Error('cancelled'),{code:'ABORT_ERR'}));},{once:true}))});
  const running=engine.scan([entry('file.txt').path],{signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(running,{code:'ABORT_ERR'});assert(cancelled);
});
