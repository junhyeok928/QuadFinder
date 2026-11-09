// Read-only benchmark; never opens IndexStore's writable migration path.
const {DatabaseSync}=require('node:sqlite');
const {IndexStore}=require('../src/index-store.cjs');
const {NameSearch,indexedQuery}=require('../src/name-search.cjs');
const {compileMatcher}=require('../src/files.cjs');
async function run(){
  const file=process.argv[2];if(!file)throw Error('Pass an existing index.sqlite path');
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    db.exec('PRAGMA cache_size=-8192');
    const disk=Object.create(IndexStore.prototype);disk.db=db;
    const names=new NameSearch(db),start=performance.now();await names.prepare();
    const report={names:names.names.size,warmupMs:Math.round(performance.now()-start),heapMB:Math.round(process.memoryUsage().heapUsed/1048576),results:[]};
    for(const query of ['보고','없는검색어xyz','프로젝트','a','없는']){
      const samples=[];let count;
      for(let i=0;i<3;i++){
        const match=compileMatcher(query),begin=performance.now();count=0;
        for(const entry of (indexedQuery(query)?disk.candidates(query):names.candidates(query))){if(entry&&match(entry)&&++count===1001)break;}
        samples.push(Math.round((performance.now()-begin)*100)/100);
      }
      report.results.push({query,samplesMs:samples,count});
    }
    console.log(JSON.stringify(report,null,2));
  }finally{db.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
