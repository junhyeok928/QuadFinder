const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const pause=()=>new Promise(resolve=>setTimeout(resolve,180));
async function run({window,stateFile,saveComplete,output}){
  const evaluate=code=>window.webContents.executeJavaScript(code);
  const set=async factor=>{
    await evaluate(`call(api.setZoom(${factor}))`);
    const expected=Math.max(70,Math.min(150,Math.round(factor*100))),deadline=Date.now()+5000;
    while(Date.now()<deadline){const view=await evaluate('({width:innerWidth,label:document.querySelector("#zoom-reset").textContent})');if(view.label===`${expected}%`&&Math.abs(view.width-window.getContentBounds().width/(expected/100))<3)return;await pause();}
    throw new Error('Zoom render did not settle: '+JSON.stringify(await evaluate('({width:innerWidth,label:document.querySelector("#zoom-reset").textContent})')));
  };
  await set(1);
  const before=await evaluate('innerWidth');
  await evaluate(`window.__wheelEvents=[];document.addEventListener('wheel',event=>window.__wheelEvents.push({ctrl:event.ctrlKey,delta:event.deltaY}),true)`);
  const wheel=async(deltaY,control=true)=>{
    const count=await evaluate('window.__wheelEvents.length');
    const expected=Math.round(window.webContents.getZoomFactor()*100)+(control?(deltaY>0?10:-10):0);
    window.webContents.sendInputEvent({type:'mouseMove',x:400,y:280});
    window.webContents.sendInputEvent({type:'mouseWheel',x:400,y:280,deltaY,deltaX:0,canScroll:true,modifiers:control?['control']:[]});
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){if((await evaluate('window.__wheelEvents.length'))>count&&Math.round(window.webContents.getZoomFactor()*100)===expected)break;await pause();}
    await pause();return Math.round(window.webContents.getZoomFactor()*100);
  };
  const up=await wheel(120),scaledWidth=await evaluate('innerWidth');
  const down=await wheel(-120),plain=await wheel(120,false);
  assert.equal(up,110,'Ctrl+wheel up must enlarge '+JSON.stringify(await evaluate('({events:window.__wheelEvents,api:typeof api.adjustZoom,zoom:document.querySelector("#zoom-reset").textContent})')));assert.equal(down,100,'Ctrl+wheel down must shrink');assert.equal(plain,100,'plain wheel must only scroll');assert(scaledWidth<before);
  await set(9);assert.equal(Math.round(window.webContents.getZoomFactor()*100),150);
  await fs.writeFile(path.join(output,'zoom-150.png'),(await window.webContents.capturePage()).toPNG());
  const bounds=window.getBounds();window.setSize(1000,680);await set(1.5);
  const compact=await evaluate('document.documentElement.scrollWidth<=innerWidth && document.querySelector(".search-toolbar").getBoundingClientRect().right<=innerWidth && document.querySelector(".statusbar").scrollWidth<=document.querySelector(".statusbar").clientWidth');
  assert(compact,'150% zoom must fit the minimum window width');
  await fs.writeFile(path.join(output,'zoom-compact.png'),(await window.webContents.capturePage()).toPNG());
  window.setBounds(bounds);
  await set(.01);assert.equal(Math.round(window.webContents.getZoomFactor()*100),70);
  await set(1.2);await saveComplete();assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).zoomFactor,1.2);
  window.webContents.setZoomFactor(1);
  await window.loadURL('quadfinder://app/index.html');
  const deadline=Date.now()+10000;
  while(Date.now()<deadline&&!(await evaluate('window.__quadfinderReady===true')))await pause();
  assert.equal(Math.round(window.webContents.getZoomFactor()*100),120);assert.equal(await evaluate('document.querySelector("#zoom-reset").textContent'),'120%');
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'0',modifiers:['control']});window.webContents.sendInputEvent({type:'keyUp',keyCode:'0',modifiers:['control']});await pause();
  assert.equal(Math.round(window.webContents.getZoomFactor()*100),100);
  await set(1.3);await evaluate('document.querySelector("#zoom-reset").click()');await pause();assert.equal(Math.round(window.webContents.getZoomFactor()*100),100);
  await saveComplete();
  return {passed:true,ctrlWheelUp:up,ctrlWheelDown:down,plainWheel:plain,wholeInterface:true,bounds:true,compact,saved:true,restored:true,ctrlZero:true,resetButton:true};
}
module.exports={run};
