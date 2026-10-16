const {test}=require('node:test'),assert=require('node:assert/strict');
const {physical,restore,normalize}=require('../src/zoom-policy.cjs');
test('new 100 percent renders at the previous 90 percent and migrates saved scales once',()=>{
  assert.equal(physical(1),.9);assert.equal(physical(1.1),.99);assert.equal(restore(null),1);assert.equal(restore({zoomFactor:.9}),1);assert.equal(restore({zoomFactor:1}),1);
  assert.equal(restore({zoomFactor:.8}),.89);assert.equal(restore({zoomFactor:.89,zoomVersion:2}),.89);assert.equal(normalize(9),1.5);
});
