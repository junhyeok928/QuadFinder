const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {IndexStore}=require('../src/index-store.cjs');
const {IndexEngine}=require('../src/index-engine.cjs');
const {key}=require('../src/index-paths.cjs');

test('SQLite index persists more than 250000 records without a memory Map or JSON snapshot',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quadfinder-store-')),file=path.join(root,'index.sqlite'),scope=path.join(root,'files');let store;
  try{
    store=new IndexStore(file);const engine=new IndexEngine({roots:[scope],store});
    function* records(){for(let i=0;i<250010;i++)yield {name:`file-${i}.txt`,path:path.join(scope,`file-${i}.txt`),directory:false,size:i,modified:1};}
    engine.restore(records());store.flush();assert.equal(engine.entries.size,250010);assert.equal(engine.limited,false);assert.equal(engine.entries instanceof Map,false);
    store.close();store=new IndexStore(file);assert.equal(store.entries.size,250010);assert.equal(store.entries.get(key(path.join(scope,'file-250009.txt'))).size,250009);
    assert.equal([...store.candidates('"file-250009" *.txt')].length,1);assert.equal([...store.candidates('없는파일')].length,0);
    const restored=new IndexEngine({roots:[scope],store});restored.remove(path.join(scope,'file-4.txt'));store.flush();assert.equal(store.entries.size,250009);
  }finally{store?.close();assert(path.basename(root).startsWith('quadfinder-store-'));await fs.rm(root,{recursive:true,force:true});}
});

test('SQLite parent reconciliation preserves inaccessible descendants and removes only proven deletions',async()=>{
  const root=path.resolve('store-fixture'),folder={name:'folder',path:path.join(root,'folder'),directory:true,size:0,modified:1},file={name:'file.txt',path:path.join(root,'folder','file.txt'),directory:false,size:1,modified:1};
  const store=new IndexStore();try{
    const engine=new IndexEngine({roots:[root],store,read:async value=>{if(value!==root)throw Object.assign(new Error('denied'),{code:'EACCES'});return {entries:[folder]};}});
    engine.restore([folder,file]);const status=await engine.scan([root],{full:true});assert.equal(status.issues.denied,1);assert.equal(store.entries.size,2);
    engine.read=async()=>({entries:[]});await engine.scan([root],{full:true});assert.equal(store.entries.size,0);
  }finally{store.close();}
});
