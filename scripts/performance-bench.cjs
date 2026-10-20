const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const view=require('../src/view-options.cjs');
const entries=Array.from({length:20000},(_,i)=>({name:['한글 파일','Report','자료','image'][i%4]+((i*7919)%20000)+'.txt',directory:i%11===0,hidden:i%19===0}));
function before(){return entries.filter(e=>!e.hidden).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,'ko',{numeric:true}));}
function after(){return view.sortedEntries(entries,{sort:'name',desc:false,group:'none',showHidden:false},()=> '파일');}
assert.deepEqual(after(),before());
function measure(action){const samples=[];for(let i=0;i<3;i++){const start=performance.now();action();samples.push(performance.now()-start);}return Math.round(samples.sort((a,b)=>a-b)[1]*100)/100;}
const oldMs=measure(before),newMs=measure(after),result={scenario:'20000 mixed Korean/numeric names, median of 3 sorts',beforeMs:oldMs,afterMs:newMs,speedup:Math.round(oldMs/newMs*10)/10,identicalOrder:true};
fs.mkdirSync(path.resolve('output'),{recursive:true});fs.writeFileSync(path.resolve('output/performance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
