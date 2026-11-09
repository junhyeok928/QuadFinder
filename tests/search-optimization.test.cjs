const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IndexStore}=require('../src/index-store.cjs');
const {matches}=require('../src/files.cjs');
const {key}=require('../src/index-paths.cjs');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
function entry(name){return {name,path:path.resolve('fixture',name),directory:false,size:4096,modified:Date.now(),extension:'.txt'};}
test('FTS candidates preserve substring, Unicode, quoted, wildcard and filter search semantics after updates',()=>{
 const store=new IndexStore();try{
  const names=['프로젝트 계획.txt','프로젝트 가.txt','다른 보고서.txt','café 보고서.txt','emoji😀보고서.txt','abc-def.txt','abcXYZdef.txt','abcdef.txt','가.txt'];
  for(const name of names){const item=entry(name);store.entries.set(key(item.path),item);}store.flush();
  for(const query of ['프로젝트','프로젝트 가','"프로젝트 계획"','*보고서*','cafe\u0301','😀보고','abc*def.txt','가','ext:txt','size:>1kb','path:fixture','없는파일']){
   const expected=[...store.values()].filter(e=>matches(e,query)).map(e=>e.path);
   const actual=[...store.candidates(query)].filter(e=>matches(e,query)).map(e=>e.path);
   assert.deepEqual(actual.sort(),expected.sort(),query);
  }
  const item=entry('프로젝트 계획.txt');store.entries.set(key(item.path),{...item,name:'수정된문서.txt'});
  assert.equal([...store.candidates('프로젝트 계획')].filter(e=>matches(e,'프로젝트 계획')).length,0);
  assert.equal([...store.candidates('수정된문서')].length,1);
  store.entries.delete(key(item.path));assert.equal([...store.candidates('수정된문서')].length,0);
 }finally{store.close();}
});
test('old SQLite indexes migrate once including names without normalized search text',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quadfinder-search-')),file=path.join(dir,'index.sqlite');let store;
 try{
  const db=new DatabaseSync(file);db.exec('CREATE TABLE entries(id TEXT PRIMARY KEY,parent TEXT NOT NULL,record TEXT NOT NULL,search TEXT) WITHOUT ROWID');
  const item=entry('Cafe\u0301 프로젝트.txt');db.prepare('INSERT INTO entries VALUES(?,?,?,NULL)').run(key(item.path),key(path.dirname(item.path)),JSON.stringify(item));db.close();
  store=new IndexStore(file);assert.equal([...store.candidates('café')].length,1);store.close();store=new IndexStore(file);assert.equal([...store.candidates('프로젝트')].length,1);
 }finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
