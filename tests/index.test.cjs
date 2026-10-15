const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Worker}=require('node:worker_threads');

function message(worker,predicate){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{cleanup();reject(new Error('index timeout'));},10000);
  const receive=value=>{if(predicate(value)){cleanup();resolve(value);}};
  const error=value=>{cleanup();reject(value);};
  const cleanup=()=>{clearTimeout(timer);worker.off('message',receive);worker.off('error',error);};
  worker.on('message',receive);worker.on('error',error);
});}
test('index cache loads, deduplicates overlapping roots and refreshes after changes',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-index-cache-'));
  const files=path.join(root,'files'),cachePath=path.join(root,'cache.json');let worker;
  try{
    await fs.mkdir(path.join(files,'nested'),{recursive:true});await fs.writeFile(path.join(files,'nested','first.txt'),'first');
    const stale=Array.from({length:8},(_,i)=>({name:`old${i}.txt`,path:path.join(files,`old${i}.txt`),directory:false,size:1,modified:0}));
    await fs.writeFile(cachePath,JSON.stringify({version:1,roots:[files,path.join(files,'nested')],entries:stale}));
    worker=new Worker(path.join(__dirname,'../src/index-worker.cjs'),{workerData:{roots:[files,path.join(files,'nested')],cachePath}});
    const initial=message(worker,value=>value.type==='status'&&value.indexing),ready=message(worker,value=>value.type==='status'&&!value.indexing);
    assert.equal((await initial).count,8);assert.equal((await ready).count,2);
    assert.equal(JSON.parse(await fs.readFile(cachePath,'utf8')).entries.length,2);
    const unchanged=await fs.readFile(cachePath,'utf8'),unchangedTime=(await fs.stat(cachePath)).mtimeMs;
    const same=message(worker,value=>value.type==='status'&&!value.indexing);worker.postMessage({type:'rebuild',roots:[files,path.join(files,'nested')]});await same;
    assert.equal(await fs.readFile(cachePath,'utf8'),unchanged);assert.equal((await fs.stat(cachePath)).mtimeMs,unchangedTime);
    await fs.writeFile(path.join(files,'second.txt'),'second');
    const refreshed=message(worker,value=>value.type==='status'&&!value.indexing);worker.postMessage({type:'rebuild',roots:[files]});assert.equal((await refreshed).count,3);
    const result=message(worker,value=>value.type==='results'&&value.id===2);worker.postMessage({id:2,query:'*.txt',filter:'documents'});assert.equal((await result).total,2);
    await fs.unlink(path.join(files,'second.txt'));
    const removed=message(worker,value=>value.type==='status'&&!value.indexing);worker.postMessage({type:'rebuild',roots:[files]});assert.equal((await removed).count,2);
  }finally{await worker?.terminate();assert(path.basename(root).startsWith('quadfinder-index-cache-'));await fs.rm(root,{recursive:true,force:true});}
});

test('incremental updates keep unrelated entries, remove deleted trees and ignore internal paths',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-index-cache-'));let worker;
  try{
    const files=path.join(root,'files'),cachePath=path.join(root,'cache.json');await fs.mkdir(files);await fs.writeFile(path.join(files,'stable.txt'),'stable');
    worker=new Worker(path.join(__dirname,'../src/index-worker.cjs'),{workerData:{roots:[files],cachePath}});
    await message(worker,v=>v.type==='status'&&!v.indexing);
    const update=async paths=>{const ready=message(worker,v=>v.type==='status'&&!v.indexing);worker.postMessage({type:'update',paths});return ready;};
    const nested=path.join(files,'nested');await fs.mkdir(nested);await fs.writeFile(path.join(nested,'new.txt'),'new');
    assert.equal((await update([nested,path.join(nested,'new.txt')])).count,3);
    let result=message(worker,v=>v.type==='results'&&v.id===9);worker.postMessage({id:9,query:'stable',filter:'all'});assert.equal((await result).total,1);
    const cached=await fs.readFile(cachePath,'utf8');await update([path.join(nested,'new.txt')]);assert.equal(await fs.readFile(cachePath,'utf8'),cached);
    await fs.rm(nested,{recursive:true});assert.equal((await update([nested])).count,1);
    const {indexable}=require('../src/index-paths.cjs');assert.equal(indexable(path.join(files,'.git','index'),[files]),false);assert.equal(indexable(path.join(files,'node_modules','foo'),[files]),false);assert.equal(indexable(path.join(files,'.quadfinder-temp'),[files]),false);assert.equal(indexable(root,[files]),false);assert.equal(indexable(path.join(files,'settings','index.json'),[files],[path.join(files,'settings')]),false);
  }finally{await worker?.terminate();assert(path.basename(root).startsWith('quadfinder-index-cache-'));await fs.rm(root,{recursive:true,force:true});}
});
