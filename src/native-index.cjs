const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const net=require('node:net');
const readline=require('node:readline');
const {randomUUID}=require('node:crypto');
function executable(){return process.resourcesPath&&fs.existsSync(path.join(process.resourcesPath,'QuadFinder.Index.exe'))?path.join(process.resourcesPath,'QuadFinder.Index.exe'):path.resolve(__dirname,'../output/native/QuadFinder.Index.exe');}
const codes={2:'ENOENT',3:'ENOENT',5:'EACCES',32:'EBUSY',53:'ENETUNREACH',267:'ENOTDIR'};
class NativeIndex{
  constructor({elevated=false,file=executable()}={}){this.file=file;this.elevated=elevated;this.closed=false;this.ready=this.connect();}
  attach(stream,input=stream){
    this.input=input;this.lines=readline.createInterface({input:stream});
    this.lines.on('line',line=>{try{const response=JSON.parse(line);const pending=this.pending;if(!pending)return;if(!response.ok){this.finish(Object.assign(new Error(response.error),{code:codes[response.code]||'EIO'}));return;}if(response.value?.entries){pending.entries.push(...response.value.entries);if(response.page)return;response.value.entries=pending.entries;}this.finish(null,response.value);}catch(error){this.finish(error);}});
    stream.on('error',error=>this.fail(error));this.lines.on('close',()=>this.fail(Object.assign(new Error('인덱싱 도우미가 종료되었습니다.'),{code:'EPIPE'})));
  }
  async connect(){
    if(!this.elevated){this.child=spawn(this.file,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child.stderr.resume();this.child.on('error',error=>this.fail(error));this.child.stdin.on('error',error=>this.fail(error));this.attach(this.child.stdout,this.child.stdin);return;}
    const pipe='QuadFinder-index-'+randomUUID();
    await new Promise((resolve,reject)=>{
      const server=net.createServer(socket=>{clearTimeout(timer);this.attach(socket);server.close();resolve();});this.server=server;
      const timer=setTimeout(()=>{server.close();reject(new Error('관리자 인덱싱 연결 시간이 초과되었습니다.'));},65000);
      server.once('error',error=>{clearTimeout(timer);reject(error);});
      server.listen('\\\\.\\pipe\\'+pipe,()=>{
        const quote=value=>"'"+value.replace(/'/g,"''")+"'";
        const script=`try { $p=Start-Process -FilePath ${quote(this.file)} -ArgumentList '--pipe',${quote(pipe)} -Verb RunAs -WindowStyle Hidden -PassThru; $p.WaitForExit() } catch { exit 1 }`;
        this.child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});
        this.child.once('error',error=>{clearTimeout(timer);server.close();reject(error);});
        this.child.once('exit',code=>{if(!this.input){clearTimeout(timer);server.close();reject(new Error(code?'관리자 권한 요청이 취소되었거나 실행에 실패했습니다.':'인덱싱 도우미가 연결되지 않았습니다.'));}});
      });
    });
  }
  finish(error,value){const pending=this.pending;if(!pending)return;this.pending=null;clearTimeout(pending.timer);pending.signal?.removeEventListener('abort',pending.cancel);error?pending.reject(error):pending.resolve(value);}
  fail(error){this.failure=error;this.finish(error);}
  async request(input,{signal,timeout=15000}={}){
    await this.ready;if(this.closed||this.failure)throw this.failure||new Error('Index helper closed');signal?.throwIfAborted();
    if(this.pending)throw new Error('Concurrent index request');
    return new Promise((resolve,reject)=>{const pending={resolve,reject,entries:[],signal};pending.cancel=()=>{const error=Object.assign(new Error('Index read cancelled'),{code:'ABORT_ERR'});this.finish(error);this.close();};pending.timer=setTimeout(()=>{this.finish(Object.assign(new Error('폴더 응답 시간 초과'),{code:'ETIMEDOUT'}));this.close();},timeout);this.pending=pending;signal?.addEventListener('abort',pending.cancel,{once:true});this.input.write(JSON.stringify(input)+'\n',error=>{if(error)this.fail(error);});});
  }
  async list(directory,options={}){const result=await this.request({mode:'list',path:directory},options);return {...result,entries:result.entries.filter(entry=>!options.include||options.include(entry.path))};}
  async stat(value,options={}){const info=await this.request({mode:'stat',path:value},options);return {isDirectory:()=>info.directory,isSymbolicLink:()=>info.link,size:info.size,mtimeMs:info.modified,birthtimeMs:info.created,atimeMs:info.accessed};}
  close(){this.closed=true;this.input?.end();this.input?.destroy?.();this.child?.kill();this.server?.close();this.lines?.close();}
}
module.exports={NativeIndex,executable};
