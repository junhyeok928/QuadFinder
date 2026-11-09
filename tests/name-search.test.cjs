const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IndexStore}=require('../src/index-store.cjs');
const {compileMatcher}=require('../src/files.cjs');
const {key}=require('../src/index-paths.cjs');
const path=require('node:path');

function item(name,directory=false){return {name,path:path.resolve('name-fixture',name),directory,size:4096,modified:Date.now(),hidden:name.startsWith('.'),readOnly:true};}
test('memory name search matches every query form, including one/two characters and Unicode',async()=>{
  const store=new IndexStore();try{
    for(const name of ['보고서.txt','가.txt','가나.txt','가나다.txt','café 보고서.pdf','emoji😀한글.txt','abc.def.txt','abc[x].txt','.hidden.txt']){const e=item(name);store.entries.set(key(e.path),e);}
    const folder=item('가나.txt 폴더',true);store.entries.set(key(folder.path),folder);
    await store.nameSearch.prepare();
    for(const query of ['가','가나','보고','😀','cafe\u0301','"café 보고서"','가*','abc[?].txt','*.txt','ext:pdf;txt','path:name-fixture','size:>1kb','보고 ext:txt','없는이름'])for(const filter of ['all','documents','images','recent']){
      const match=compileMatcher(query,filter);
      const expected=[...store.values()].filter(match).map(e=>e.path).sort();
      const actual=[...store.nameSearch.candidates(query,filter)].filter(e=>e&&match(e)).map(e=>e.path).sort();
      assert.deepEqual(actual,expected,query+' '+filter);
    }
    const e=item('보고서.txt');store.entries.set(key(e.path),{...e,name:'변경.txt'});
    assert.equal([...store.nameSearch.candidates('보고')].filter(Boolean).length,1);
    assert.equal([...store.nameSearch.candidates('변경')].filter(Boolean).length,1);
    store.entries.delete(key(e.path));assert.equal([...store.nameSearch.candidates('변경')].filter(Boolean).length,0);
    const added=item('새파일.txt');store.entries.set(key(added.path),added);assert.equal([...store.nameSearch.candidates('새')].filter(Boolean)[0].readOnly,true);
  }finally{store.close();}
});
test('memory preparation cooperates with updates and no-match scans expose cancellation checkpoints',async()=>{
  const store=new IndexStore();try{
    for(let i=0;i<9000;i++){const e=item('name-'+i);store.entries.set(key(e.path),e);}
    let once=false;
    await store.nameSearch.prepare(()=>{if(once)return;once=true;store.entries.delete(key(item('name-0').path));const e=item('name-8000');store.entries.set(key(e.path),{...e,name:'새이름'});});
    assert.equal([...store.nameSearch.candidates('새이름')].filter(Boolean).length,1);
    const misses=[...store.nameSearch.candidates('absent')];assert(misses.length>=4);assert(misses.every(e=>e===null));
    assert.equal(store.nameSearch.names.size,8999);
  }finally{store.close();}
});

test('an obsolete no-match search yields and is cancelled by newer input',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/index-worker.cjs'),'utf8');
  const messages=[];let clock=0;
  const cache={prepare:async()=>{},*candidates(query){if(query==='new'){yield item('new');return;}for(let i=0;i<100;i++)yield null;}};
  const context=vm.createContext({store:{nameSearch:cache},indexedQuery:()=>false,compileMatcher,engine:{allowed:()=>true},send:m=>messages.push(m),Date:{now:()=>clock+=9},setImmediate,Promise});
  vm.runInContext('let searchGeneration=0,indexing=false;'+source.slice(source.indexOf('async function search('),source.indexOf("parentPort.on('message'")),context);
  const first=context.search({id:1,query:'old'});await Promise.resolve();
  const second=context.search({id:2,query:'new'});await Promise.all([first,second]);
  assert.equal(messages.find(m=>m.id===1).cancelled,true);assert.equal(messages.find(m=>m.id===2).entries[0].name,'new');
});

test('async root reconciliation uses compact paths and preserves only allowed records',async()=>{
  const {IndexEngine}=require('../src/index-engine.cjs');const store=new IndexStore();try{
    const a=item('a.txt'),b={...item('b.txt'),path:path.resolve('elsewhere','b.txt')};
    store.entries.set(key(a.path),a);store.entries.set(key(b.path),b);
    store.entries.values=()=>{throw Error('full records must not be decoded for root reconciliation');};
    const engine=new IndexEngine({roots:[path.dirname(a.path)],store});await engine.setRootsAsync([path.dirname(a.path)]);
    assert.equal(store.entries.size,1);assert(store.entries.has(key(a.path)));
  }finally{store.close();}
});
