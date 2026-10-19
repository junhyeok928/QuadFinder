const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const {WatchManager}=require('../src/watch-manager.cjs');
function fixture(){
  const timers=new Map(),watchers=[],recovered=[],changes=[];let deny=false,attempts=0;
  const manager=new WatchManager({recursive:true,createWatch:(root,options,change)=>{
    attempts++;if(deny)throw Object.assign(new Error('offline'),{code:'EACCES'});
    const watcher=new EventEmitter();watcher.close=()=>{watcher.closed=true;watcher.emit('close');};watcher.change=change;watcher.root=root;watchers.push(watcher);return watcher;
  },setTimer:(fn,ms)=>{const id={};timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),onRecovered:root=>recovered.push(root),onChange:(root,file)=>changes.push(file)});
  return {manager,timers,watchers,recovered,changes,deny:value=>deny=value,attempts:()=>attempts,tick:()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();return timer.ms;}};
}
test('watch errors retry with bounded backoff and reconcile exactly once after recovery',()=>{
  const f=fixture(),root=path.resolve('watch-fixture');f.manager.setPaths([root]);
  const first=f.watchers[0];first.emit('error',Object.assign(new Error('lost'),{code:'EIO'}));first.emit('close');
  assert.equal(first.closed,true);assert.equal(f.timers.size,1);assert.equal(f.manager.snapshot()[0].code,'EIO');
  f.deny(true);assert.equal(f.tick(),1000);assert.equal(f.tick(),2000);
  for(let i=0;i<8;i++)f.tick();assert.equal([...f.timers.values()][0].ms,60000);
  f.deny(false);f.tick();assert.deepEqual(f.recovered,[root]);assert.deepEqual(f.manager.snapshot(),[]);
  first.change('rename','stale.txt');assert.deepEqual(f.changes,[]);
  f.watchers.at(-1).change('rename','new.txt');assert.deepEqual(f.changes,[path.join(root,'new.txt')]);f.manager.close();assert.equal(f.timers.size,0);
});
test('initial failures retry, healthy roots remain connected and removed roots never return',()=>{
  const f=fixture(),a=path.resolve('watch-a'),b=path.resolve('watch-b');f.manager.setPaths([a]);const healthy=f.watchers[0];
  f.deny(true);f.manager.setPaths([a,b]);assert.equal(healthy.closed,undefined);assert.equal(f.attempts(),2);assert.equal(f.timers.size,1);
  const retry=[...f.timers.values()][0].fn;f.manager.setPaths([a]);assert.equal(f.timers.size,0);f.deny(false);retry();assert.equal(f.attempts(),2);
  f.manager.setPaths([a.toUpperCase()]);assert.equal(f.attempts(),2);f.manager.close();assert.equal(healthy.closed,true);
});
test('unexpected close reconnects and shutdown cancels pending reconnects',()=>{
  const f=fixture();f.manager.setPaths([path.resolve('watch-fixture')]);f.watchers[0].emit('close');assert.equal(f.manager.snapshot()[0].code,'ECLOSED');
  const retry=[...f.timers.values()][0].fn;f.manager.close();retry();assert.equal(f.attempts(),1);assert.equal(f.timers.size,0);
});
