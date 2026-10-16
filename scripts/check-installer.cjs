const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto'),{createReadStream}=require('node:fs'),assert=require('node:assert/strict');
async function hash(file,algorithm){const value=createHash(algorithm);for await(const chunk of createReadStream(file))value.update(chunk);return value.digest('hex');}
async function check(){
 const {version}=require('../package.json'),directory=path.resolve(`release/${version}/installer`),setup=path.join(directory,`QuadFinder-${version}-win32-x64-Setup.exe`);
 const header=await fs.open(setup,'r');try{const data=Buffer.alloc(2);await header.read(data,0,2,0);assert.equal(data.toString(),'MZ');}finally{await header.close();}
 const lines=(await fs.readFile(path.join(directory,'RELEASES'),'utf8')).trim().split(/\r?\n/),full=lines.find(line=>line.includes('-full.nupkg'));assert(full);const [sha1,name,size]=full.trim().split(/\s+/);assert.equal(path.basename(name),name);assert(name.includes(version));const nupkg=path.join(directory,name);assert.equal((await fs.stat(nupkg)).size,Number(size));assert.equal((await hash(nupkg,'sha1')).toUpperCase(),sha1.toUpperCase());
 for(const line of (await fs.readFile(path.join(directory,'SHA256SUMS.txt'),'utf8')).trim().split(/\r?\n/)){const [digest,file]=line.split(/\s+/);assert.equal(path.basename(file),file);assert.equal(await hash(path.join(directory,file),'sha256'),digest);}
 const vendor=path.join(path.dirname(require.resolve('electron-winstaller/package.json')),'vendor','7z.exe'),temporary=await fs.mkdtemp(path.resolve('output/installer-check-'));
 try{
  execFileSync(vendor,['x',nupkg,'lib/net45/resources/app.asar','lib/net45/resources/QuadFinder.Shell.exe','lib/net45/resources/QuadFinder.Index.exe','-y','-o'+temporary],{windowsHide:true,stdio:'pipe'});
  const asar=require(require.resolve('@electron/asar',{paths:[path.dirname(require.resolve('electron-winstaller'))]})),archive=path.join(temporary,'lib/net45/resources/app.asar');
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);for(const file of ['src/undo.cjs','src/updater.cjs','src/squirrel.cjs','src/index-store.cjs','src/native-index.cjs','src/renderer/renderer.js'])assert(asar.extractFile(archive,path.normalize(file)).length>0);await fs.access(path.join(temporary,'lib/net45/resources/QuadFinder.Shell.exe'));await fs.access(path.join(temporary,'lib/net45/resources/QuadFinder.Index.exe'));
 }finally{assert.equal(path.dirname(temporary),path.resolve('output'));assert(path.basename(temporary).startsWith('installer-check-'));await fs.rm(temporary,{recursive:true,force:true});}
 console.log(JSON.stringify({installer:true,version,releaseMetadata:true,packageIntegrity:true,appContents:true,nativeShell:true}));
}
check().catch(error=>{console.error(error);process.exitCode=1;});
