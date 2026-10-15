const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const path=require('node:path');
const {listDirectory,matches}=require('./files.cjs');
let entries=[];
let indexing=false;
let requested=null;
let roots=workerData.roots;
const MAX_ENTRIES=250000;
const ignored=new Set(['node_modules','.git','$Recycle.Bin','System Volume Information']);
const key=value=>path.resolve(value).toLowerCase();
const rootKey=values=>[...new Set(values.map(key))].sort().join('\n');
const excluded=(workerData.excludePaths||[]).map(key);
const isExcluded=value=>excluded.some(root=>key(value)===root||key(value).startsWith(root+path.sep));

async function build(nextRoots){
  requested=nextRoots;
  if(indexing)return;
  indexing=true;
  while(requested){
    roots=requested;requested=null;
    const next=new Map(),queue=[...new Set(roots)],visited=new Set();
    let skipped=0,limited=false,offset=0;
    parentPort.postMessage({type:'status',indexing:true,count:entries.length,skipped,limited});
    while(offset<queue.length&&next.size<MAX_ENTRIES){
      const directory=queue[offset++],directoryKey=key(directory);
      if(visited.has(directoryKey))continue;visited.add(directoryKey);
      try{
        const result=await listDirectory(directory);
        for(const entry of result.entries){
          if(entry.link||ignored.has(entry.name)||isExcluded(entry.path))continue;
          next.set(key(entry.path),entry);
          if(entry.directory)queue.push(entry.path);
          if(next.size>=MAX_ENTRIES){limited=true;break;}
        }
      }catch{skipped++;}
      if(offset%20===0)parentPort.postMessage({type:'status',indexing:true,count:next.size,skipped,limited});
    }
    entries=[...next.values()];
    if(workerData.cachePath)try{
      await fs.mkdir(path.dirname(workerData.cachePath),{recursive:true});
      await fs.writeFile(workerData.cachePath+'.tmp',JSON.stringify({version:1,roots,entries,updated:Date.now()}));
      await fs.rename(workerData.cachePath+'.tmp',workerData.cachePath);
    }catch{ /* Cache is optional; live search remains available. */ }
    parentPort.postMessage({type:'status',indexing:!!requested,count:entries.length,skipped,limited,updated:Date.now()});
  }
  indexing=false;
}
parentPort.on('message',message=>{
  if(message.type==='rebuild'){build(message.roots).catch(error=>{indexing=false;parentPort.postMessage({type:'error',message:error.message});});return;}
  const {id,query,filter}=message;
  const results=[];let total=0;
  if(query.trim())for(const entry of entries)if(matches(entry,query,filter)){total++;if(results.length<1000)results.push(entry);}
  parentPort.postMessage({type:'results',id,entries:results,total,indexing});
});
(async()=>{
  if(workerData.cachePath)try{
    const cached=JSON.parse(await fs.readFile(workerData.cachePath,'utf8'));
    if(cached.version===1&&rootKey(cached.roots)===rootKey(roots)&&Array.isArray(cached.entries))entries=cached.entries.slice(0,MAX_ENTRIES);
  }catch{ /* The first launch has no cache. */ }
  await build(roots);
})().catch(error=>parentPort.postMessage({type:'error',message:error.message}));
