const {test}=require('node:test');
const assert=require('node:assert/strict');
const view=require('../src/view-options.cjs');
test('view settings normalize old versions, unknown columns and unsafe widths',()=>{
  const options=view.normalize({view:'bad',columns:[{id:'size',width:90000},{id:'size',width:-1},{id:'bad'},{id:'parent',width:Infinity}],group:'bad'});
  assert.equal(options.view,'details');assert.equal(options.group,'none');assert.deepEqual(options.columns.map(c=>c.id),['name','size','parent']);assert.equal(options.columns[1].width,65);assert.equal(options.columns[2].width,800);
  assert.equal(view.normalize({showHidden:'true'}).showHidden,false);assert.equal(Object.keys(view.modes).length,8);
});
test('extension visibility changes only the label; grouping handles folders and date boundaries',()=>{
  const entry={name:'report.final.pdf',directory:false,size:1024,modified:new Date(2026,9,15,12).getTime()};
  assert.equal(view.displayName(entry,{showExtensions:false}),'report.final');assert.equal(entry.name,'report.final.pdf');
  assert.equal(view.displayName({name:'.gitignore'},{showExtensions:false}),'.gitignore');assert.equal(view.displayName({name:'folder.name',directory:true},{showExtensions:false}),'folder.name');
  assert.equal(view.groupKey(entry,'modified',new Date(2026,9,15,20).getTime()),'오늘');assert.equal(view.groupKey(entry,'size'),'작음 (1 MB 미만)');assert.equal(view.groupKey({...entry,directory:true},'size'),'폴더');
});
