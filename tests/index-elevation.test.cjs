const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
for(const cancelled of [false,true])test('index elevation requests approval before flushing and resumes after '+(cancelled?'cancellation':'approval'),async()=>{
 const events=[],messages=[];let receive,scans=0;
 class Store{constructor(){this.entries=new Map();}getMeta(key){return key==='legacyImported';}flush(){events.push('flush');}setMeta(){}close(){}}
 class Engine{constructor({store,roots}){this.entries=store.entries;this.roots=roots;}setRoots(value){this.roots=value;}async scan(roots,{signal}){scans++;if(scans===1)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{code:'ABORT_ERR'})),{once:true}));return {count:0};}}
 class Native{constructor(){events.push('approval');}async request(){if(cancelled)throw Error('cancelled');return {elevated:true};}close(){}}
 const context=vm.createContext({require:name=>({'node:worker_threads':{parentPort:{postMessage:value=>messages.push(value),on:(_,callback)=>{receive=callback;}},workerData:{roots:['C:\\']}},'node:fs/promises':{},'./files.cjs':{},'./index-engine.cjs':{IndexEngine:Engine},'./index-store.cjs':{IndexStore:Store},'./index-paths.cjs':{key:v=>v},'./native-index.cjs':{NativeIndex:Native}}[name]),process:{platform:'win32',on(){}},Map,Set,AbortController,setImmediate});
 vm.runInContext(fs.readFileSync(require.resolve('../src/index-worker.cjs'),'utf8'),context);events.length=0;receive({type:'elevate'});
 assert.equal(events[0],'approval');await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(messages.find(m=>m.type==='elevation-result').ok,!cancelled);assert.equal(scans,2);assert(messages.some(m=>m.type==='status'&&m.elevated===!cancelled&&m.awaitingElevation===false));
});
