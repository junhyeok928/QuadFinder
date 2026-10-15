const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {OperationQueue,renameItem}=require('../src/operations.cjs');

async function fixture(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-ops-'));
  const src=path.join(root,'src'),dst=path.join(root,'dst'),trash=path.join(root,'trash');
  await Promise.all([src,dst,trash].map(dir=>fs.mkdir(dir)));
  try{await run({root,src,dst,trash});}finally{assert(path.basename(root).startsWith('quadfinder-ops-'));await fs.rm(root,{recursive:true,force:true});}
}
function perform(queue,input){return new Promise((resolve,reject)=>{
  let id;const timer=setTimeout(()=>reject(new Error('operation timeout')),15000);
  queue.on('update',function update(jobs){const job=jobs.find(item=>item.id===id);if(job&&!['queued','scanning','running'].includes(job.status)){clearTimeout(timer);queue.off('update',update);resolve(job);}});
  id=queue.enqueue(input);
});}
test('nested copies preserve contents and existing collisions use a new name',()=>fixture(async({src,dst})=>{
  await fs.mkdir(path.join(src,'자료'));await fs.writeFile(path.join(src,'자료','문서.txt'),'한국어');await fs.mkdir(path.join(dst,'자료'));await fs.writeFile(path.join(dst,'자료','keep.txt'),'keep');
  const queue=new OperationQueue({trash:async()=>{throw new Error('not expected');}});
  const result=await perform(queue,{kind:'copy',sources:[path.join(src,'자료')],destination:dst});
  assert.equal(result.status,'completed');assert.equal(await fs.readFile(path.join(dst,'자료 (2)','문서.txt'),'utf8'),'한국어');assert.equal(await fs.readFile(path.join(dst,'자료','keep.txt'),'utf8'),'keep');assert.equal(await fs.readFile(path.join(src,'자료','문서.txt'),'utf8'),'한국어');assert(!(await fs.readdir(dst)).some(name=>name.startsWith('.quadfinder-')));
}));
test('move only trashes source after a verified complete copy',()=>fixture(async({src,dst,trash})=>{
  const file=path.join(src,'a.txt');await fs.writeFile(file,'original');
  const queue=new OperationQueue({trash:async source=>{assert.equal(await fs.readFile(path.join(dst,'a.txt'),'utf8'),'original');await fs.rename(source,path.join(trash,'a.txt'));}});
  const result=await perform(queue,{kind:'move',sources:[file],destination:dst});
  assert.equal(result.status,'completed');await assert.rejects(fs.stat(file),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(trash,'a.txt'),'utf8'),'original');
}));
test('skip collisions never overwrites or removes the source',()=>fixture(async({src,dst})=>{
  const file=path.join(src,'a.txt');await fs.writeFile(file,'new');await fs.writeFile(path.join(dst,'a.txt'),'old');
  const queue=new OperationQueue({trash:async()=>assert.fail('source must remain'),conflict:async()=> 'skip'});
  const result=await perform(queue,{kind:'move',sources:[file],destination:dst});assert.equal(result.skipped,1);assert.equal(await fs.readFile(file,'utf8'),'new');assert.equal(await fs.readFile(path.join(dst,'a.txt'),'utf8'),'old');
}));
test('self/descendant destinations and overlapping selected folders are handled',()=>fixture(async({src,dst})=>{
  const folder=path.join(src,'folder'),nested=path.join(folder,'nested');await fs.mkdir(nested,{recursive:true});await fs.writeFile(path.join(nested,'a.txt'),'abc');
  const queue=new OperationQueue({trash:async()=>assert.fail()});
  assert.equal((await perform(queue,{kind:'copy',sources:[folder],destination:nested})).status,'failed');
  const result=await perform(queue,{kind:'copy',sources:[folder,nested],destination:dst});assert.equal(result.total,1);assert.equal(result.done,1);
}));
test('cancel during copying cleans staging and preserves source',()=>fixture(async({src,dst})=>{
  const file=path.join(src,'large.bin');await fs.writeFile(file,Buffer.alloc(8*1024*1024,7));
  const queue=new OperationQueue({trash:async()=>assert.fail()});
  queue.on('update',jobs=>{const job=jobs[0];if(job.bytes>0)queue.cancel(job.id);});
  // Cancellation notifies listeners; avoid recursive cancellation by the listener above.
  const originalCancel=queue.cancel.bind(queue);let cancelled=false;queue.cancel=id=>{if(!cancelled){cancelled=true;originalCancel(id);}};
  const result=await perform(queue,{kind:'move',sources:[file],destination:dst});assert.equal(result.status,'cancelled');assert.equal((await fs.stat(file)).size,8*1024*1024);assert.deepEqual(await fs.readdir(dst),[]);
}));
test('rename rejects collisions and invalid filenames',()=>fixture(async({src})=>{
  const file=path.join(src,'a.txt');await fs.writeFile(file,'a');await fs.writeFile(path.join(src,'b.txt'),'b');
  await assert.rejects(renameItem(file,'b.txt'));await assert.rejects(renameItem(file,'../bad'));
  const renamed=await renameItem(file,'이름 변경.txt');assert.equal(await fs.readFile(renamed,'utf8'),'a');assert.equal(await fs.readFile(path.join(src,'b.txt'),'utf8'),'b');
}));
test('a changed source remains in place on move',()=>fixture(async({src,dst})=>{
  const file=path.join(src,'a.bin');await fs.writeFile(file,Buffer.alloc(3*1024*1024,2));let modified=false;
  const queue=new OperationQueue({trash:async()=>assert.fail('modified source must stay')});
  queue.on('update',jobs=>{if(!modified&&jobs[0].bytes){modified=true;require('node:fs').appendFileSync(file,'changed');}});
  const result=await perform(queue,{kind:'move',sources:[file],destination:dst});assert.equal(result.status,'partial');assert((await fs.stat(file)).size>3*1024*1024);assert.deepEqual(await fs.readdir(dst),[]);
}));
test('trash errors are surfaced and queued jobs run sequentially',()=>fixture(async({src,dst})=>{
  const file=path.join(src,'a.txt');await fs.writeFile(file,'a');let busy=false;
  const queue=new OperationQueue({trash:async()=>{assert(!busy);busy=true;await new Promise(resolve=>setTimeout(resolve,20));busy=false;throw new Error('휴지통 사용할 수 없음');}});
  const [a,b]=await Promise.all([perform(queue,{kind:'trash',sources:[file]}),perform(queue,{kind:'copy',sources:[file],destination:dst})]);assert.equal(a.status,'partial');assert.equal(b.status,'completed');assert.equal(await fs.readFile(file,'utf8'),'a');
}));
