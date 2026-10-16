const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{createReadStream}=require('node:fs');
async function hash(file){const value=createHash('sha256');for await(const chunk of createReadStream(file))value.update(chunk);return value.digest('hex');}
async function check(){
 const {version}=require('../package.json'),directory=path.resolve(`release/${version}/wizard`),manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
 assert.equal(manifest.frontendSha256,await hash(path.resolve('installer/SetupWindow.cs')));assert.equal(manifest.viewSha256,await hash(path.resolve('installer/setup-window.xaml')));assert.equal(manifest.frontendBuilderSha256,await hash(path.resolve('scripts/setup-window.cjs')));
 assert.equal(manifest.version,version);assert.equal(manifest.scriptSha256,await hash(path.resolve('installer/quadfinder.nsi')));assert.equal(manifest.builderSha256,await hash(path.resolve('scripts/wizard.cjs')));
 const [digest,name]=(await fs.readFile(path.join(directory,'SHA256SUMS.txt'),'utf8')).trim().split(/\s+/);assert.equal(path.basename(name),name);const setup=path.join(directory,name);assert.equal(await hash(setup),digest);
 const temporary=await fs.mkdtemp(path.resolve('output/wizard-artifact-'));
 try{
  const vendor=path.join(path.dirname(require.resolve('electron-winstaller/package.json')),'vendor','7z.exe'),critical=['QuadFinder.exe','resources/app.asar','resources/QuadFinder.Index.exe','resources/QuadFinder.Shell.exe'];
  const engine=path.join(temporary,'SetupEngine.exe');require('./setup-window.cjs').extractEngine(setup,engine);assert.equal(await hash(engine),manifest.payloadSha256);
  execFileSync(vendor,['x',engine,...critical,'-y','-o'+temporary],{windowsHide:true,stdio:'pipe'});
  for(const file of critical)assert.equal(await hash(path.join(temporary,file)),await hash(path.resolve(`release/${version}/QuadFinder-win32-x64`,file)));
  const asar=require(require.resolve('@electron/asar',{paths:[path.dirname(require.resolve('electron-winstaller'))]}));assert.equal(JSON.parse(asar.extractFile(path.join(temporary,'resources/app.asar'),'package.json')).version,version);
 }finally{assert.equal(path.dirname(temporary),path.resolve('output'));assert(path.basename(temporary).startsWith('wizard-artifact-'));await fs.rm(temporary,{recursive:true,force:true});}
 console.log(JSON.stringify({wizardPayload:true,version,checksum:true,currentInstallerSource:true,appAndNativeHelpers:true}));
}
module.exports={check};if(require.main===module)check().catch(error=>{console.error(error);process.exitCode=1;});
