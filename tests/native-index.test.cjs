const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {NativeIndex}=require('../src/native-index.cjs');

test('native index streams large Unicode directories, supports long paths and rejects non-read operations',{skip:process.platform!=='win32'},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-native-index-'));let native;
  try{
    // Shell tests build this executable too; this test owns no build output handle.
    const {execFileSync}=require('node:child_process');const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    const custom=path.join(root,'Index.exe');execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/r:System.Web.Extensions.dll',`/out:${custom}`,path.resolve('native/IndexBridge.cs')],{windowsHide:true});
    native=new NativeIndex({file:custom});await native.ready;
    await Promise.all(Array.from({length:530},(_,i)=>fs.writeFile(path.join(root,`자료-${i}.txt`),'abc')));
    let result=await native.list(root);assert.equal(result.entries.filter(entry=>entry.name.startsWith('자료-')).length,530);assert.equal(result.entries.find(entry=>entry.name==='자료-529.txt').size,3);
    const nested=path.join(root,...Array.from({length:8},()=> '긴경로-'.repeat(8)));await fs.mkdir(nested,{recursive:true});await fs.writeFile(path.join(nested,'끝.txt'),'long');result=await native.list(nested);assert.equal(result.entries[0].name,'끝.txt');assert.equal((await native.stat(path.join(nested,'끝.txt'))).size,4);
    await assert.rejects(native.request({mode:'write',path:root}));await assert.rejects(native.list('\\\\server\\share'));await assert.rejects(native.stat(path.join(root,'missing.txt')),{code:'ENOENT'});
    assert((await native.list(root)).entries.length>530);
    // Exercise the same pipe transport used after UAC, without prompting in CI.
    const net=require('node:net'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto'),readline=require('node:readline');
    const name='QuadFinder-test-'+randomUUID(),server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen('\\\\.\\pipe\\'+name,resolve);});
    const connected=new Promise(resolve=>server.once('connection',resolve));const child=spawn(custom,['--pipe',name],{windowsHide:true,stdio:'ignore'});const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    const socket=await connected,lines=readline.createInterface({input:socket});const response=new Promise(resolve=>lines.once('line',line=>resolve(JSON.parse(line))));socket.write(JSON.stringify({mode:'hello'})+'\n');assert.equal(typeof (await response).value.elevated,'boolean');socket.end();assert.equal(await exited,0);lines.close();await new Promise(resolve=>server.close(resolve));
  }finally{native?.close();await new Promise(resolve=>setTimeout(resolve,50));assert(path.basename(root).startsWith('quadfinder-native-index-'));await fs.rm(root,{recursive:true,force:true});}
});
