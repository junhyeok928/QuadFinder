const assert=require('node:assert/strict');
async function run({window}){
  const result=await window.webContents.executeJavaScript(`(()=>{
    const original=state.indexStatus||state.boot.indexStatus;
    try{
      updateIndex({indexing:true,count:250010,scanned:90,issues:{denied:2,timedOut:1,missing:1,other:0},problemCount:4,problems:[{code:'EACCES',path:'C:\\\\protected <img src=x>'},{code:'ETIMEDOUT',path:'C:\\\\slow'}]});
      document.querySelector('#index-status').click();
      const dialog=document.querySelector('#index-dialog'),text=dialog.textContent;
      const diagnostics=dialog.open&&text.includes('250,010')&&text.includes('권한 부족 2개')&&text.includes('시간 초과 1개')&&text.includes('경로 사라짐 1개');
      const escaped=!dialog.querySelector('img')&&text.includes('<img src=x>');
      updateIndex({indexing:true,count:250010,issues:{},problems:[],elevated:true});
      const elevated=document.querySelector('#elevate-index').disabled&&document.querySelector('#index-summary').textContent.includes('관리자 도우미');
      document.querySelector('#close-index').click();
      return {passed:diagnostics&&escaped&&elevated,diagnostics,escaped,elevated,closed:!dialog.open};
    }finally{if(document.querySelector('#index-dialog').open)document.querySelector('#index-dialog').close();updateIndex(original);}
  })()`);
  assert(result.passed&&result.closed,JSON.stringify(result));return result;
}
module.exports={run};
