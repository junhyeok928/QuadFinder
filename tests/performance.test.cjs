const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const view=require('../src/view-options.cjs');
function original(source,o,type){const entries=source.filter(e=>o.showHidden||!e.hidden);if(o.sort!=='none')entries.sort((a,b)=>{let r=0;if(o.sort==='name')r=a.name.localeCompare(b.name,'ko',{numeric:true});else if(o.sort==='type')r=type(a).localeCompare(type(b),'ko');else if(['parent','extension'].includes(o.sort))r=String(a[o.sort]||'').localeCompare(String(b[o.sort]||''),'ko');else r=(a[o.sort]||0)-(b[o.sort]||0);return Number(b.directory)-Number(a.directory)||r*(o.desc?-1:1)||a.name.localeCompare(b.name,'ko',{numeric:true});});if(o.group!=='none')entries.sort((a,b)=>view.groupKey(a,o.group).localeCompare(view.groupKey(b,o.group),'ko'));return entries;}
test('optimized sorting preserves every sort/group direction and input order',()=>{
 const entries=Array.from({length:180},(_,i)=>({name:['한글','file','A','가'][i%4]+(179-i)+'.txt',directory:i%9===0,hidden:i%7===0,size:i%13,modified:Date.now()-i*86400000,created:i,accessed:i%4,parent:'폴더'+i%8,extension:i%2?'.txt':'.png'}));
 const before=[...entries],type=e=>e.directory?'폴더':e.extension;
 for(const sort of ['none',...Object.keys(view.fields)])for(const group of ['none','type','modified','size'])for(const desc of [false,true])for(const showHidden of [false,true]){
  const options={sort,group,desc,showHidden};assert.deepEqual(view.sortedEntries(entries,options,type),original(entries,options,type),JSON.stringify(options));
 }
 assert.deepEqual(entries,before);
});
function thumbnails(){
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=source.indexOf('const thumbnails ='),end=source.indexOf('function fileType',start),pending=[];
 const context=vm.createContext({Map,WeakMap,Promise,state:{},fileType:()=> 'image',call:v=>v,api:{thumbnail:()=>new Promise(resolve=>pending.push(resolve))}});vm.runInContext(source.slice(start,end)+';globalThis.decorate=decorateThumbnails;',context);
 const entries=Array.from({length:12},(_,i)=>({path:'image'+i,modified:1})),rows={isConnected:true,querySelectorAll:()=>entries.map((_,i)=>({dataset:{row:String(i)},isConnected:false}))};
 return {pending,rows,entries,decorate:context.decorate};
}
test('detached thumbnail views stop after their active batch',async()=>{
 const f=thumbnails(),run=f.decorate(f.rows,f.entries);assert.equal(f.pending.length,4);f.rows.isConnected=false;f.pending.splice(0).forEach(resolve=>resolve(null));await run;assert.equal(f.pending.length,0);
});
test('thumbnail rerenders share pending requests and cancel superseded batches',async()=>{
 const f=thumbnails(),first=f.decorate(f.rows,f.entries),second=f.decorate(f.rows,f.entries);assert.equal(f.pending.length,4);
 for(let batch=0;batch<3;batch++){assert.equal(f.pending.length,4);f.pending.splice(0).forEach(resolve=>resolve(null));await new Promise(resolve=>setImmediate(resolve));}
 await Promise.all([first,second]);assert.equal(f.pending.length,0);
 await f.decorate(f.rows,f.entries);assert.equal(f.pending.length,0,'cached misses also avoid native requests');
});
module.exports={original};
