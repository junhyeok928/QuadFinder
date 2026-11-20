const {test}=require('node:test'),assert=require('node:assert/strict');
const {FileIcons}=require('../src/file-icons.cjs');
const png='data:image/png;base64,dGVzdA==';
test('associated icons share extensions but executable and shortcut icons keep their identity',async()=>{
 const calls=[],icons=new FileIcons(async file=>{calls.push(file);return png;});
 await Promise.all([icons.get('C:\\one.zip'),icons.get('C:\\two.ZIP')]);assert.equal(calls.length,1);
 await icons.get('C:\\one.hwp');await icons.get('C:\\a.exe');await icons.get('C:\\b.exe');await icons.get('C:\\a.lnk');await icons.get('C:\\b.lnk');assert.equal(calls.length,6);
});
test('icon failures fall back and expire or evicted associations can refresh',async()=>{
 let now=0,calls=0;const icons=new FileIcons(async()=>{calls++;return calls===1?null:png;},{ttl:10,limit:2,now:()=>now});
 assert.equal(await icons.get('a.zip'),null);assert.equal(await icons.get('a.zip'),png);assert.equal(calls,2);
 await icons.get('b.zip');assert.equal(calls,2);now=11;await icons.get('b.zip');assert.equal(calls,3);
 await icons.get('a.hwp');await icons.get('a.txt');assert.equal(icons.cache.size,2);await icons.get('a.zip');assert.equal(calls,6);
 const broken=new FileIcons(async()=>{throw Error('missing');});assert.equal(await broken.get('a.zip'),null);
});
test('native icon work is bounded even with many different files',async()=>{
 let active=0,peak=0;const icons=new FileIcons(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return png;});
 const result=await Promise.all(Array.from({length:30},(_,i)=>icons.get('C:\\app-'+i+'.exe')));assert.equal(result.length,30);assert.equal(peak,4);
});
test('late system icons never overwrite a refreshed row or an image thumbnail',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
 let resolve,painted=0,thumbnail=false;const pending=new Promise(r=>resolve=r);
 const holder={classList:{contains:()=>thumbnail,add(){}},replaceChildren(){painted++;}},row={dataset:{row:'0'},isConnected:true,querySelector:()=>holder};
 const rows={isConnected:true,querySelectorAll:()=>[row]},entry={name:'a.zip',path:'C:\\a.zip'};
 const context=vm.createContext({api:{fileIcon:()=>pending},call:v=>v,document:{createElement:()=>({})}});
 vm.runInContext(source.slice(source.indexOf('const systemIconCache'),source.indexOf('const thumbnails')),context);
 context.decorateSystemIcons(rows,[entry]);context.clearSystemIcons(rows);resolve(png);await new Promise(r=>setImmediate(r));assert.equal(painted,0);
 thumbnail=true;context.decorateSystemIcons(rows,[entry]);await new Promise(r=>setImmediate(r));assert.equal(painted,0);
 thumbnail=false;context.decorateSystemIcons(rows,[entry]);await new Promise(r=>setImmediate(r));assert.equal(painted,1);
});
