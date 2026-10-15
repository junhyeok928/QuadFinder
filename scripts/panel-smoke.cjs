const assert=require('node:assert/strict'),fs=require('node:fs/promises');
async function run({window,stateFile,saveComplete}){
 const evaluate=code=>window.webContents.executeJavaScript(code),pause=()=>new Promise(resolve=>setTimeout(resolve,90));
 const original=await evaluate('({layout:state.layout,ratios:{...state.panelRatios}})');
 const drag=async(axis,ratio)=>{const p=await evaluate(`(()=>{const h=document.querySelector('.panel-resizer-${axis}').getBoundingClientRect(),r=document.querySelector('#panes').getBoundingClientRect();return {x:${axis==='x'?'h.x+h.width/2':'h.x+h.width/4'},y:${axis==='y'?'h.y+h.height/2':'h.y+h.height/4'},targetX:${axis==='x'?'r.x+r.width*'+ratio:'h.x+h.width/4'},targetY:${axis==='y'?'r.y+r.height*'+ratio:'h.y+h.height/4'}};})()`);window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(p.x),y:Math.round(p.y)});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:Math.round(p.x),y:Math.round(p.y)});await pause();window.webContents.sendInputEvent({type:'mouseMove',modifiers:['leftButtonDown'],x:Math.round(p.targetX),y:Math.round(p.targetY)});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(p.targetX),y:Math.round(p.targetY)});await pause();};
 try{
  await evaluate(`applyLayout(4);window.__splitRow=document.querySelector('.file-row');window.__splitPath=tabOf(state.panes[0]).path;`);await pause();
  await drag('x',.65);await drag('y',.4);const ratios=await evaluate('({...state.panelRatios})');assert(Math.abs(ratios.x-.65)<.02);assert(Math.abs(ratios.y-.4)<.02);
  assert(await evaluate(`window.__splitRow===document.querySelector('.file-row')&&window.__splitPath===tabOf(state.panes[0]).path&&!document.body.classList.contains('resizing-panels')`));
  await saveComplete();const saved=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.equal(saved.panelRatios.x,ratios.x);
  await window.loadURL('quadfinder://app/index.html');for(let i=0;i<150;i++){if(await evaluate('window.__quadfinderReady===true'))break;await pause();}assert.equal(await evaluate('state.panelRatios.x'),ratios.x);
  await evaluate(`document.querySelector('.panel-resizer-x').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));document.querySelector('.panel-resizer-y').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);assert(await evaluate('state.panelRatios.x===.5&&state.panelRatios.y===.5'));
  await evaluate(`document.querySelector('.panel-resizer-x').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));applyLayout(2);`);assert(await evaluate(`state.panelRatios.x===.2&&document.querySelector('.panel-resizer-y').hidden&&!document.querySelector('.panel-resizer-x').hidden`));
  await evaluate('applyLayout(1)');assert(await evaluate(`[...document.querySelectorAll('.panel-resizer')].every(h=>h.hidden)`));
  return {passed:true,dragBothAxes:true,preservesView:true,restored:true,reset:true,keyboard:true,layouts:true};
 }finally{await evaluate(`state.panelRatios=${JSON.stringify(original.ratios)};applyLayout(${original.layout});`);}
}
module.exports={run};
