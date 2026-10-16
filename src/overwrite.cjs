const fs=require('node:fs/promises');const path=require('node:path');const {constants}=require('node:fs');
async function exists(file){try{return await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function publish(payload,target,directory){
 if(directory){if(await exists(target))throw new Error('대상 경로가 작업 도중 생성되었습니다.');await fs.rename(payload,target);}
 else{try{await fs.link(payload,target);}catch(error){if(!['ENOTSUP','ENOSYS','EPERM','EINVAL'].includes(error.code))throw error;await fs.copyFile(payload,target,constants.COPYFILE_EXCL);}await fs.unlink(payload);}
}
async function replace({plan,existing,target,payload,stage,signal,progress,extraBytes,trash,committed}){
 const {copyTree,unchanged}=require('./operations.cjs');
 // Merge into private staging: source wins matching names, destination-only entries survive.
 if(plan.records[0].directory&&existing.records[0].directory){
  const sourceEntries=new Map(plan.records.map(record=>[record.relative.toLowerCase(),record]));
  for(const record of existing.records){
   signal.throwIfAborted();if(!record.relative||sourceEntries.has(record.relative.toLowerCase()))continue;
   let parent=path.dirname(record.relative),blocked=false;
   while(parent!=='.'){if(sourceEntries.get(parent.toLowerCase())?.directory===false){blocked=true;break;}parent=path.dirname(parent);}
   if(blocked)continue;
   const destination=path.join(payload,record.relative);
   if(!record.directory)extraBytes(record.size);
   await copyTree({records:[{...record,relative:''}]},destination,signal,progress);
  }
 }
 await unchanged(plan.records);await unchanged(existing.records);signal.throwIfAborted();
 const backupParent=path.join(stage,'previous'),backup=path.join(backupParent,path.basename(target));await fs.mkdir(backupParent);
 await fs.rename(target,backup);
 try{await publish(payload,target,plan.records[0].directory);}
 catch(error){
  error.recoveryStage=stage;let restored=false;
  try{if(!await exists(target)){await fs.rename(backup,target);restored=true;await fs.rmdir(backupParent);}}catch(rollback){error.message+=' 복원 실패: '+rollback.message;}
  if(restored)delete error.recoveryStage;else error.message+=' 기존 항목 보관 위치: '+backup;
  throw error;
 }
 committed();
 try{await trash(backup);await fs.rmdir(backupParent);}
 catch(error){error.message='기존 항목을 휴지통으로 이동하지 못했습니다. 새 항목은 복사되었으며 기존 항목을 보존했습니다: '+backup+' · '+error.message;error.recoveryStage=stage;throw error;}
}
module.exports={replace,publish};
