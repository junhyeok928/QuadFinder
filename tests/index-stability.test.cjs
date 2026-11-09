const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {IndexEngine}=require('../src/index-engine.cjs');
const {IndexStore}=require('../src/index-store.cjs');
const {key}=require('../src/index-paths.cjs');
const root=path.resolve('stability-fixture');
const entry=name=>({name,path:path.join(root,name),directory:false,size:1,modified:1});

test('incremental stat updates retain Windows hidden, system and readonly attributes',async()=>{
 const item=entry('file.txt');const engine=new IndexEngine({roots:[root],stat:async()=>({isDirectory:()=>false,isSymbolicLink:()=>false,size:3,mtimeMs:2,hidden:true,system:true,readOnly:true})});
 engine.restore([item]);await engine.scan([item.path]);const updated=engine.entries.get(key(item.path));
 assert.equal(updated.hidden,true);assert.equal(updated.system,true);assert.equal(updated.readOnly,true);assert.equal(updated.size,3);
});
test('a cancelled large-directory batch never continues inserting the remaining entries',async()=>{
 const controller=new AbortController(),items=Array.from({length:1200},(_,i)=>entry('file-'+i));
 const engine=new IndexEngine({roots:[root],read:async()=>({entries:items})});
 const running=engine.scan([root],{signal:controller.signal});setImmediate(()=>controller.abort());
 await assert.rejects(running,e=>e.name==='AbortError'||e.code==='ABORT_ERR');assert(engine.entries.size<1200);
});
test('subtree removal yields without leaving orphaned cached descendants',async()=>{
 const store=new IndexStore();try{
  const folder={...entry('folder'),directory:true},engine=new IndexEngine({roots:[root],store});engine.restore([folder]);
  engine.restore(Array.from({length:800},(_,i)=>({...entry('child-'+i),path:path.join(folder.path,'child-'+i)})));
  let yielded=false;setImmediate(()=>{yielded=true;});await engine.removeAsync(folder.path);
  assert(yielded);assert.equal(store.entries.size,0);assert.equal([...store.paths()].length,0);
 }finally{store.close();}
});
test('small updates batch commits but flush on deadline and explicit shutdown',()=>{
 const store=new IndexStore();try{
  const e=entry('file');store.entries.set(key(e.path),e);store.lastCommit=Date.now()+10000;store.flushIfDue();assert(store.pending>0);
  store.lastCommit=Date.now()-300;store.flushIfDue();assert.equal(store.pending,0);assert(Date.now()-store.lastCommit<1000);
 }finally{store.close();}
});
test('stop during root preparation never starts another directory scan',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let receive,preparing=false,scans=0;const messages=[];
 class Store{constructor(){this.entries=new Map();}getMeta(id){return id==='legacyImported';}setMeta(){}flush(){}close(){}}
 class Engine{constructor({roots,store}){this.roots=roots;this.entries=store.entries;}async setRootsAsync(roots,{signal}){preparing=true;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('stop'),{name:'AbortError'})),{once:true}));}async scan(){scans++;}allowed(){return true;}}
 const context=vm.createContext({require:n=>({'node:worker_threads':{parentPort:{postMessage:m=>messages.push(m),on:(_,f)=>{receive=f;}},workerData:{roots:[root]}},'node:fs/promises':{},'./files.cjs':{},'./index-engine.cjs':{IndexEngine:Engine},'./index-store.cjs':{IndexStore:Store},'./index-paths.cjs':{key},'./native-index.cjs':{},'./name-search.cjs':{indexedQuery:()=>false}}[n]),Map,Set,AbortController,setImmediate,process:{platform:'win32',on(){}}});
 vm.runInContext(fs.readFileSync(require.resolve('../src/index-worker.cjs'),'utf8'),context);assert(preparing);receive({type:'stop'});await new Promise(resolve=>setImmediate(resolve));assert.equal(scans,0);assert(messages.some(m=>m.type==='stopped'));
});
