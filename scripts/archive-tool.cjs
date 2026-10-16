// Retain only the archive reader used by installer verification, not Squirrel's build toolchain.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const files={'7z.exe':'c7245e21a7553d9e52d434002a401c77a7ca7d0f245f2311b0ddf16f8f946c6f','7z.dll':'9ed007aa82e440ceb39a6e105bb1d602a9bc59a4946267ba8de2f220aa15bc06'};
async function reader(){
 const root=path.resolve('output/tools/archive-reader'),vendor=path.join(root,'package/vendor');
 async function valid(){try{for(const [name,digest] of Object.entries(files))if(createHash('sha256').update(await fs.readFile(path.join(vendor,name))).digest('hex')!==digest)return false;return true;}catch{return false;}}
 if(!await valid()){
  await fs.mkdir(root,{recursive:true});const r=await fetch('https://registry.npmjs.org/electron-winstaller/-/electron-winstaller-5.4.4.tgz',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Archive reader download failed: '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(createHash('sha512').update(bytes).digest('base64')!=='j9ETcBGJaXxAY/b6UBpR7LZfjdU4BAO+yvr4ifqHEdyuc3UNCy91PDGkWKY5UQ4coHNYfnwFggrqD6QPeFGAlg==')throw Error('Archive reader package integrity mismatch');
  const archive=path.join(root,'reader.tgz');await fs.writeFile(archive,bytes);execFileSync('tar.exe',['-xzf',archive,'-C',root,...Object.keys(files).map(name=>'package/vendor/'+name.replace('7z.','7z-x64.'))],{windowsHide:true,stdio:'pipe'});await fs.unlink(archive);for(const name of Object.keys(files))await fs.rename(path.join(vendor,name.replace('7z.','7z-x64.')),path.join(vendor,name));
  if(!await valid())throw Error('Archive reader binary integrity mismatch');
 }
 return path.join(vendor,'7z.exe');
}
module.exports={reader};
