const fs=require('node:fs/promises');
const path=require('node:path');
async function size(dir){let bytes=0,files=0;for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory()){const nested=await size(name);bytes+=nested.bytes;files+=nested.files;}else{bytes+=(await fs.stat(name)).size;files++;}}return {bytes,files};}
async function build(){
  const {packager}=await import('@electron/packager');
  const {version}=require('../package.json');
  const native=require('./build-native.cjs').buildNative();
  const outputs=await packager({dir:'.',name:'QuadFinder',icon:'assets/app-icon.ico',platform:'win32',arch:'x64',out:`release/${version}`,extraResource:[native,path.join(path.dirname(native),'QuadFinder.Index.exe')],overwrite:true,asar:true,prune:false,
    ignore:name=>Boolean(name)&&!/^\/(package\.json$|src(?:\/|$)|assets(?:\/|$))/.test(name.replaceAll('\\','/')),
    appCopyright:'QuadFinder contributors'});
  for(const output of outputs){
    const root=path.resolve(output),before=await size(root),locales=path.join(root,'locales');
    for(const name of await fs.readdir(locales)){
      if(['ko.pak','en-US.pak'].includes(name))continue;
      const target=path.resolve(locales,name);
      if(path.dirname(target)!==locales||!name.endsWith('.pak'))throw new Error('Unexpected locale path');
      await fs.unlink(target);
    }
    const after=await size(root);
    const report={version,before,after,savedBytes:before.bytes-after.bytes,locales:await fs.readdir(locales)};
    await fs.writeFile(path.join(path.dirname(root),'size-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({output:root,...report},null,2));
  }
}
build().catch(error=>{console.error(error);process.exitCode=1;});
