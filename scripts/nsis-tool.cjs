const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const URL='https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis%401.2.1/nsis-bundle-3.12.tar.gz';
const SHA256='56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4';
async function compiler(){
  const root=path.resolve('output/tools'),archive=path.join(root,'nsis-bundle-3.12.tar.gz'),directory=path.join(root,'nsis-3.12'),exe=path.join(directory,'nsis-bundle/windows/makensis.exe');
  await fs.mkdir(root,{recursive:true});let data;try{data=await fs.readFile(archive);}catch{const response=await fetch(URL);if(!response.ok)throw new Error('NSIS download failed: '+response.status);data=Buffer.from(await response.arrayBuffer());}
  if(createHash('sha256').update(data).digest('hex')!==SHA256)throw new Error('NSIS checksum mismatch');await fs.writeFile(archive,data);
  try{await fs.access(exe);}catch{await fs.mkdir(directory,{recursive:true});execFileSync('tar.exe',['-xzf',archive,'-C',directory],{windowsHide:true,stdio:'pipe'});}
  return exe;
}
module.exports={compiler};
