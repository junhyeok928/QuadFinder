const {IndexStore}=require('../src/index-store.cjs');
const {compileMatcher}=require('../src/files.cjs');
const {performance}=require('node:perf_hooks');
const store=new IndexStore();
try{
 for(let i=0;i<20000;i++){const name=`프로젝트-${String(i).padStart(6,'0')}-보고서.txt`,path=`C:\\fixture\\${name}`;store.entries.set(path.toLowerCase(),{name,path,directory:false,size:i,modified:1});}store.flush();
 const output=[];
 for(const query of ['019999','없는파일','프로젝트']){
  const matcher=compileMatcher(query);
  function measure(fn){const samples=[];let count;for(let i=0;i<5;i++){const start=performance.now();count=fn();samples.push(performance.now()-start);}return {medianMs:+samples.sort((a,b)=>a-b)[2].toFixed(2),count};}
  const before=measure(()=>store.db.prepare('SELECT record FROM entries WHERE instr(search,?)>0').all(query).filter(row=>matcher(JSON.parse(row.record))).length);
  const after=measure(()=>{let count=0;for(const entry of store.candidates(query))if(matcher(entry)&&++count===1001)break;return count;});
  output.push({query,before,after});
 }
 console.log(JSON.stringify({records:20000,scope:'In-memory lookup only; baseline counts all matches, optimized stops after 1001. Excludes startup, disk attributes and UI.',results:output},null,2));
}finally{store.close();}
