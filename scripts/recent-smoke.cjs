const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run({window,root,saveComplete,stateFile}){
 const evaluate=async code=>{try{return await window.webContents.executeJavaScript(code);}catch(error){throw new Error('Recent UI script failed: '+code,{cause:error});}},pause=()=>new Promise(resolve=>setTimeout(resolve,80));
 const wait=async condition=>{for(let i=0;i<150;i++){if(await evaluate(condition))return;await pause();}throw new Error('Recent folders timeout: '+condition);};
 const original=await evaluate('JSON.stringify(navState())'),folders=[];
 try{
  assert.equal(await evaluate(`!!document.querySelector('[data-filter="recent"]')`),false);
  await evaluate(`navState().recent=[];navState().collapsed.recent=false;renderSidebar();`);
  for(let i=0;i<12;i++){const folder=path.join(root,`recent-${i}`);await fs.mkdir(folder);folders.push(folder);await evaluate(`navigate(0,${JSON.stringify(folder)})`);}
  let recent=await evaluate('navState().recent');assert.equal(recent.length,10);assert.equal(recent[0],folders[11]);assert.equal(recent.at(-1),folders[2]);
  await evaluate(`navigate(0,${JSON.stringify(folders[5])})`);recent=await evaluate('navState().recent');assert.equal(recent[0],folders[5]);assert.equal(recent.filter(folder=>folder===folders[5]).length,1);
  const before=JSON.stringify(recent);await evaluate('load(0);');assert.equal(await evaluate('JSON.stringify(navState().recent)'),before);
  await evaluate(`navigate(0,${JSON.stringify(path.join(root,'does-not-exist'))})`);assert.equal(await evaluate('JSON.stringify(navState().recent)'),before);
  await evaluate(`setActive(1);[...document.querySelectorAll('[data-recent-location]')].find(button=>button.dataset.recentLocation===${JSON.stringify(folders[7])}).click()`);
  await wait(`!tabOf(state.panes[1]).loading&&tabOf(state.panes[1]).path===${JSON.stringify(folders[7])}`);assert.equal((await evaluate('navState().recent'))[0],folders[7]);
  await evaluate(`document.querySelector('[data-nav-section="recent"]').click()`);assert(await evaluate(`document.querySelector('#recent-group').hidden`));
  await saveComplete();assert(JSON.parse(await fs.readFile(stateFile,'utf8')).navigation.collapsed.recent);
  await window.loadURL('quadfinder://app/index.html');await wait('window.__quadfinderReady===true');assert(await evaluate(`document.querySelector('#recent-group').hidden&&navState().recent[0]===${JSON.stringify(folders[7])}`));
  await evaluate(`setActive(1);document.querySelector('[data-nav-section="recent"]').click();[...document.querySelectorAll('[data-recent-location]')].find(button=>button.dataset.recentLocation===${JSON.stringify(folders[5])}).dispatchEvent(new MouseEvent('click',{ctrlKey:true,bubbles:true}))`);
  await wait(`!tabOf(state.panes[state.active]).loading&&tabOf(state.panes[state.active]).path===${JSON.stringify(folders[5])}`);
  await evaluate(`state.panes[1].tabs.pop();state.panes[1].active=0;renderPane(1);save();`);
  await evaluate(`showSidebarMenu(${JSON.stringify(folders[5])},'recent',300,160);document.querySelector('[data-nav-action="remove-recent"]').click()`);assert(!(await evaluate('navState().recent')).includes(folders[5]));assert((await fs.stat(folders[5])).isDirectory());
  await evaluate(`document.querySelector('#clear-recent').click()`);assert.equal((await evaluate('navState().recent')).length,0);assert(await evaluate(`document.querySelector('#clear-recent').hidden`));
  await saveComplete();await window.loadURL('quadfinder://app/index.html');await wait('window.__quadfinderReady===true');assert.equal((await evaluate('navState().recent')).length,0);
  return {passed:true,latestTen:true,deduplicated:true,refreshIgnored:true,failedVisitIgnored:true,activePane:true,newTab:true,collapseRestored:true,recordsRestored:true,removePreservesFolder:true,clearRestored:true};
 }finally{await evaluate(`state.navigation=NavigationState.normalize(JSON.parse(${JSON.stringify(original)}));renderSidebar();saveNavigation();`);}
}
module.exports={run};
