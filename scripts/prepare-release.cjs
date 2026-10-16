// Explicit distribution step; the default package command remains folder-only.
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
async function hash(file){return createHash('sha256').update(await fs.readFile(file)).digest('hex');}
async function prepare(){
 const {version}=require('../package.json'),root=path.resolve('release',version),portable=path.join(root,'QuadFinder-win32-x64'),dist=path.join(root,'dist');
 await fs.access(path.join(portable,'QuadFinder.exe'));await fs.access(path.join(root,'wizard','QuadFinder-Setup.exe'));
 execFileSync(process.execPath,[path.resolve('scripts/check-package.cjs')],{stdio:'inherit',windowsHide:true});
 await require('./check-wizard-artifact.cjs').check();await fs.mkdir(dist,{recursive:true});
 const zip=path.join(dist,'QuadFinder-'+version+'-portable-x64.zip');
 try{await fs.unlink(zip);}catch(e){if(e.code!=='ENOENT')throw e;}
 execFileSync(require('7zip-bin').path7za,['a','-tzip','-mx=5',zip,'QuadFinder-win32-x64'],{cwd:root,stdio:'pipe',windowsHide:true,timeout:300000});
 execFileSync(require('7zip-bin').path7za,['t',zip],{stdio:'pipe',windowsHide:true,timeout:120000});
 const setup=path.join(dist,'QuadFinder-Setup.exe');await fs.copyFile(path.join(root,'wizard','QuadFinder-Setup.exe'),setup);
 const assets=[];for(const file of [setup,zip])assets.push({name:path.basename(file),bytes:(await fs.stat(file)).size,sha256:await hash(file)});
 await fs.writeFile(path.join(dist,'SHA256SUMS.txt'),assets.map(a=>a.sha256+'  '+a.name).join('\n')+'\n');
 await fs.writeFile(path.join(dist,'assets.json'),JSON.stringify({version,assets},null,2));console.log(JSON.stringify({dist,assets},null,2));
}
prepare().catch(e=>{console.error(e.stdout?.toString()||e);process.exitCode=1;});
