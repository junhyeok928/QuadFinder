const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const pause=()=>new Promise(resolve=>setTimeout(resolve,150));
async function run({window,stateFile,saveComplete,output}){
 const evaluate=code=>window.webContents.executeJavaScript(code);
 const original=await evaluate('document.documentElement.dataset.theme');
 const bounds=window.getBounds();
 const set=async theme=>{await evaluate(`(async()=>{const select=document.querySelector('#theme-select');select.value=${JSON.stringify(theme)};await select.onchange();})()`);await pause();};
 const waitReady=async()=>{for(let i=0;i<100;i++){if(await evaluate('window.__quadfinderReady===true'))return;await pause();}throw new Error('Theme reload timeout');};
 const themes={};
 try{
  await evaluate(`window.__themeRow=document.querySelector('.file-row');window.__themePath=tabOf(state.panes[0]).path;window.__themePane=state.active;`);
  for(const theme of ['dark','light']){
   await set(theme);await saveComplete();
   assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).theme,theme);
   const colors=await evaluate(`(()=>{const style=getComputedStyle(document.body);const rootStyle=getComputedStyle(document.documentElement);const text=getComputedStyle(document.querySelector('.file-cell')||document.querySelector('.pane-footer')).color;return {background:style.backgroundColor,text:style.color,secondary:text,scheme:rootStyle.colorScheme,stable:window.__themeRow===document.querySelector('.file-row')&&window.__themePath===tabOf(state.panes[0]).path&&window.__themePane===state.active};})()`);
   assert.equal(colors.background,theme==='dark'?'rgb(24, 24, 24)':'rgb(255, 255, 255)');assert.equal(colors.scheme,theme);assert(colors.stable);
   const luminance=rgb=>{const c=rgb.match(/[\d.]+/g).slice(0,3).map(v=>{const x=Number(v)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
   const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
   assert(contrast(colors.background,colors.text)>=4.5);assert(contrast(colors.background,colors.secondary)>=4.5);
   await evaluate(`showViewMenu(state.active,250,180);document.querySelector('#folder-dialog').showModal()`);
   const surfaces=await evaluate(`({dialog:getComputedStyle(document.querySelector('#folder-dialog')).backgroundColor,menu:getComputedStyle(document.querySelector('#context-menu')).backgroundColor})`);assert.equal(surfaces.menu,theme==='dark'?'rgb(36, 36, 36)':'rgb(255, 255, 255)');assert.equal(surfaces.dialog,surfaces.menu);
   await evaluate(`document.querySelector('#folder-dialog').close();document.querySelector('#context-menu').hidden=true`);
   await fs.writeFile(path.join(output,`theme-${theme}.png`),(await window.webContents.capturePage()).toPNG());
   window.setSize(1000,680);await pause();assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#theme-select').getBoundingClientRect().right<innerWidth&&document.querySelector('.window-controls').getBoundingClientRect().right<=innerWidth+1`));
   window.setBounds(bounds);await pause();themes[theme]={contrast:true,menus:true,dialog:true,compact:true,preservedView:true,saved:true};
  }
  await window.loadURL('quadfinder://app/index.html');await waitReady();assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
  const invalid=await evaluate(`api.setTheme('invalid')`);assert.equal(invalid.ok,false);assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).theme,'light');
  await set('dark');await window.loadURL('quadfinder://app/index.html');await waitReady();assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
  return {passed:true,themes,restored:true,invalidRejected:true};
 }finally{window.setBounds(bounds);await set(original);}
}
module.exports={run};
