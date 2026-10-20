const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {localPath}=require('./files.cjs');
function createLauncher({launch=spawn,stat=fs.stat,environment=process.env}={}){
  function start(file,args,cwd){return new Promise((resolve,reject)=>{
    const child=launch(file,args,{cwd,windowsHide:false,detached:true,stdio:'ignore',shell:false});
    child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
  });}
  return async value=>{
    const directory=localPath(value);
    if(!(await stat(directory)).isDirectory())throw new Error('터미널은 폴더에서만 열 수 있습니다.');
    const terminal=environment.LOCALAPPDATA?path.join(environment.LOCALAPPDATA,'Microsoft/WindowsApps/wt.exe'):'wt.exe';
    try{
      // Resolve "." from the client process's working directory. The folder name
      // never enters Terminal's command parser (including its semicolon syntax).
      await start(terminal,['--startingDirectory','.'],directory);return {program:'Windows Terminal',path:directory};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const powershell=path.join(environment.SystemRoot||environment.WINDIR||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    await start(powershell,['-NoExit'],directory);return {program:'Windows PowerShell',path:directory};
  };
}
module.exports={createLauncher,openTerminal:createLauncher()};
