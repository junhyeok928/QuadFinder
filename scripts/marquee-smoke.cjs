const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
async function run({window,root}){
  const folder=path.join(root,'marquee');await fs.mkdir(folder,{recursive:true});
  await Promise.all(Array.from({length:60},(_,i)=>fs.writeFile(path.join(folder,`item-${String(i).padStart(2,'0')}.txt`),'test')));
  const evaluate=code=>window.webContents.executeJavaScript(code),pause=()=>new Promise(resolve=>setTimeout(resolve,100));
  await evaluate(`applyLayout(1);navigate(0,${JSON.stringify(folder)})`);
  const drag=async(modifiers=[],cancel=false)=>{
    const points=await evaluate(`(()=>{const t=state.panes[0].element.querySelector('.file-table');t.scrollTop=0;const r=t.getBoundingClientRect(),rows=[...t.querySelectorAll('.file-row')],first=rows[0].getBoundingClientRect(),third=rows[2].getBoundingClientRect();return {x:Math.round(r.right-25),y:Math.round(first.top+3),endX:Math.round(r.left+20),endY:Math.round(third.bottom-3)};})()`);
    window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:points.x,y:points.y,modifiers});
    window.webContents.sendInputEvent({type:'mouseMove',x:points.endX,y:points.endY,modifiers:['leftButtonDown',...modifiers]});await pause();
    if(cancel)window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:points.endX,y:points.endY,modifiers});await pause();
  };
  window.show();window.focus();await pause();
  for(const view of ['details','list','icons']){
    await evaluate(`setView(0,{view:${JSON.stringify(view)}});`);await drag();
    assert.ok(await evaluate('selection(tabOf(state.panes[0])).size>=3'),view+' drag selection');
    assert.equal(await evaluate('document.querySelectorAll(".selection-marquee").length'),0);
  }
  await evaluate(`setView(0,{view:'details'});const t=tabOf(state.panes[0]);t.selection=new Set();updateSelection(0);`);
  await drag();assert.equal(await evaluate('selection(tabOf(state.panes[0])).size'),3);
  await drag(['control']);assert.equal(await evaluate('selection(tabOf(state.panes[0])).size'),0);
  await drag([],true);assert.equal(await evaluate('selection(tabOf(state.panes[0])).size'),0);
  await evaluate(`(()=>{const t=tabOf(state.panes[0]);t.selection=new Set([t.entries[59].path]);updateSelection(0);})()`);
  await drag(['shift']);assert.equal(await evaluate('selection(tabOf(state.panes[0])).size'),4);
  const edge=await evaluate(`(()=>{const t=state.panes[0].element.querySelector('.file-table');t.scrollTop=0;const r=t.getBoundingClientRect(),first=t.querySelector('.file-row').getBoundingClientRect();return {x:Math.round(r.right-25),y:Math.round(first.top+3),bottom:Math.round(r.bottom-3)};})()`);
  window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:edge.x,y:edge.y});
  window.webContents.sendInputEvent({type:'mouseMove',x:edge.x-30,y:edge.bottom,modifiers:['leftButtonDown']});await new Promise(resolve=>setTimeout(resolve,450));
  assert.ok(await evaluate('state.panes[0].element.querySelector(".file-table").scrollTop>0'),'drag auto scroll');
  window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:edge.x-30,y:edge.bottom});await pause();
  return {passed:true,shiftAdd:true,autoScroll:true,views:['details','list','icons'],ctrlToggle:true,escapeRestores:true};
}
module.exports={run};
