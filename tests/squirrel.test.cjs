const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {handleSquirrel}=require('../src/squirrel.cjs');
test('installer lifecycle creates and removes only app shortcuts without opening the UI',{skip:process.platform!=='win32'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-squirrel-'));try{await fs.writeFile(path.join(root,'Update.exe'),'test stub');let quits=0;const app={isPackaged:true,quit:()=>quits++},exe=path.join(root,'app-0.8.0','QuadFinder.exe'),calls=[];const launch=(file,args,options)=>{calls.push({file,args,options});const child=new EventEmitter();setImmediate(()=>child.emit('exit',0));return child;};
 assert(handleSquirrel(app,['app','--squirrel-install'],exe,launch));await new Promise(r=>setImmediate(r));assert.equal(quits,1);assert.deepEqual(calls[0].args,['--createShortcut','QuadFinder.exe']);assert(calls[0].options.windowsHide);
 assert(handleSquirrel(app,['app','--squirrel-uninstall'],exe,launch));await new Promise(r=>setImmediate(r));assert.deepEqual(calls[1].args,['--removeShortcut','QuadFinder.exe']);assert(handleSquirrel(app,['app','--squirrel-obsolete'],exe,launch));assert.equal(quits,3);assert.equal(handleSquirrel(app,['app'],exe,launch),false);assert.equal(handleSquirrel({...app,isPackaged:false},['app','--squirrel-install'],exe,launch),false);
 }finally{assert(path.basename(root).startsWith('quadfinder-squirrel-'));await fs.rm(root,{recursive:true,force:true});}
});
