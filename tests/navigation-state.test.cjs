const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalize,visit}=require('../src/navigation-state.cjs');
test('navigation settings migrate cleanly and deduplicate paths without losing collapse preferences',()=>{
  assert.deepEqual(normalize(null).collapsed,{favorites:false,pc:false,recent:false});
  const nav=normalize({collapsed:{favorites:true,pc:'true'},favorites:['C:\\Docs','c:/docs/',123,'\\\\NAS\\Share'],expanded:['C:\\Docs'],labels:{'C:\\Docs':'  문서 모음  '}});
  assert.equal(nav.favorites.length,2);assert.equal(nav.favorites[1],'\\\\NAS\\Share');assert.deepEqual(nav.collapsed,{favorites:true,pc:false,recent:false});assert.equal(nav.labels['c:\\docs'],'문서 모음');
});
test('recent folders keep ten latest visits, promote duplicates and preserve other settings',()=>{
  let nav=normalize({favorites:['C:\\Pinned'],collapsed:{recent:true}});
  for(let i=0;i<15;i++)nav=visit(nav,`C:\\Folder${i}`);
  assert.equal(nav.recent.length,10);assert.equal(nav.recent[0],'C:\\Folder14');assert.equal(nav.recent.at(-1),'C:\\Folder5');
  nav=visit(nav,'c:/folder8/');assert.equal(nav.recent[0],'c:/folder8/');assert.equal(nav.recent.length,10);assert.equal(nav.recent.filter(path=>/folder8/i.test(path)).length,1);assert.equal(nav.favorites[0],'C:\\Pinned');assert(nav.collapsed.recent);
  const snapshot=JSON.stringify(nav);assert.equal(JSON.stringify(visit(nav,'')),snapshot);assert.equal(JSON.stringify(visit(nav,'bad\npath')),snapshot);
  assert.deepEqual(normalize({recent:[null,1,'C:\\Valid','c:/valid/','bad\npath']}).recent,['c:/valid/']);
});
test('navigation settings bound expanded branches, aliases and favorites',()=>{
  const paths=Array.from({length:700},(_,i)=>`C:\\Folder${i}`),nav=normalize({expanded:paths,favorites:paths,order:paths,labels:{'C:\\Docs':'x'.repeat(1000)}});
  assert.equal(nav.expanded.length,64);assert.equal(nav.favorites.length,256);assert.equal(nav.order.length,512);assert.equal(nav.labels['c:\\docs'].length,80);
});
