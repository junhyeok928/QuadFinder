const fs=require('node:fs/promises');
const path=require('node:path');
const {listDirectory}=require('./files.cjs');
const {key,indexable}=require('./index-paths.cjs');

// Windows filesystem calls may outlive cancellation; stop waiting and stop new batches.
function bounded(operation,signal,timeout){
  return new Promise((resolve,reject)=>{
    const controller=new AbortController();let timer,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();error?reject(error):resolve(value);};
    const cancel=()=>finish(Object.assign(new Error('Index scan cancelled'),{code:'ABORT_ERR'}));
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>finish(Object.assign(new Error('폴더 응답 시간 초과'),{code:'ETIMEDOUT'})),timeout);
    Promise.resolve().then(()=>operation(controller.signal)).then(value=>finish(null,value),error=>finish(error));
  });
}
function targets(values){
  const order=value=>value.replace(/[\\/]$/,'')+path.sep;
  const sorted=[...new Map(values.map(value=>[key(value),value]))].sort(([a],[b])=>order(a)<order(b)?-1:order(a)>order(b)?1:0),result=[];let ancestor;
  for(const [id,value]of sorted){if(ancestor&&(id===ancestor||id.startsWith(ancestor.replace(/[\\/]$/,'')+path.sep)))continue;result.push(value);ancestor=id;}return result;
}
class IndexEngine{
  constructor({roots=[],excluded=[],store,maxEntries=store?Infinity:250000,timeout=15000,read=listDirectory,stat=fs.lstat,onProgress=()=>{}}={}){
    Object.assign(this,{roots,excluded,store,maxEntries,timeout,read,stat,onProgress});this.entries=store?.entries||new Map();this.children=store?.children||new Map();this.revision=0;this.limited=false;this.failures=new Map();
  }
  allowed(value){return typeof value==='string'&&indexable(value,this.roots,this.excluded);}
  setRoots(roots){this.roots=targets(roots);for(const entry of this.entries.values())if(!this.allowed(entry.path))this.remove(entry.path);for(const [id,error]of this.failures)if(!this.allowed(error.path))this.failures.delete(id);this.store?.flush();}
  restore(entries){for(const entry of entries){if(!entry||typeof entry.name!=='string'||typeof entry.path!=='string'||!path.isAbsolute(entry.path)||typeof entry.directory!=='boolean'||!Number.isFinite(entry.size)||!Number.isFinite(entry.modified)||!this.allowed(entry.path))continue;this.put({...entry,parent:path.dirname(entry.path)});}}
  put(entry){const id=key(entry.path),old=this.entries.get(id);if(!old&&this.entries.size>=this.maxEntries){this.limited=true;return false;}if(!old||['name','path','size','modified','directory','link','created','hidden','system','metadataUnknown'].some(field=>old[field]!==entry[field])){this.entries.set(id,entry);if(!this.store){const parent=key(path.dirname(entry.path));if(!this.children.has(parent))this.children.set(parent,new Set());this.children.get(parent).add(id);}this.revision++;}return true;}
  remove(value){const removed=key(value);for(const id of this.failures.keys())if(id===removed||id.startsWith(removed.replace(/[\\/]$/,'')+path.sep))this.failures.delete(id);const queue=[removed];for(let i=0;i<queue.length;i++){const id=queue[i];for(const child of this.children.get(id)||[])queue.push(child);this.children.delete(id);const entry=this.entries.get(id);if(entry){if(!this.store)this.children.get(key(path.dirname(entry.path)))?.delete(id);this.entries.delete(id);this.revision++;}}}
  diagnostics(){const errors=[...this.failures.values()],counts={denied:0,timedOut:0,missing:0,other:0};for(const error of errors)counts[['EACCES','EPERM'].includes(error.code)?'denied':error.code==='ETIMEDOUT'?'timedOut':['ENOENT','ENOTDIR'].includes(error.code)?'missing':'other']++;return {issues:counts,problemCount:errors.length,problems:errors.slice(0,200)};}
  async scan(values,{full=false,signal}={}){
    let scanned=0,skipped=0,current='',lastProgress=0;const warnings=[];
    const report=force=>{if(force||Date.now()-lastProgress>250){lastProgress=Date.now();this.onProgress({count:this.entries.size,scanned,skipped,current,limited:this.limited,revision:this.revision,warnings:[...warnings],...this.diagnostics()});}};
    if(full)this.limited=false;
    // Shallow parent refreshes cannot replace an explicit deep-file notification.
    const selected=full?targets(values):[...new Map(values.map(value=>[key(value),value])).values()];
    const queue=selected.filter(value=>this.allowed(value)).map(value=>({value,recursive:full,target:true}));const visited=new Set();
    report(true);
    for(let offset=0;offset<queue.length;offset++){
      if(signal?.aborted)throw Object.assign(new Error('Index scan cancelled'),{code:'ABORT_ERR'});
      const {value,recursive,target}=queue[offset];const id=key(value);if(visited.has(id))continue;visited.add(id);current=value;report(offset===0);
      try{
        if(target&&!this.roots.some(root=>key(root)===id)){
          let cursor=value,linked=false,record;
          while(this.allowed(cursor)&&!this.roots.some(root=>key(root)===key(cursor))){const info=await bounded(ioSignal=>this.stat(cursor,{signal:ioSignal}),signal,this.timeout);if(info.isSymbolicLink()){this.remove(value);linked=true;break;}if(cursor===value){const name=path.basename(value);record={name,path:value,parent:path.dirname(value),directory:info.isDirectory(),link:false,size:info.size,modified:info.mtimeMs,created:info.birthtimeMs,accessed:info.atimeMs,hidden:name.startsWith('.'),extension:path.extname(name).toLowerCase()};}cursor=path.dirname(cursor);}
          if(linked)continue;
          if(record){const old=this.entries.get(id);if(old&&old.directory!==record.directory)this.remove(value);this.put(record);if(!record.directory){this.failures.delete(id);continue;}}
        }
        const result=await bounded(ioSignal=>this.read(value,{signal:ioSignal,include:entry=>this.allowed(entry),tolerateMetadataErrors:true}),signal,this.timeout);
        const children=result.entries.filter(entry=>!entry.link&&this.allowed(entry.path));const found=new Set(children.map(entry=>key(entry.path)));
        // Failed reads preserve cached subtrees; only successful listings prove deletion.
        for(const child of [...(this.children.get(id)||[])])if(!found.has(child))this.remove(child);
        for(const entry of children){const old=this.entries.get(key(entry.path));if(old&&old.directory!==entry.directory)this.remove(entry.path);const added=this.put(entry);if(entry.directory&&added&&(recursive||!old||!old.directory))queue.push({value:entry.path,recursive:true,target:false});}
        this.failures.delete(id);for(const entry of children)if(!entry.directory&&!entry.metadataUnknown)this.failures.delete(key(entry.path));for(const error of result.errors||[])this.failures.set(key(error.path),error);
        this.store?.flush();
        scanned++;report(false);
      }catch(error){
        if(error.code==='ABORT_ERR')throw error;
        let deleted=false;
        if(target&&!full&&['ENOENT','ENOTDIR'].includes(error.code))try{const parent=await bounded(ioSignal=>this.read(path.dirname(value),{signal:ioSignal,include:entry=>key(entry)===id}),signal,this.timeout);if(!parent.entries.some(entry=>key(entry.path)===id)){this.remove(value);deleted=true;}}catch(confirmError){if(confirmError.code==='ABORT_ERR')throw confirmError;}
        if(!deleted){skipped++;const issue={path:value,code:error.code||'EIO'};this.failures.set(id,issue);if(warnings.length<8)warnings.push(issue);}else{this.failures.delete(id);}
      }
    }
    this.store?.flush();current='';report(true);return {scanned,skipped,limited:this.limited,warnings,count:this.entries.size,revision:this.revision,...this.diagnostics()};
  }
}
module.exports={IndexEngine,bounded,targets};
