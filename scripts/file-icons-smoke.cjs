const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run({window,root,app}){
 const folder=path.join(root,'연결 프로그램 아이콘');await fs.mkdir(folder);
 const names=['압축파일.zip','문서.hwp','텍스트.txt','미등록.quadfinderunknown'];for(const name of names)await fs.writeFile(path.join(folder,name),'icon fixture');
 const evaluate=code=>window.webContents.executeJavaScript(code),saved=await evaluate('({path:tabOf(state.panes[0]).path,view:tabOf(state.panes[0]).view})');
 try{
  for(const name of names){const file=path.join(folder,name),expected=await app.getFileIcon(file,{size:'normal'}),actual=await evaluate('quadfind.fileIcon('+JSON.stringify(file)+')');assert(actual.ok);assert.equal(actual.value,expected.isEmpty()?null:expected.toDataURL());}
  await evaluate('navigate(0,'+JSON.stringify(folder)+')');
  for(const view of ['details','medium']){
   await evaluate('setView(0,{view:'+JSON.stringify(view)+'})');
   let ready=false;for(let i=0;i<100;i++){ready=await evaluate('state.panes[0].element.querySelectorAll(".file-icon.system-icon img").length===4');if(ready)break;await new Promise(r=>setTimeout(r,50));}assert(ready,'Associated icons must appear in '+view);
   await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await fs.writeFile(path.resolve('output','file-icons-'+view+'.png'),(await window.webContents.capturePage()).toPNG());
  }
  return {passed:true,nativeAssociations:true,zip:true,hwp:true,unknownFallback:true,views:['details','medium']};
 }finally{await evaluate('setView(0,{view:'+JSON.stringify(saved.view)+'});navigate(0,'+JSON.stringify(saved.path)+')');}
}
module.exports={run};
