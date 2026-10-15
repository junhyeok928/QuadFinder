const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalize}=require('../src/navigation-state.cjs');
test('navigation settings migrate cleanly and deduplicate paths without losing collapse preferences',()=>{
  assert.deepEqual(normalize(null).collapsed,{favorites:false,pc:false});
  const nav=normalize({collapsed:{favorites:true,pc:'true'},favorites:['C:\\Docs','c:/docs/',123,'\\\\NAS\\Share'],expanded:['C:\\Docs'],labels:{'C:\\Docs':'  문서 모음  '}});
  assert.equal(nav.favorites.length,2);assert.equal(nav.favorites[1],'\\\\NAS\\Share');assert.deepEqual(nav.collapsed,{favorites:true,pc:false});assert.equal(nav.labels['c:\\docs'],'문서 모음');
});
test('navigation settings bound expanded branches, aliases and favorites',()=>{
  const paths=Array.from({length:700},(_,i)=>`C:\\Folder${i}`),nav=normalize({expanded:paths,favorites:paths,order:paths,labels:{'C:\\Docs':'x'.repeat(1000)}});
  assert.equal(nav.expanded.length,64);assert.equal(nav.favorites.length,256);assert.equal(nav.order.length,512);assert.equal(nav.labels['c:\\docs'].length,80);
});
