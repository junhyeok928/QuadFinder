const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {listDirectory,localPath,childPath,createFolder,matches}=require('../src/files.cjs');

test('real directory listing preserves names, sizes and folder ordering',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-test-'));
  try{await fs.mkdir(path.join(root,'자료'));await fs.writeFile(path.join(root,'A & notes.txt'),'abc');const result=await listDirectory(root);assert.equal(result.entries[0].name,'자료');assert.equal(result.entries[1].name,'A & notes.txt');assert.equal(result.entries[1].size,3);assert.equal(result.parent,path.dirname(root));}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('filename search supports multiple words, case, Korean normalization and filters',()=>{
  const entry={name:'프로젝트 REPORT.pdf',directory:false,modified:Date.now()};
  assert(matches(entry,'REPORT 프로젝트','documents'));assert(!matches(entry,'REPORT','images'));assert(matches(entry,'REPORT','recent'));assert(!matches({...entry,modified:0},'REPORT','recent'));assert(matches({...entry,name:'한글.txt'},'한글'.normalize('NFD')));
});
test('paths accept shares and reject malformed UNC, device paths and invalid names',()=>{
  for(const value of ['relative','\\\\server','\\\\?\\C:\\file','\\\\.\\pipe\\name','C:\\bad\0'])assert.throws(()=>localPath(value));
  if(process.platform==='win32'){assert.equal(localPath('\\\\server\\share'),'\\\\server\\share\\');assert.equal(localPath('//server/share/folder'),'\\\\server\\share\\folder');assert.throws(()=>localPath('\\relative'));}
  for(const name of ['..','../bad','a/b','CON','com1.txt','name.','name ','bad:name',''])assert.throws(()=>childPath(process.cwd(),name));
});
test('search supports wildcard, quoted phrase, extension, path and size terms',()=>{
  const entry={name:'프로젝트 최종 보고서.pdf',path:'C:\\Documents\\프로젝트 최종 보고서.pdf',directory:false,size:2*1024**2,modified:Date.now()};
  assert(matches(entry,'*.pdf "최종 보고서" ext:pdf;docx size:>1mb path:documents'));
  assert(!matches(entry,'*.xlsx'));assert(!matches(entry,'size:<1mb'));assert(!matches(entry,'"보고서 최종"'));assert(!matches({...entry,directory:true},'size:>1mb'));
});
test('new folder refuses collisions and leaves existing files intact',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-test-'));
  try{await createFolder(root,'자료');await assert.rejects(createFolder(root,'자료'),{code:'EEXIST'});assert((await fs.stat(path.join(root,'자료'))).isDirectory());}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('worker indexes nested folders, deduplicates roots and reports filtered results',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-index-'));
  let worker;
  try{
    await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested','프로젝트.pdf'),'test');await fs.writeFile(path.join(root,'nested','프로젝트.png'),'test');
    worker=new Worker(path.join(__dirname,'../src/index-worker.cjs'),{workerData:{native:false,roots:[root,root]}});
    const result=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('worker timeout')),10000);worker.on('error',reject);worker.on('message',message=>{if(message.type==='status'&&!message.indexing){assert.equal(message.count,3);worker.postMessage({id:1,query:'프로젝트',filter:'documents'});}if(message.type==='results'){clearTimeout(timeout);resolve(message);}});});
    assert.equal(result.total,1);assert.equal(result.entries[0].name,'프로젝트.pdf');
  }finally{await worker?.terminate();await fs.rm(root,{recursive:true,force:true});}
});
