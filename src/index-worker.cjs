const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const path=require('node:path');
const {listDirectory,matches}=require('./files.cjs');
const {within,indexable}=require('./index-paths.cjs');
const updates=new Set();
let entries=[];
let entriesByPath=new Map();
let indexing=false;
let requested=null;
let roots=workerData.roots;
const MAX_ENTRIES=250000;
const key=value=>path.resolve(value).toLowerCase();
const rootKey=values=>[...new Set(values.map(key))].sort().join('\n');

async function build(nextRoots,paths){
  if(paths){for(const value of paths)if(indexable(value,roots,workerData.excludePaths))updates.add(value);}
  else requested=nextRoots;
  if(indexing)return;
  indexing=true;
  while(requested||updates.size){
    const full=!!requested;
    if(full)roots=requested;requested=null;
    const targets=full?roots:[...updates].filter(value=>![...updates].some(other=>other!==value&&within(value,other)));
    updates.clear();
    const next=new Map(full?[]:entries.filter(entry=>!targets.some(target=>within(entry.path,target))).map(entry=>[key(entry.path),entry]));
    const queue=[],visited=new Set();
    for(const target of targets){
      if(!indexable(target,roots,workerData.excludePaths))continue;
      if(full||roots.some(root=>key(root)===key(target))){queue.push(target);continue;}
      try{const result=await listDirectory(path.dirname(target));const entry=result.entries.find(entry=>key(entry.path)===key(target));if(entry&&!entry.link){if(!roots.some(root=>key(root)===key(target)))next.set(key(entry.path),entry);if(entry.directory)queue.push(target);}}catch{}
    }
    let skipped=0,limited=false,offset=0;
    parentPort.postMessage({type:'status',indexing:true,count:entries.length,skipped,limited});
    while(offset<queue.length&&next.size<MAX_ENTRIES){
      const directory=queue[offset++],directoryKey=key(directory);
      if(visited.has(directoryKey))continue;visited.add(directoryKey);
      try{
        const result=await listDirectory(directory);
        for(const entry of result.entries){
          if(entry.link||!indexable(entry.path,roots,workerData.excludePaths))continue;
          next.set(key(entry.path),entry);
          if(entry.directory)queue.push(entry.path);
          if(next.size>=MAX_ENTRIES){limited=true;break;}
        }
      }catch{skipped++;}
      if(offset%20===0)parentPort.postMessage({type:'status',indexing:true,count:next.size,skipped,limited});
    }
    const nextEntries=[...next.values()];
    const changed=entries.length!==nextEntries.length||nextEntries.some(entry=>{const old=entriesByPath.get(key(entry.path));return !old||old.modified!==entry.modified||old.size!==entry.size||old.directory!==entry.directory||old.path!==entry.path;});
    entries=nextEntries;entriesByPath=new Map(entries.map(entry=>[key(entry.path),entry]));
    if(workerData.cachePath&&(changed||full))try{
      await fs.mkdir(path.dirname(workerData.cachePath),{recursive:true});
      await fs.writeFile(workerData.cachePath+'.tmp',JSON.stringify({version:1,roots,entries,updated:Date.now()}));
      await fs.rename(workerData.cachePath+'.tmp',workerData.cachePath);
    }catch{ /* Cache is optional; live search remains available. */ }
    parentPort.postMessage({type:'status',indexing:!!requested,count:entries.length,skipped,limited,updated:Date.now()});
  }
  indexing=false;
}
parentPort.on('message',message=>{
  if(message.type==='update'){build(null,message.paths||[]).catch(error=>{indexing=false;parentPort.postMessage({type:'error',message:error.message});});return;}
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
  entriesByPath=new Map(entries.map(entry=>[key(entry.path),entry]));
  await build(roots);
})().catch(error=>parentPort.postMessage({type:'error',message:error.message}));
