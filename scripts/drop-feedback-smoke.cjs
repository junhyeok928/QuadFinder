const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run({window,root}){
  const evaluate=code=>window.webContents.executeJavaScript(code);
  const saved=await evaluate('({path:tabOf(state.panes[0]).path,view:tabOf(state.panes[0]).view})');
  try{
    await evaluate('navigate(0,'+JSON.stringify(root)+')');
    for(const view of ['details','icons']){
      const result=await evaluate(`(()=>{setView(0,{view:${JSON.stringify(view)}});draggedPaths=null;const pane=state.panes[0],table=pane.element.querySelector('.file-table'),rows=[...table.querySelectorAll('.file-row')].filter(r=>pane.visibleEntries[Number(r.dataset.row)].directory),data=new DataTransfer();data.setData('application/x-quadfinder','[]');const over=target=>target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data,clientX:450,clientY:240}));over(rows[0].querySelector('.entry-label'));const moveHint=document.querySelector('#file-drop-hint')?.textContent.includes('에 이동');rows[0].dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data,ctrlKey:true}));const copyHint=document.querySelector('#file-drop-hint')?.textContent.includes('에 복사');const first=rows[0].classList.contains('drop-folder')&&!pane.element.classList.contains('drop-target');over(rows[1]);const switched=!rows[0].classList.contains('drop-folder')&&rows[1].classList.contains('drop-folder');over(table);const background=!rows[1].classList.contains('drop-folder')&&pane.element.classList.contains('drop-target');over(rows[0]);rows[0].dispatchEvent(new DragEvent('dragleave',{bubbles:true,relatedTarget:rows[0].querySelector('.entry-label')}));const nested=rows[0].classList.contains('drop-folder');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const cancelled=!document.querySelector('.drop-folder,.pane.drop-target');over(rows[0]);table.dispatchEvent(new DragEvent('dragleave',{bubbles:true,relatedTarget:null}));const left=!document.querySelector('.drop-folder,.pane.drop-target');over(rows[0]);rows[0].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));const dropped=!document.querySelector('.drop-folder,.pane.drop-target');over(rows[0]);return {moveHint,copyHint,first,switched,background,nested,cancelled,left,dropped,width:getComputedStyle(rows[0]).outlineWidth};})()`);
      assert(Object.entries(result).every(([key,value])=>key==='width'?parseFloat(value)>0:value),JSON.stringify(result));
      await fs.writeFile(path.resolve('output','drop-feedback-'+view+'.png'),(await window.webContents.capturePage()).toPNG());
    }
    return {passed:true,folderHighlight:true,background:true,cleanup:true,views:['details','icons']};
  }finally{await evaluate('clearFileDropTarget();setView(0,{view:'+JSON.stringify(saved.view)+'});navigate(0,'+JSON.stringify(saved.path)+')');}
}
module.exports={run};
