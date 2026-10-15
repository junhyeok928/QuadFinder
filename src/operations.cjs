const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { localPath, childPath } = require('./files.cjs');

const key = value => path.resolve(value).toLocaleLowerCase();
const inside = (child, parent) => key(child) === key(parent) || key(child).startsWith(key(parent) + path.sep);
async function exists(value) { try { await fs.lstat(value); return true; } catch (error) { if(error.code==='ENOENT')return false; throw error; } }
function abort(signal) { if(signal?.aborted) { const error=new Error('작업을 취소했습니다.');error.name='AbortError';throw error; } }

async function normalizeSources(values) {
  if(!Array.isArray(values)||!values.length||values.length>10000)throw new Error('파일을 1~10,000개 선택하세요.');
  const unique=[...new Map(values.map(value=>{const p=localPath(value);return [key(p),p];})).values()].sort((a,b)=>a.length-b.length);
  const roots=[];
  for(const source of unique) {
    if(path.dirname(source)===source)throw new Error('드라이브 자체는 변경할 수 없습니다.');
    const stat=await fs.lstat(source);
    if(stat.isSymbolicLink())throw new Error(`바로가기 연결·정션은 이 작업에서 지원하지 않습니다: ${source}`);
    if(!stat.isFile()&&!stat.isDirectory())throw new Error('일반 파일과 폴더만 지원합니다.');
    if(!roots.some(parent=>inside(source,parent)))roots.push(source);
  }
  return roots;
}

async function inspectTree(source, signal) {
  const records=[];
  const pending=[source];
  let bytes=0;
  while(pending.length) {
    abort(signal);
    const file=pending.pop(),stat=await fs.lstat(file);
    if(stat.isSymbolicLink())throw new Error(`연결·정션을 포함한 폴더는 복사할 수 없습니다: ${file}`);
    if(!stat.isFile()&&!stat.isDirectory())throw new Error(`지원하지 않는 파일 유형: ${file}`);
    records.push({path:file,relative:path.relative(source,file),directory:stat.isDirectory(),size:stat.size,mtime:stat.mtimeMs,ino:stat.ino,atime:stat.atime});
    if(stat.isDirectory())for(const name of await fs.readdir(file))pending.push(path.join(file,name));
    else bytes+=stat.size;
  }
  return {records,bytes};
}

async function unchanged(records) {
  for(const record of records) {
    const stat=await fs.lstat(record.path);
    if(stat.isSymbolicLink() || stat.ino!==record.ino || stat.size!==record.size || stat.mtimeMs!==record.mtime || stat.isDirectory()!==record.directory)throw new Error(`작업 중 원본이 변경되었습니다. 원본을 유지합니다: ${record.path}`);
  }
}

async function copyFile(source, destination, record, signal, progress) {
  const input=await fs.open(source,constants.O_RDONLY);
  let output;
  try {
    const stat=await input.stat();
    if(!stat.isFile()||stat.ino!==record.ino||stat.size!==record.size||stat.mtimeMs!==record.mtime)throw new Error('복사하기 전에 원본 파일이 변경되었습니다.');
    output=await fs.open(destination,'wx');
    const buffer=Buffer.allocUnsafe(1024*1024);
    let position=0;
    while(position<record.size) {
      abort(signal);
      const {bytesRead}=await input.read(buffer,0,Math.min(buffer.length,record.size-position),position);
      if(!bytesRead)throw new Error('원본 파일 크기가 복사 도중 변경되었습니다.');
      let written=0;
      while(written<bytesRead){const result=await output.write(buffer,written,bytesRead-written,position+written);if(!result.bytesWritten)throw new Error('파일 쓰기에 실패했습니다.');written+=result.bytesWritten;}
      position+=bytesRead;progress(bytesRead,source);
    }
    const after=await input.stat();
    if(after.ino!==record.ino||after.size!==record.size||after.mtimeMs!==record.mtime)throw new Error('원본 파일이 복사 도중 변경되었습니다.');
    await output.sync();
    await output.utimes(record.atime,new Date(record.mtime));
  } finally { await output?.close();await input.close(); }
}

async function copyTree(plan, destination, signal, progress) {
  for(const record of plan.records) {
    abort(signal);
    const target=record.relative?path.join(destination,record.relative):destination;
    if(record.directory)await fs.mkdir(target);
    else await copyFile(record.path,target,record,signal,progress);
  }
  for(const record of [...plan.records].reverse())if(record.directory)await fs.utimes(record.relative?path.join(destination,record.relative):destination,record.atime,new Date(record.mtime));
}

async function alternativePath(destination) {
  const stat=await fs.lstat(destination);
  const extension=stat.isDirectory()?'':path.extname(destination),stem=path.basename(destination,extension),parent=path.dirname(destination);
  for(let i=2;i<100000;i++){const candidate=childPath(parent,`${stem} (${i})${extension}`);if(!await exists(candidate))return candidate;}
  throw new Error('사용 가능한 새 파일 이름을 찾을 수 없습니다.');
}

async function renameItem(sourceValue,name) {
  const [source]=await normalizeSources([sourceValue]);
  const destination=childPath(path.dirname(source),name);
  if(source===destination)return source;
  const stat=await fs.lstat(source);
  if(await exists(destination)){
    const target=await fs.lstat(destination);
    if(key(source)!==key(destination)||stat.ino!==target.ino||stat.dev!==target.dev)throw new Error('같은 이름의 파일이나 폴더가 이미 있습니다.');
    await fs.rename(source,destination);return destination;
  }
  if(stat.isDirectory())await fs.rename(source,destination); // Windows refuses an existing directory destination.
  else {
    try{await fs.link(source,destination);}
    catch(error){
      if(!['ENOTSUP','ENOSYS','EPERM','EINVAL'].includes(error.code))throw error;
      await fs.copyFile(source,destination,constants.COPYFILE_EXCL);
      const after=await fs.lstat(source);
      if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw new Error('이름 변경 중 원본이 바뀌었습니다. 원본을 유지합니다.');
      await fs.utimes(destination,stat.atime,stat.mtime);
    }
    await fs.unlink(source);
  }
  return destination;
}

class OperationQueue extends EventEmitter {
  constructor({trash,conflict=async()=> 'keep-both',changed=()=>{}}) {
    super();this.trash=trash;this.conflict=conflict;this.changed=changed;this.jobs=[];this.running=false;
  }
  snapshot(){return this.jobs.map(({controller,...job})=>({...job,errors:[...job.errors]}));}
  publish(job,force=false){const now=Date.now();if(force||!job.lastUpdate||now-job.lastUpdate>80){job.lastUpdate=now;this.emit('update',this.snapshot());}}
  enqueue({kind,sources,destination}) {
    if(!['copy','move','trash'].includes(kind))throw new Error('지원하지 않는 파일 작업입니다.');
    if(!Array.isArray(sources)||sources.length<1||sources.length>10000)throw new Error('파일을 선택하세요.');
    const job={id:randomUUID(),kind,sources:sources.map(localPath),destination:kind==='trash'?null:localPath(destination),status:'queued',done:0,total:sources.length,bytes:0,totalBytes:0,current:'',errors:[],skipped:0,controller:new AbortController()};
    this.jobs.push(job);this.publish(job,true);setImmediate(()=>this.drain());return job.id;
  }
  cancel(id){const job=this.jobs.find(item=>item.id===id);if(job&&!job.controller.signal.aborted&&['queued','scanning','running'].includes(job.status)){job.controller.abort();this.publish(job,true);} }
  active(){return this.jobs.some(job=>['queued','scanning','running'].includes(job.status));}
  clear(){this.jobs=this.jobs.filter(job=>['queued','scanning','running'].includes(job.status));this.emit('update',this.snapshot());}
  async drain(){
    if(this.running)return;this.running=true;
    try { for(const job of this.jobs)if(job.status==='queued')await this.run(job); }
    finally {this.running=false;}
  }
  async run(job){
    const signal=job.controller.signal;
    let stage=null;
    try {
      abort(signal);job.status='scanning';this.publish(job,true);
      const sources=await normalizeSources(job.sources);job.total=sources.length;
      let destination;
      if(job.kind!=='trash') {
        destination=await fs.realpath(job.destination);
        if(!(await fs.stat(destination)).isDirectory())throw new Error('대상은 폴더여야 합니다.');
        for(const source of sources)if(inside(destination,await fs.realpath(source)))throw new Error('폴더를 자기 자신이나 하위 폴더에 복사·이동할 수 없습니다.');
      }
      const plans=[];
      for(const source of sources){abort(signal);job.current=source;this.publish(job);const plan=job.kind==='trash'?null:await inspectTree(source,signal);plans.push({source,plan});job.totalBytes+=plan?.bytes||0;}
      job.status='running';this.publish(job,true);
      let collisionRule=null;
      for(const {source,plan} of plans) {
        abort(signal);job.current=source;this.publish(job,true);
        try {
          if(job.kind==='trash') {await this.trash(source);job.done++;this.changed([path.dirname(source)]);continue;}
          if(job.kind==='move'&&key(path.dirname(source))===key(destination)){job.skipped++;continue;}
          let target=childPath(destination,path.basename(source));
          if(await exists(target)) {
            const response=collisionRule||await this.conflict({source,destination:target,kind:job.kind});
            const rule=typeof response==='string'?response:response.action;
            if(response.applyAll)collisionRule=response;
            if(rule==='cancel'){job.controller.abort();abort(signal);}
            if(rule==='skip'){job.skipped++;continue;}
            if(rule!=='keep-both')throw new Error('올바르지 않은 충돌 처리입니다.');
            target=await alternativePath(target);
          }
          abort(signal);
          // Staging belongs exclusively to this job; incomplete data is never published as a finished file.
          stage=await fs.mkdtemp(path.join(destination,'.quadfinder-'));
          const payload=path.join(stage,'payload');
          await copyTree(plan,payload,signal,(bytes,file)=>{const first=job.bytes===0;job.bytes+=bytes;job.current=file;this.publish(job,first);});
          abort(signal);await unchanged(plan.records);
          // Files use an exclusive hard-link publication. Directory rename is non-overwriting on Windows.
          if(plan.records[0].directory){if(await exists(target))throw new Error('대상 경로가 작업 도중 생성되었습니다.');await fs.rename(payload,target);}
          else {
            try {await fs.link(payload,target);} catch(error) {
              if(!['ENOTSUP','ENOSYS','EPERM','EINVAL'].includes(error.code))throw error;
              await fs.copyFile(payload,target,constants.COPYFILE_EXCL);
            }
            await fs.unlink(payload);
          }
          await fs.rmdir(stage);stage=null;
          this.changed([destination]);
          if(job.kind==='move') {await unchanged(plan.records);await this.trash(source);}
          job.done++;this.changed([destination,path.dirname(source)]);
        } catch(error) {
          if(stage){await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});stage=null;}
          if(error.name==='AbortError')throw error;
          job.errors.push({path:source,message:error.message});
        }
      }
      job.status=job.errors.length?'partial':'completed';
    } catch(error) {
      job.status=error.name==='AbortError'?'cancelled':'failed';
      if(error.name!=='AbortError')job.errors.push({path:job.current,message:error.message});
    } finally {
      if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});
      job.current='';this.publish(job,true);
      if(this.jobs.length>60)this.jobs=this.jobs.filter(item=>['queued','scanning','running'].includes(item.status)||this.jobs.indexOf(item)>=this.jobs.length-40);
    }
  }
}

module.exports={OperationQueue,renameItem,normalizeSources,inspectTree,inside};
