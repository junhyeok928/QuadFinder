const {test}=require('node:test');const assert=require('node:assert/strict');
const {key,affects,sameEntries}=require('../src/change-policy.cjs');
test('change notifications target direct entries and removed ancestors, not unrelated panes',()=>{
  assert(affects('C:\\Docs',['C:\\Docs\\file.txt']));assert(affects('C:\\Docs\\Sub',['C:\\Docs']));
  assert(!affects('C:\\Other',['C:\\Docs\\file.txt']));assert(!affects('C:\\Docs',['C:\\DocsMore\\file.txt']));assert(!affects('C:\\Docs',[]));assert(affects('C:\\Docs',null));
  assert.equal(key('\\\\NAS\\Share\\'),'\\\\nas\\share');assert(affects('\\\\NAS\\Share\\',['\\\\nas\\share\\a.txt']));assert(affects('C:\\',['C:\\a.txt']));
});
test('unchanged snapshots skip rendering; access-time reads do not cause repaint loops',()=>{
  const entry={path:'C:\\a.txt',name:'a.txt',size:1,modified:3,created:2,accessed:4,hidden:false};
  assert(sameEntries([entry],[{...entry,accessed:9}]));assert(!sameEntries([entry],[{...entry,accessed:9}],true));
  for(const patch of [{size:2},{modified:5},{hidden:true},{name:'b.txt'},{readOnly:true}])assert(!sameEntries([entry],[{...entry,...patch}]));
  assert(!sameEntries([entry],[]));assert(sameEntries([entry,{...entry,path:'C:\\b.txt'}],[{...entry,path:'C:\\b.txt'},entry]));
});
test('index scope includes drive and UNC share roots',()=>{
  const {within,indexable}=require('../src/index-paths.cjs');
  assert(within('C:\\Docs\\a.txt','C:\\'));assert(within('\\\\NAS\\share\\a.txt','\\\\NAS\\share\\'));
  assert(indexable('\\\\NAS\\share\\a.txt',['\\\\NAS\\share']));assert(!within('\\\\NAS\\share2\\a.txt','\\\\NAS\\share'));
});
