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
  }finally{assert(path.basename(root).startsWith('quadfinder-shell-'));await fs.rm(root,{recursive:true,force:true});}
});
