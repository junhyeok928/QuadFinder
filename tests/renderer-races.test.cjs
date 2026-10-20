const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
test('late search failures cannot replace a folder opened in the meantime',async()=>{
 const pending=deferred(),tab={request:0,entries:[]},pane={tab},state={request:0,panes:[pane]},renders=[];
 const context=vm.createContext({state,$:()=>({value:'query'}),tabOf:p=>p.tab,api:{search:()=>pending.promise},call:v=>v,setActive(){},renderPane:i=>renders.push(i),syncSidebar(){}});
 vm.runInContext(renderer.slice(renderer.indexOf('async function runSearch()'),renderer.indexOf('function renderIndexDiagnostics')),context);
 const running=context.runSearch();tab.search=false;tab.loading=false;tab.path='C:\\new-folder';tab.entries=['folder contents'];pending.reject(new Error('old search failed'));await running;
 assert.equal(tab.error,null);assert.equal(tab.loading,false);assert.deepEqual(tab.entries,['folder contents']);assert.equal(renders.length,1);
});
test('search result navigation never selects a file in a newly activated tab',async()=>{
 const pending=deferred(),search={search:true},destination={request:0,path:'C:\\old'},replacement={request:0,path:'C:\\other'},panes=[{tab:search},{tab:destination}],state={layout:2,panes};let rendered=false;
 const context=vm.createContext({state,Set,tabOf:p=>p.tab,folderKey:p=>p.toLowerCase(),navigate:()=>{destination.request++;return pending.promise;},renderRows:()=>{rendered=true;},setActive(){}});
 vm.runInContext(renderer.slice(renderer.indexOf('async function openEntry('),renderer.indexOf('async function runSearch()')),context);
 const running=context.openEntry(0,{path:'C:\\target\\file.txt',parent:'C:\\target',directory:false});panes[1].tab=replacement;destination.path='C:\\target';pending.resolve();await running;
 assert.equal(replacement.selected,undefined);assert.equal(rendered,false);
});
test('rapid preview selection reads only the final file and notices changed sizes',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/view-ui.js'),'utf8'),target={dataset:{},isConnected:true},pane={element:{querySelector:()=>target}},tab={},calls=[];
 let entry={path:'C:\\one.txt',modified:1,size:1};
 const context=vm.createContext({setTimeout,Promise,JSON,state:{panes:[pane]},tabOf:()=>tab,viewOf:()=>({inspector:'preview'}),selectedEntries:()=>[entry],api:{preview:async path=>{calls.push(path);return {kind:'unsupported',message:path};}},call:v=>v});
 vm.runInContext(source.slice(source.indexOf('async function updateInspector(')),context);
 const first=context.updateInspector(0);entry={path:'C:\\two.txt',modified:1,size:1};const second=context.updateInspector(0);entry={path:'C:\\one.txt',modified:1,size:1};const third=context.updateInspector(0);await Promise.all([first,second,third]);assert.deepEqual(calls,['C:\\one.txt']);
 entry={...entry,size:2};await context.updateInspector(0);assert.equal(calls.length,2,'size changes refresh even if mtime is unchanged');
 target.isConnected=false;entry={path:'C:\\three.txt'};await context.updateInspector(0);assert.equal(calls.length,2,'closed inspectors never start pending reads');
});
