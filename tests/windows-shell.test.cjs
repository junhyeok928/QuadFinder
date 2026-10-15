const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');
test('Windows shell exposes real file/background menus and native hidden attributes',{skip:process.platform!=='win32'},async()=>{
  require('../scripts/build-native.cjs').buildNative();const shell=require('../src/windows-shell.cjs');const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-shell-'));
  try{
    const first=path.join(root,'첫 파일.txt'),second=path.join(root,'두 번째.txt');await fs.writeFile(first,'one');await fs.writeFile(second,'two');execFileSync('attrib.exe',['+H',first],{windowsHide:true});
    const networks=await shell.request({mode:'network-drives'});assert(Array.isArray(networks));assert(networks.every(value=>/^[A-Z]:\\$/.test(value)));
    const attrs=await shell.request({mode:'attributes',paths:[first,second]});assert.equal(attrs[0].hidden,true);assert.equal(attrs[1].hidden,false);
    const file=await shell.request({mode:'probe',paths:[first,second]});assert(file.count>5);assert(file.labels.some(label=>/속성|properties/i.test(label)));assert(file.labels.some(label=>/복사|copy/i.test(label)));
    const background=await shell.request({mode:'probe',paths:[root],background:true});assert(background.count>0);
  }finally{assert(path.basename(root).startsWith('quadfinder-shell-'));await fs.rm(root,{recursive:true,force:true});}
});
