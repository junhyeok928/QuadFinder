const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function buildNative(){
  if(process.platform!=='win32')throw new Error('Windows에서 빌드하세요.');
  const directory=path.resolve(__dirname,'../output/native');fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,'QuadFinder.Shell.exe');
  const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll',`/out:${file}`,path.resolve(__dirname,'../native/ShellBridge.cs')],{stdio:'inherit',windowsHide:true});
  return file;
}
module.exports={buildNative};if(require.main===module)console.log(buildNative());
