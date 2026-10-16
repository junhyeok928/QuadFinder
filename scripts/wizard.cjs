const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const quote=value=>'"'+value.replace(/\$/g,()=> '$$').replace(/"/g,'$\\"')+'"';
const settings=['layout.json','layout.json.tmp','search-roots.json','search-roots.json.tmp','index-cache.json','index-cache.json.tmp','index.sqlite','index.sqlite-wal','index.sqlite-shm'];
async function files(directory,prefix=''){const result=[];for(const item of await fs.readdir(path.join(directory,prefix),{withFileTypes:true})){const relative=path.join(prefix,item.name);if(item.isSymbolicLink())throw new Error('Installer payload must not contain links');if(item.isDirectory())result.push(...await files(directory,relative));else result.push(relative);}return result.sort();}
async function compile({appDirectory,output,testing=false,profileRoot,registryKey}){
  const compiler=await require('./nsis-tool.cjs').compiler(),{version}=require('../package.json'),list=await files(appDirectory);
  const temporary=path.resolve('output','wizard-build-'+randomUUID());await fs.mkdir(temporary,{recursive:true});await fs.mkdir(path.dirname(output),{recursive:true});
  const key=registryKey||'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QuadFinderPreview';
  const parents=new Set();for(const file of list){if(/[$"\r\n]/.test(file))throw new Error('Unsupported installer payload filename');let dir=path.dirname(file);while(dir!=='.'){parents.add(dir);dir=path.dirname(dir);}}
  const dirs=[...parents].sort((a,b)=>b.split(path.sep).length-a.split(path.sep).length);
  const lines=[`!define VERSION ${quote(version)}`,`!define OUTPUT ${quote(output)}`,`!define ICON ${quote(path.resolve('assets/app-icon.ico'))}`,`!define WIZARD_BITMAP ${quote(path.resolve('assets/installer-wizard.bmp'))}`,`!define REG_KEY ${quote(key)}`];
  if(testing)lines.push('!define TESTING');
  // NSIS shell constants are deliberate here; filesystem inputs above are escaped separately.
  lines.push(`!define DEFAULT_DIR "${testing?profileRoot+'\\app':'$LOCALAPPDATA\\Programs\\QuadFinderPreview'}"`,`!define MENU_DIR "${testing?profileRoot+'\\shortcuts':'$SMPROGRAMS\\QuadFinder 미리보기'}"`,`!define DESKTOP_LINK "${testing?profileRoot+'\\desktop.lnk':'$DESKTOP\\QuadFinder 미리보기.lnk'}"`,`!define DATA_DIR "${testing?profileRoot+'\\data':'$APPDATA\\QuadFinder'}"`);
  lines.push('!macro InstallFiles');let last;
  for(const file of list){const dir=path.dirname(file);if(dir!==last){lines.push(`SetOutPath "$INSTDIR${dir==='.'?'':'\\'+dir}"`);last=dir;}lines.push(`File ${quote(path.join(appDirectory,file))}`);}lines.push('!macroend','!macro UninstallFiles');
  for(const dir of dirs)lines.push(`Push "$INSTDIR\\${dir}"`,'Call un.CheckDir');
  for(const file of list)lines.push(`Delete "$INSTDIR\\${file}"`);
  for(const dir of dirs)lines.push(`RMDir "$INSTDIR\\${dir}"`);
  lines.push('!macroend','!macro DeleteSettings');for(const file of settings)lines.push(`Delete "${testing?profileRoot+'\\data':'$APPDATA\\QuadFinder'}\\${file}"`);lines.push('!macroend');
  const config=path.join(temporary,'config.nsh');await fs.writeFile(config,'\ufeff'+lines.join('\r\n'));
  const template=await fs.readFile(path.resolve('installer/quadfinder.nsi')),frozen=path.join(temporary,'setup.nsi');await fs.writeFile(frozen,template);
  const scriptSha256=createHash('sha256').update(template).digest('hex'),builderSha256=createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  const backend=path.join(temporary,'SetupEngine.exe');
  await fs.writeFile(config,'\ufeff'+lines.join('\r\n').replace('!define OUTPUT '+quote(output),'!define OUTPUT '+quote(backend)));
  execFileSync(compiler,['/V2','/DCONFIG='+config,frozen],{windowsHide:true,stdio:'pipe',timeout:600000});
  const frontend=await require('./setup-window.cjs').wrap({backend,output,testing,profileRoot,registryKey:key});
  return {version,files:list,registryKey:key,scriptSha256,builderSha256,...frontend,engine:backend};
}
async function build(){const {version}=require('../package.json'),appDirectory=path.resolve(`release/${version}/QuadFinder-win32-x64`),directory=path.resolve(`release/${version}/wizard`),output=path.join(directory,'QuadFinder-Setup.exe');const {engine,...manifest}=await compile({appDirectory,output});const digest=createHash('sha256').update(await fs.readFile(output)).digest('hex');await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),`${digest}  ${path.basename(output)}\n`);await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));console.log(output);}
module.exports={compile};if(require.main===module)build().catch(error=>{console.error(error.stdout?.toString()||error);process.exitCode=1;});
