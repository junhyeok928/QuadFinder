const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const pause=()=>new Promise(resolve=>setTimeout(resolve,150));
const exists=async file=>{try{await fs.access(file);return true;}catch{return false;}};
async function wait(test){for(let i=0;i<100;i++){if(await test())return;await pause();}throw new Error('Wizard state timeout');}
async function check(){
  const root=await fs.mkdtemp(path.resolve('output/wizard-check-')),payload=path.join(root,'payload'),setup=path.join(root,'Setup.exe'),registryKey='Software\\QuadFinderInstallerTest-'+randomUUID();
  const install=path.join(root,'app'),data=path.join(root,'data');
  const registered=()=>{try{execFileSync('reg.exe',['query','HKCU\\'+registryKey],{stdio:'pipe',windowsHide:true});return true;}catch{return false;}};
  try{
    await fs.mkdir(path.join(payload,'resources'),{recursive:true});await fs.writeFile(path.join(payload,'QuadFinder.exe'),'test payload');await fs.writeFile(path.join(payload,'resources','payload.txt'),'unchanged');await fs.mkdir(data);await fs.writeFile(path.join(data,'layout.json'),'settings');await fs.writeFile(path.join(data,'index.sqlite'),'index');await fs.writeFile(path.join(data,'unrelated.txt'),'preserve');
    await require('./wizard.cjs').compile({appDirectory:payload,output:setup,testing:true,profileRoot:root,registryKey});
    if(process.argv.includes('--screenshots'))execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/wizard-ui.ps1'),'-Setup',setup,'-Output',path.resolve('output/wizard-preview')],{windowsHide:true,stdio:'pipe',timeout:30000});
    const installNow=target=>execFileSync(setup,['/S','/D='+target],{windowsHide:true,stdio:'pipe',timeout:30000});
    installNow(install);assert(await exists(path.join(install,'Uninstall.exe')));assert(registered());assert(await exists(path.join(root,'shortcuts','QuadFinder.lnk')));assert.equal(await exists(path.join(root,'desktop.lnk')),false);
    await fs.writeFile(path.join(install,'my-document.txt'),'keep');installNow(install);assert.equal(await fs.readFile(path.join(data,'layout.json'),'utf8'),'settings');
    execFileSync(path.join(install,'Uninstall.exe'),['/S'],{windowsHide:true,stdio:'pipe',timeout:30000});await wait(async()=>!registered()&&!await exists(path.join(install,'QuadFinder.exe')));
    assert.equal(await fs.readFile(path.join(data,'layout.json'),'utf8'),'settings');assert.equal(await fs.readFile(path.join(install,'my-document.txt'),'utf8'),'keep');assert.equal(await exists(path.join(root,'shortcuts','QuadFinder.lnk')),false);
    const second=path.join(root,'second-app');installNow(second);execFileSync(path.join(second,'Uninstall.exe'),['/S','/PURGEDATA'],{windowsHide:true,stdio:'pipe',timeout:30000});await wait(async()=>!registered()&&!await exists(path.join(data,'layout.json')));
    assert.equal(await exists(path.join(data,'index.sqlite')),false);assert.equal(await fs.readFile(path.join(data,'unrelated.txt'),'utf8'),'preserve');
    const rejected=path.join(root,'occupied');await fs.mkdir(rejected);await fs.writeFile(path.join(rejected,'personal.txt'),'never replace');try{installNow(rejected);}catch{}assert.equal(await exists(path.join(rejected,'QuadFinder.exe')),false);
    console.log(JSON.stringify({wizard:true,installed:true,upgradePreservesSettings:true,uninstaller:true,defaultPreservesData:true,optionalSettingsRemoval:true,unknownFilesPreserved:true,isolatedRegistryRemoved:true,occupiedFolderRejected:true}));
  }finally{
    if(registered())execFileSync('reg.exe',['delete','HKCU\\'+registryKey,'/f'],{stdio:'pipe',windowsHide:true});
    await pause();assert.equal(path.dirname(root),path.resolve('output'));assert(path.basename(root).startsWith('wizard-check-'));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
check().then(()=>process.argv.includes('--fixtures-only')?null:require('./check-wizard-artifact.cjs').check()).catch(error=>{console.error(error.stdout?.toString()||error);process.exitCode=1;});
