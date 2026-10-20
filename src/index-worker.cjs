const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const {matches,listDirectory}=require('./files.cjs');
const {IndexEngine}=require('./index-engine.cjs');
const {IndexStore}=require('./index-store.cjs');
const {key}=require('./index-paths.cjs');
const {NativeIndex}=require('./native-index.cjs');
const send=value=>parentPort.postMessage(value);
const store=new IndexStore(workerData.dbPath||(workerData.cachePath?workerData.cachePath+'.sqlite':':memory:'));
let native,indexing=false,initialized=false,requested=workerData.roots,controller,searchGeneration=0,elevated=!!workerData.elevated,elevationError;
let switching=false;
const updates=new Map();
async function read(value,options){
  if(process.platform!=='win32'||workerData.native===false)return listDirectory(value,options);
  if(!native||native.closed||native.failure)native=new NativeIndex({elevated});
  try{return await native.list(value,options);}catch(error){if(elevated&&native.closed){elevated=false;elevationError='인덱싱 도우미 연결이 중단되어 일반 권한으로 계속합니다.';}throw error;}
}
const stat=async(value,options)=>{if(process.platform!=='win32'||workerData.native===false)return fs.lstat(value);if(!native||native.closed||native.failure)native=new NativeIndex({elevated});try{return await native.stat(value,options);}catch(error){if(elevated&&native.closed){elevated=false;elevationError='인덱싱 도우미 연결이 중단되어 일반 권한으로 계속합니다.';}throw error;}};
const engine=new IndexEngine({roots:workerData.roots,excluded:workerData.excludePaths||[],store,read,stat,onProgress:status=>send({type:'status',indexing:true,elevated,elevationError,...status})});
engine.failures=new Map((store.getMeta('problems')||[]).map(error=>[key(error.path),error]));
async function pump(){
  if(indexing||!initialized||switching)return;indexing=true;
  try{
    while(!switching&&(requested||updates.size)){
      const full=!!requested;
      if(full){engine.setRoots(requested);requested=null;}
      const values=full?engine.roots:[...updates.values()];updates.clear();controller=new AbortController();
      let status;
      try{status=await engine.scan(values,{full,signal:controller.signal});}catch(error){store.flush();if(error.code==='ABORT_ERR')continue;throw error;}
      if(requested)continue;
      store.setMeta('roots',engine.roots);store.setMeta('problems',[...engine.failures.values()]);store.flush();
      send({type:'status',...status,indexing:!!requested||updates.size>0,elevated,elevationError,updated:Date.now()});
    }
  }catch(error){send({type:'error',message:error.message});}finally{store.flush();indexing=false;if(initialized&&!switching&&(requested||updates.size))setImmediate(pump);}
}
async function search(message){
  const generation=++searchGeneration,results=[];let total=0,processed=0;
  const limit=Number.isSafeInteger(message.limit)&&message.limit>0?message.limit:1000;
  if(message.query?.trim())for(const entry of store.candidates(message.query)){
    if(matches(entry,message.query,message.filter)){total++;if(results.length<limit)results.push(entry);}
    if(++processed%2048===0){await new Promise(resolve=>setImmediate(resolve));if(generation!==searchGeneration){send({type:'results',id:message.id,entries:[],total:0,indexing,cancelled:true});return;}}
  }
  send({type:'results',id:message.id,entries:results,total,indexing});
}
parentPort.on('message',message=>{
  if(message.type==='elevate'){
    if(switching||elevated){send({type:'elevation-result',ok:false,error:'관리자 인덱싱이 이미 진행 중입니다.'});return;}
    switching=true;controller?.abort();native?.close();requested=engine.roots;
    send({type:'status',indexing:true,count:engine.entries.size,awaitingElevation:true});
    native=new NativeIndex({elevated:true});
    (async()=>{try{const info=await native.request({mode:'hello'});if(!info.elevated)throw new Error('관리자 권한을 확인할 수 없습니다.');elevated=true;elevationError=null;send({type:'elevation-result',ok:true});}
      catch(error){native?.close();native=null;elevated=false;elevationError=error.message;send({type:'elevation-result',ok:false,error:error.message});}
      finally{switching=false;send({type:'status',indexing:true,count:engine.entries.size,elevated,elevationError,awaitingElevation:false});pump();}})();return;
  }
  if(message.type==='stop'){requested=null;updates.clear();controller?.abort();native?.close();store.flush();send({type:'stopped'});return;}
  if(message.type==='update'){for(const value of message.paths||[])if(engine.allowed(value))updates.set(key(value),value);pump();return;}
  if(message.type==='rebuild'){requested=message.roots;engine.setRoots(requested);controller?.abort();pump();return;}
  search(message).catch(error=>send({type:'error',message:error.message}));
});
(async()=>{
  // Import the old cache once; never rewrite a full JSON snapshot after changes.
  if(workerData.cachePath&&!store.getMeta('legacyImported')){
    if(!store.entries.size)try{const cached=JSON.parse(await fs.readFile(workerData.cachePath,'utf8'));if(cached.version===1&&Array.isArray(cached.entries))engine.restore(cached.entries);}catch{}
    store.setMeta('legacyImported',true);store.flush();
  }
  if(elevated)try{send({type:'status',indexing:true,count:engine.entries.size,awaitingElevation:true});native=new NativeIndex({elevated:true});const info=await native.request({mode:'hello'});if(!info.elevated)throw new Error('관리자 권한을 확인할 수 없습니다.');}catch(error){native?.close();native=null;elevated=false;elevationError=error.message;}
  initialized=true;await pump();
})().catch(error=>{native?.close();send({type:'error',message:error.message});});
process.on('exit',()=>{native?.close();store.close();});
