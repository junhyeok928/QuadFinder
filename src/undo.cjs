const fs=require('node:fs/promises'),{createReadStream,constants}=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{EventEmitter}=require('node:events');
const {inspectTree,renameItem,copyTree,unchanged}=require('./operations.cjs');
async function exists(file){try{await fs.lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function fingerprint(file,signal){
  const plan=await inspectTree(file,signal),hash=createHash('sha256');
  for(const entry of [...plan.records].sort((a,b)=>a.relative.localeCompare(b.relative))){signal?.throwIfAborted();hash.update(JSON.stringify([entry.relative,entry.directory,entry.directory?0:entry.size,entry.directory?0:Math.trunc(entry.mtime)]));if(!entry.directory)for await(const chunk of createReadStream(entry.path)){signal?.throwIfAborted();hash.update(chunk);}}
  await unchanged(plan.records);signal?.throwIfAborted();return hash.digest('hex');
}
async function moveExact(source,destination,trash,signal){
  if(await exists(destination))throw new Error('원래 위치에 항목이 있어 되돌릴 수 없습니다.');
  const parent=path.dirname(destination),plan=await inspectTree(source,signal);let stage=await fs.mkdtemp(path.join(parent,'.quadfinder-undo-'));
  try{
    const payload=path.join(stage,'payload');await copyTree(plan,payload,signal,()=>{});await unchanged(plan.records);signal?.throwIfAborted();
    if(plan.records[0].directory){if(await exists(destination))throw new Error('원래 위치에 항목이 생성되었습니다.');await fs.rename(payload,destination);}
    else{try{await fs.link(payload,destination);}catch(error){if(!['ENOTSUP','ENOSYS','EPERM','EINVAL'].includes(error.code))throw error;await fs.copyFile(payload,destination,constants.COPYFILE_EXCL);}await fs.unlink(payload);}
    await fs.rmdir(stage);stage=null;await unchanged(plan.records);await trash(source);
  }finally{if(stage)await fs.rm(stage,{recursive:true,force:true});}
}
class UndoManager extends EventEmitter{
  constructor({trash,working=()=>false,changed=()=>{}}){super();this.trash=trash;this.working=working;this.changed=changed;this.entries=[];this.busy=false;}
  snapshot(){const item=this.entries.at(-1);return {available:!!item&&!this.busy&&!this.working(),busy:this.busy,count:this.entries.length,label:item?.label||''};}
  publish(){this.emit('update',this.snapshot());}
  clear(){this.entries=[];this.publish();}
  cancel(){this.controller?.abort();}
  async record(actions,label){
    if(!actions.length)return;this.busy=true;this.controller=new AbortController();this.publish();
    try{const records=[];for(const action of actions)records.push({...action,fingerprint:await fingerprint(action.target,this.controller.signal)});this.entries.push({label,actions:records});if(this.entries.length>20)this.entries.shift();}
    catch(error){this.entries=[];throw error;}
    finally{this.controller=null;this.busy=false;this.publish();}
  }
  async undo(){
    if(this.busy||this.working())throw new Error('진행 중인 작업이 끝난 뒤 실행 취소하세요.');const item=this.entries.at(-1);if(!item)throw new Error('실행 취소할 작업이 없습니다.');
    this.busy=true;this.controller=new AbortController();this.publish();const signal=this.controller.signal;
    try{
      // Check every destination before the first mutation. A changed copy is never discarded.
      for(const action of item.actions){if(await fingerprint(action.target,signal)!==action.fingerprint)throw new Error('작업 이후 파일 내용이 변경되어 실행 취소할 수 없습니다: '+action.target);if(action.kind!=='copy'&&path.resolve(action.source).toLowerCase()!==path.resolve(action.target).toLowerCase()&&await exists(action.source))throw new Error('원래 위치에 다른 항목이 있어 실행 취소할 수 없습니다: '+action.source);}
      while(item.actions.length){signal.throwIfAborted();const action=item.actions.at(-1);if(action.kind==='copy')await this.trash(action.target);else if(action.kind==='rename')await renameItem(action.target,path.basename(action.source));else await moveExact(action.target,action.source,this.trash,signal);item.actions.pop();this.changed([action.target,action.source,path.dirname(action.target),path.dirname(action.source)]);}
      this.entries.pop();return this.snapshot();
    }finally{this.controller=null;this.busy=false;this.publish();}
  }
}
module.exports={UndoManager,fingerprint};
