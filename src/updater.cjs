const {EventEmitter}=require('node:events');
const RELEASES='https://github.com/junhyeok928/QuadFinder/releases';
class AppUpdater extends EventEmitter{
  constructor({native,version,installed=false,preview=false,canInstall=()=>true}){
    super();this.native=native;this.canInstall=canInstall;this.state={phase:installed?'idle':'portable',version,message:installed?'업데이트 확인':'자동 업데이트는 설치 버전에서 지원합니다.',releases:RELEASES};this.installed=installed;this.checking=false;
    if(preview){this.installed=false;this.state={...this.state,phase:'preview',message:'출시 전 미리보기 · 자동 업데이트는 비활성화되어 있습니다.'};return;}
    if(!installed)return;
    native.setFeedURL({url:`https://update.electronjs.org/junhyeok928/QuadFinder/win32-x64/${version}`});
    native.on('checking-for-update',()=>this.set('checking','업데이트 확인 중…'));
    native.on('update-available',()=>this.set('downloading','새 버전을 다운로드하고 있습니다.'));
    native.on('update-not-available',()=>{this.checking=false;this.set('current','최신 버전입니다.');});
    native.on('update-downloaded',(_event,_notes,name)=>{this.checking=false;this.set('ready',`${name||'새 버전'} 준비 완료 · 재시작하여 적용`);});
    native.on('error',error=>{this.checking=false;this.set('error','업데이트를 확인하지 못했습니다. 네트워크 연결과 공개 릴리스를 확인하세요.');this.state.detail=error?.message||String(error);});
  }
  snapshot(){return {...this.state};}
  set(phase,message){this.state={...this.state,phase,message,detail:undefined};this.emit('update',this.snapshot());}
  check(){if(!this.installed)return this.snapshot();if(this.checking||this.state.phase==='ready')return this.snapshot();this.checking=true;this.set('checking','업데이트 확인 중…');try{this.native.checkForUpdates();}catch(error){this.checking=false;this.set('error',error.message);}return this.snapshot();}
  install(){if(this.state.phase!=='ready')throw new Error('다운로드가 완료된 업데이트가 없습니다.');if(!this.canInstall())throw new Error('파일 작업이 끝난 뒤 업데이트를 적용하세요.');this.native.quitAndInstall();}
  start(firstRun=false){if(!this.installed)return;this.first=setTimeout(()=>this.check(),firstRun?60000:15000);this.first.unref?.();this.interval=setInterval(()=>this.check(),6*60*60*1000);this.interval.unref?.();}
  stop(){clearTimeout(this.first);clearInterval(this.interval);}
}
module.exports={AppUpdater,RELEASES};
