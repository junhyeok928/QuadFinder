const assert=require('node:assert/strict');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
async function run({window,root}){
  const evaluate=code=>window.webContents.executeJavaScript(code);
  const handle=window.getNativeWindowHandle().readBigUInt64LE().toString();
  // Send a real Windows WM_APPCOMMAND through Electron, including the preload IPC.
  const command=async direction=>{
    const code=`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class QuadHistoryInput{[DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);}'\n[QuadHistoryInput]::PostMessage([IntPtr]${handle},0x319,[IntPtr]${handle},[IntPtr]${direction<0?65536:131072})`;
    await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true});
  };
  const wait=async expected=>{for(let i=0;i<100;i++){if(await evaluate(`!tabOf(state.panes[1]).loading&&tabOf(state.panes[1]).path===${JSON.stringify(expected)}`))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Mouse history timeout');};
  const source=path.join(root,'source'),target=path.join(root,'target'),moved=path.join(root,'moved');
  await evaluate(`navigate(0,${JSON.stringify(root)}).then(()=>navigate(0,${JSON.stringify(target)}))`);
  await evaluate(`navigate(1,${JSON.stringify(root)}).then(()=>navigate(1,${JSON.stringify(moved)})).then(()=>navigate(1,${JSON.stringify(source)})).then(()=>setActive(1))`);
  const inactive=await evaluate(`tabOf(state.panes[0]).path`);
  // Hovering/clicking a side button over a different pane must not activate it.
  await evaluate(`state.panes[0].element.dispatchEvent(new PointerEvent('pointerdown',{button:3,bubbles:true}))`);
  assert.equal(await evaluate('state.active'),1);
  await command(-1);await wait(moved);assert.equal(await evaluate('tabOf(state.panes[0]).path'),inactive);
  await command(1);await wait(source);
  // Real Chromium back/forward button events are distinct from WM_APPCOMMAND.
  window.webContents.debugger.attach('1.3');
  try{
    const point=await evaluate(`(()=>{const r=state.panes[0].element.querySelector('.file-table').getBoundingClientRect();return {x:r.x+35,y:r.y+40};})()`);
    const side=async button=>{await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',button,buttons:button==='back'?8:16,clickCount:1,...point});await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button,buttons:0,clickCount:1,...point});};
    await side('back');await wait(moved);assert.equal(await evaluate('state.active'),1);assert.equal(await evaluate('tabOf(state.panes[0]).path'),inactive);
    await side('forward');await wait(source);
    const beforeDuplicate=await evaluate('tabOf(state.panes[1]).cursor');
    await evaluate(`historyInput(-1,'windows');document.dispatchEvent(new PointerEvent('pointerup',{button:3,bubbles:true,cancelable:true}));`);await wait(moved);
    assert.equal(await evaluate('tabOf(state.panes[1]).cursor'),beforeDuplicate-1);
    await side('forward');await wait(source);
    await evaluate(`document.querySelector('#folder-dialog').showModal()`);await side('back');assert.equal(await evaluate('tabOf(state.panes[1]).path'),source);await evaluate(`document.querySelector('#folder-dialog').close()`);
  }finally{window.webContents.debugger.detach();}
  await evaluate(`(()=>{const tab=tabOf(state.panes[1]);tab.history=[tab.path];tab.cursor=0;})()`);
  await command(-1);await command(1);assert.equal(await evaluate('tabOf(state.panes[1]).cursor'),0);assert.equal(await evaluate('tabOf(state.panes[1]).path'),source);
  await evaluate(`navigate(1,${JSON.stringify(moved)});`);const saved=await evaluate('tabOf(state.panes[1]).cursor');
  await evaluate('newTab(1)');await new Promise(resolve=>setTimeout(resolve,100));await command(-1);
  assert.equal(await evaluate('state.panes[1].active'),1);assert.equal(await evaluate('tabOf(state.panes[1]).cursor'),0);assert.equal(await evaluate('state.panes[1].tabs[0].cursor'),saved);
  await evaluate(`state.panes[1].tabs.pop();state.panes[1].active=0;renderPane(1);`);
  return {passed:true,windowsCommand:true,chromiumSideButtons:true,duplicateSuppressed:true,dialogGuard:true,activePaneOnly:true,forward:true,bounds:true,independentTabs:true};
}
module.exports={run};
