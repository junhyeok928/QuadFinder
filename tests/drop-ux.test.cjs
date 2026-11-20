const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/features.js'),'utf8');
test('an asynchronous external drop preserves its original folder and operation after navigation',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),calls=[];
 const tab={path:'C:\\before',search:false},row={dataset:{row:'0'}},table={setAttribute(){},addEventListener(){},contains:r=>r===row};
 const pane={visibleEntries:[{directory:true,path:'C:\\before\\target'}],element:{querySelector:()=>table,querySelectorAll:()=>[]}};
 const context=vm.createContext({state:{panes:[pane]},tabOf:()=>tab,bindMarquee(){},updateSelection(){},clearFileDropTarget(){},draggedPaths:null,api:{dropPaths:()=>pending},transfer:async(...args)=>calls.push(args),Array,toast(){}});
 vm.runInContext(source.slice(source.indexOf('function bindPaneFeatures('),source.indexOf('function showFileMenu(')),context);
 context.bindPaneFeatures(0);
 const event={preventDefault(){},target:{closest:()=>row},ctrlKey:true,dataTransfer:{files:[{}]}};
 const dropping=table.ondrop(event);tab.path='C:\\after';pane.visibleEntries=[{directory:true,path:'C:\\after\\wrong'}];event.ctrlKey=false;resolve(['C:\\source.txt']);await dropping;
 assert.equal(calls[0][0],'copy');assert.equal(calls[0][2],'C:\\before\\target');assert.equal(calls[0][3].drop,true);
});
test('failed file operations remain visible while successful operations can auto-hide',()=>{
 const panel={hidden:false},timers=[];
 const context=vm.createContext({$ :()=>panel,jobsHideTimer:null,jobsManuallyOpened:false,currentJobs:[{status:'partial',errors:[{message:'denied'}]}],activeJob:j=>j.status==='running',clearTimeout(){},setTimeout:callback=>timers.push(callback)});
 vm.runInContext(source.slice(source.indexOf('function scheduleJobsHide()'),source.indexOf('let currentJobs=')),context);
 context.scheduleJobsHide();assert.equal(timers.length,0);assert.equal(panel.hidden,false);
 context.currentJobs=[{status:'completed',errors:[]}];context.scheduleJobsHide();assert.equal(timers.length,1);timers[0]();assert.equal(panel.hidden,true);
});
