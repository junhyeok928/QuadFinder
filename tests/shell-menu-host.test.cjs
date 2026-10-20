const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {ShellMenuHost}=require('../src/shell-menu-host.cjs');
function fixture(){
 const children=[],requests=[];
 const host=new ShellMenuHost({executable:()=>'/helper',launch:()=>{
  const child=new EventEmitter();for(const key of ['stdin','stdout','stderr'])child[key]=new PassThrough();child.ref=()=>{};child.unref=()=>{};
  child.kill=()=>{child.killed=true;setImmediate(()=>child.emit('close',1));};
  child.stdin.on('data',value=>requests.push({child,input:JSON.parse(String(value))}));children.push(child);
  setImmediate(()=>child.stdout.write('{"ready":true}\n'));return child;
 }});
 return {host,children,requests,async next(){await new Promise(resolve=>setImmediate(resolve));return requests.at(-1);},reply(child,value){child.stdout.write(JSON.stringify(value)+'\n');}};
}
test('native menu host reuses its process and serializes requests without caching menus',async()=>{
 const f=fixture();try{
  const first=f.host.request({mode:'probe',paths:['first']}),second=f.host.request({mode:'probe',paths:['second']});
  const a=await f.next();assert.equal(f.requests.length,1);f.reply(a.child,{ok:true,value:{count:3}});assert.deepEqual(await first,{count:3});
  const b=await f.next();assert.equal(f.children.length,1);assert.deepEqual(b.input.paths,['second']);f.reply(b.child,{ok:true,value:{count:4}});assert.deepEqual(await second,{count:4});
 }finally{f.host.close();}
});
test('menu crashes reject the active command without replay and the next request starts a fresh helper',async()=>{
 const f=fixture();try{
  const first=f.host.request({mode:'menu'}),rejected=assert.rejects(first,/종료/);const a=await f.next();a.child.emit('close',1);await rejected;
  assert.equal(f.requests.length,1);
  const second=f.host.request({mode:'probe'}),b=await f.next();assert.equal(f.children.length,2);f.reply(b.child,{ok:true,value:{count:2}});await second;
 }finally{f.host.close();}
});
test('command errors preserve the host while invalid protocol output closes it',async()=>{
 const f=fixture();try{
  const first=f.host.request({mode:'menu'}),rejected=assert.rejects(first,/failed/),a=await f.next();f.reply(a.child,{ok:false,error:'failed'});await rejected;assert.equal(a.child.killed,undefined);
  const second=f.host.request({mode:'probe'}),invalid=assert.rejects(second),b=await f.next();b.child.stdout.write('invalid\n');await invalid;assert.equal(b.child.killed,true);
 }finally{f.host.close();}
});
