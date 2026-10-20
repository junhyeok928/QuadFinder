const {spawn}=require('node:child_process');
const readline=require('node:readline');
class ShellMenuHost{
  constructor({executable,launch=spawn,startupTimeout=15000}={}){Object.assign(this,{executable,launch,startupTimeout});this.queue=Promise.resolve();}
  request(input){const next=this.queue.catch(()=>{}).then(()=>this.execute(input));this.queue=next;return next;}
  start(){
    if(this.session)return this.session;
    const child=this.launch(this.executable(),['--menu-server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const session={child,ready:false,pending:null,stderr:''};this.session=session;
    const lines=readline.createInterface({input:child.stdout});session.lines=lines;
    const fail=error=>{
      if(session.closed)return;session.closed=true;clearTimeout(session.timer);clearTimeout(session.startup);
      if(this.session===session)this.session=null;
      session.pending?.reject(error);session.pending=null;lines.close();child.stdin.destroy();child.kill();this.reference(session,false);
    };
    session.fail=fail;
    session.startup=setTimeout(()=>fail(new Error('Windows 메뉴 도우미 시작 시간이 초과되었습니다. 다시 시도하세요.')),this.startupTimeout);session.startup.unref?.();
    lines.on('line',line=>{
      try{
        const result=JSON.parse(line.replace(/^\uFEFF/,''));
        if(result.ready){session.ready=true;clearTimeout(session.startup);return;}
        const pending=session.pending;if(!pending)throw Error('Unexpected Windows menu response');
        clearTimeout(session.timer);session.pending=null;this.reference(session,false);
        result.ok?pending.resolve(result.value):pending.reject(new Error(result.error||'Windows 메뉴 실행에 실패했습니다.'));
      }catch(error){fail(error);}
    });
    child.stderr.setEncoding('utf8');child.stderr.on('data',value=>{session.stderr=(session.stderr+value).slice(-2000);});
    child.on('error',fail);child.stdin.on('error',fail);child.stdout.on('error',fail);
    child.on('close',()=>fail(new Error(session.stderr||'Windows 메뉴 도우미가 종료되었습니다. 다시 시도하면 복구합니다.')));
    return session;
  }
  reference(session,active){for(const stream of [session.child,session.child.stdin,session.child.stdout,session.child.stderr])stream[active?'ref':'unref']?.();}
  execute(input){
    const session=this.start();if(session.closed)return Promise.reject(new Error('Windows 메뉴 도우미가 종료되었습니다.'));
    this.reference(session,true);
    return new Promise((resolve,reject)=>{
      session.pending={resolve,reject};
      if(input.mode!=='menu')session.timer=setTimeout(()=>session.fail(new Error('Windows 셸 응답 시간이 초과되었습니다.')),15000);
      session.child.stdin.write(JSON.stringify(input)+'\n',error=>{if(error)session.fail(error);});
    });
  }
  close(){this.session?.fail(new Error('Windows 메뉴 도우미를 종료했습니다.'));}
}
module.exports={ShellMenuHost};
