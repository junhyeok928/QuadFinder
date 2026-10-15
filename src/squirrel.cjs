const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
function updateExecutable(executable){return path.resolve(path.dirname(executable),'..','Update.exe');}
function handleSquirrel(app,args=process.argv,executable=process.execPath,launch=spawn){
  if(!app.isPackaged||process.platform!=='win32')return false;
  const command=args.find(value=>['--squirrel-install','--squirrel-updated','--squirrel-uninstall','--squirrel-obsolete'].includes(value));if(!command)return false;
  if(command==='--squirrel-obsolete'){app.quit();return true;}
  const update=updateExecutable(executable);if(!fs.existsSync(update)){app.quit();return true;}
  const child=launch(update,[command==='--squirrel-uninstall'?'--removeShortcut':'--createShortcut',path.basename(executable)],{windowsHide:true,stdio:'ignore'});
  const timer=setTimeout(()=>app.quit(),8000);const finish=()=>{clearTimeout(timer);app.quit();};child.once('error',finish);child.once('exit',finish);return true;
}
module.exports={handleSquirrel,updateExecutable};
