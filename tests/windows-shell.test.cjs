const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');
test('Windows shell exposes real file/background menus and native hidden attributes',{skip:process.platform!=='win32'},async()=>{
  require('../scripts/build-native.cjs').buildNative();const shell=require('../src/windows-shell.cjs');const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-shell-'));
  try{
    const first=path.join(root,'첫 파일.txt'),second=path.join(root,'두 번째.txt');await fs.writeFile(first,'one');await fs.writeFile(second,'two');execFileSync('attrib.exe',['+H',first],{windowsHide:true});
    const networks=await shell.request({mode:'network-drives'});assert(Array.isArray(networks));assert(networks.every(value=>/^[A-Z]:\\$/.test(value)));
    const locals=await shell.request({mode:'local-drives'});assert(locals.length>0);assert(locals.every(value=>/^[A-Z]:\\$/.test(value)&&!networks.includes(value)));assert(locals.includes(path.parse(os.tmpdir()).root.toUpperCase()));
    const attrs=await shell.request({mode:'attributes',paths:[first,second]});assert.equal(attrs[0].hidden,true);assert.equal(attrs[1].hidden,false);
    const missing=await shell.request({mode:'attributes',paths:[path.join(root,'missing.txt')]});assert.equal(missing[0].known,false);assert.equal(attrs[0].known,true);
    const file=await shell.request({mode:'probe',paths:[first,second]});assert(file.count>5);assert(file.labels.length>0);assert(file.verbs.includes('properties'),JSON.stringify(file));assert(file.verbs.includes('copy'),JSON.stringify(file));
    const background=await shell.request({mode:'probe',paths:[root],background:true});assert(background.count>0);assert(background.hostActions.includes('paste'));assert(background.hostActions.includes('view:details'));assert(background.hostActions.includes('newfolder'));
    const nested=path.join(root,'nested');await fs.mkdir(nested);const third=path.join(nested,'third.txt');await fs.writeFile(third,'three');const mixed=await shell.request({mode:'probe',paths:[first,third]});assert(mixed.count>0);assert(mixed.verbs.includes('copy'));
    const dismissed=await shell.request({mode:'dismiss-test',paths:[first],x:30,y:30});assert.equal(dismissed.cancelled,true);
    await backgroundCommands({shell,root});
  }finally{assert(path.basename(root).startsWith('quadfinder-shell-'));await fs.rm(root,{recursive:true,force:true});}
});

async function backgroundCommands({shell,root}){
 const {randomUUID}=require('node:crypto'),folder=path.join(root,"한글 공백 & ' %TEMP%"),report=path.join(root,'command-report.txt'),source=path.join(root,'Recorder.cs'),exe=path.join(root,'Recorder.exe');
 const verb='QuadFinderTest'+randomUUID().replaceAll('-',''),key='HKCU\\Software\\Classes\\Directory\\Background\\shell\\'+verb;
 const environment='QUADFINDER_SHELL_TEST_RECORDER',previous=process.env[environment];let registered=false;
 await fs.mkdir(folder);
 await fs.writeFile(source,`using System;using System.IO;using System.Linq;class Recorder{static void Main(string[] args){File.WriteAllLines(${JSON.stringify(report)},new[]{Environment.CurrentDirectory}.Concat(args));}}`);
 execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/out:'+exe,source],{windowsHide:true});
 async function readReport(){for(let i=0;i<200;i++){try{return (await fs.readFile(report,'utf8')).trimEnd().split(/\r?\n/);}catch(error){if(error.code!=='ENOENT')throw error;await new Promise(resolve=>setTimeout(resolve,25));}}throw Error('Background command did not run');}
 function register(command,type='REG_SZ'){execFileSync('reg.exe',['add',key+'\\command','/ve','/t',type,'/d',command,'/f'],{windowsHide:true,stdio:'pipe'});registered=true;}
 async function invoke(target){await fs.unlink(report).catch(error=>{if(error.code!=='ENOENT')throw error;});return shell.request({mode:'invoke-test',background:true,extended:true,paths:[target],verb});}
 try{
  process.env[environment]=exe;
  shell.closeMenu(); // The persistent child inherits environment variables at startup.
  register(`"%${environment}%" "%V" "%1" "%L" "%W"`,'REG_EXPAND_SZ');
  assert.equal((await invoke(folder)).action,verb);const captured=await readReport();assert.equal(await fs.realpath(captured[0]),await fs.realpath(folder));assert.deepEqual(captured.slice(1),Array(4).fill(folder));
  const drive=path.parse(root).root;await invoke(drive);const rootCaptured=await readReport();assert.equal(await fs.realpath(rootCaptured[0]),await fs.realpath(drive));assert.deepEqual(rootCaptured.slice(1),Array(4).fill(drive));
  const script=path.join(root,'PowerShell-test.ps1');
  await fs.writeFile(script,`param([string]$Target)\n[IO.File]::WriteAllLines('${report.replaceAll("'","''")}', @((Get-Location).Path, $Target))`,'utf8');
  const powershell=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
  register(`"${powershell}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" -Target "%V"`);
  await invoke(folder);const powerShellCaptured=await readReport();assert.equal(await fs.realpath(powerShellCaptured[0]),await fs.realpath(folder));assert.equal(powerShellCaptured[1],folder);
 }finally{
  if(registered)execFileSync('reg.exe',['delete',key,'/f'],{windowsHide:true,stdio:'pipe'});
  if(previous===undefined)delete process.env[environment];else process.env[environment]=previous;
 }
}
