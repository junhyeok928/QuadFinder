const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const path=require('node:path');
const {matches}=require('./files.cjs');
const {IndexEngine,targets}=require('./index-engine.cjs');
const {key}=require('./index-paths.cjs');
const send=value=>parentPort.postMessage(value);
let indexing=false,initialized=false,requested=workerData.roots,controller;
const updates=new Map();let savedRevision=-1,savedRoots='',cacheError;
const rootKey=roots=>targets(roots).map(key).sort().join('\n');
const engine=new IndexEngine({roots:workerData.roots,excluded:workerData.excludePaths||[],onProgress:status=>send({type:'status',indexing:true,...status,cacheError})});
async function pump(){
  if(indexing||!initialized)return;indexing=true;
  try{
    while(requested||updates.size){
      const full=!!requested;
      if(full){engine.setRoots(requested);requested=null;}
      const values=full?engine.roots:[...updates.values()];updates.clear();controller=new AbortController();
      let status;
      try{status=await engine.scan(values,{full,signal:controller.signal});}catch(error){if(error.code==='ABORT_ERR')continue;throw error;}
      if(requested)continue;
      if(workerData.cachePath&&(savedRevision!==engine.revision||savedRoots!==rootKey(engine.roots)))try{
        const revision=engine.revision,roots=[...engine.roots],entries=[...engine.entries.values()];
        await fs.mkdir(path.dirname(workerData.cachePath),{recursive:true});
        await fs.writeFile(workerData.cachePath+'.tmp',JSON.stringify({version:1,roots,entries,updated:Date.now()}));
        await fs.rename(workerData.cachePath+'.tmp',workerData.cachePath);savedRevision=revision;savedRoots=rootKey(roots);cacheError=undefined;
      }catch(error){cacheError=error.message;}
      send({type:'status',...status,indexing:!!requested||updates.size>0,updated:Date.now(),cacheError});
    }
  }catch(error){send({type:'error',message:error.message});}finally{indexing=false;}
}
parentPort.on('message',message=>{
  if(message.type==='update'){for(const value of message.paths||[])if(engine.allowed(value))updates.set(key(value),value);pump();return;}
  if(message.type==='rebuild'){requested=message.roots;engine.setRoots(requested);controller?.abort();pump();return;}
  const results=[];let total=0;
  if(message.query?.trim())for(const entry of engine.entries.values())if(matches(entry,message.query,message.filter)){total++;if(results.length<1000)results.push(entry);}
  send({type:'results',id:message.id,entries:results,total,indexing});
});
(async()=>{
  if(workerData.cachePath)try{
    const cached=JSON.parse(await fs.readFile(workerData.cachePath,'utf8'));
    if(cached.version===1&&Array.isArray(cached.roots)&&Array.isArray(cached.entries)){
      engine.restore(cached.entries);if(rootKey(cached.roots)===rootKey(engine.roots)&&engine.entries.size===cached.entries.length){savedRevision=engine.revision;savedRoots=rootKey(engine.roots);}
    }
  }catch{}
  initialized=true;await pump();
})().catch(error=>send({type:'error',message:error.message}));
