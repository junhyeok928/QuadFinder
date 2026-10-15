const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
async function run({window,root,notify,saveComplete,networkRoot,stateFile,rootsFile}){
  const first=path.join(root,'refresh-first'),second=path.join(root,'refresh-second');await fs.mkdir(first);await fs.mkdir(second);
  for(let i=0;i<45;i++)await fs.writeFile(path.join(first,`refresh-row-${String(i).padStart(2,'0')}.txt`),'original');
  await fs.writeFile(path.join(second,'other.txt'),'other');const changed=path.join(first,'refresh-row-00.txt');
  const evaluate=code=>window.webContents.executeJavaScript(code),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async code=>{for(let i=0;i<200;i++){if(await evaluate(code))return;await delay(40);}throw new Error('Refresh UI timeout: '+code);};
  await evaluate(`applyLayout(2);Promise.all([navigate(0,${JSON.stringify(first)}),navigate(1,${JSON.stringify(second)})])`);
  await evaluate(`Promise.all([call(api.addRoot(${JSON.stringify(first)})),call(api.addRoot(${JSON.stringify(second)}))])`);
  await wait(`document.querySelectorAll('#custom-places button').length>=2`);
  await evaluate(`setActive(1);[...document.querySelectorAll('#custom-places button')].find(b=>ChangePolicy.key(b.dataset.location)===ChangePolicy.key(${JSON.stringify(first)})).click()`);
  await wait(`!tabOf(state.panes[1]).loading&&ChangePolicy.key(tabOf(state.panes[1]).path)===ChangePolicy.key(${JSON.stringify(first)})`);
  assert(await evaluate(`document.querySelector('#custom-places button.active')?.getAttribute('aria-current')==='location'`));
  await evaluate(`navigate(1,${JSON.stringify(second)})`);await evaluate(`setActive(0)`);
  assert(await evaluate(`ChangePolicy.key(document.querySelector('nav button.active').dataset.location)===ChangePolicy.key(${JSON.stringify(first)})`));
  await evaluate(`setActive(1);renderRoots(state.boot.roots)`);
  assert(await evaluate(`ChangePolicy.key(document.querySelector('nav button.active').dataset.location)===ChangePolicy.key(${JSON.stringify(second)})`));
  await delay(700);
  await evaluate(`(()=>{const a=state.panes[0].element,b=state.panes[1].element;window.refreshSnapshot={table:a.querySelector('.file-table'),row:a.querySelector('.file-row'),other:b.querySelector('.file-row'),changes:0};refreshSnapshot.table.scrollTop=240;refreshSnapshot.top=refreshSnapshot.table.scrollTop;refreshSnapshot.row.click();setActive(1);window.refreshObserver=new MutationObserver(records=>refreshSnapshot.changes+=records.length);refreshObserver.observe(a,{subtree:true,childList:true});})()`);
  notify([changed]);await delay(800);
  assert(await evaluate(`refreshSnapshot.changes===0&&refreshSnapshot.row===state.panes[0].element.querySelector('.file-row')`));
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await fs.writeFile(changed,'changed content, longer than before');for(let i=0;i<8;i++)notify([changed]);await delay(700);
  assert(await evaluate(`!refreshFocused&&refreshSnapshot.changes===0&&pendingRefreshPaths.size>0`));
  await evaluate(`window.dispatchEvent(new Event('focus'))`);
  await wait(`!refreshRunning&&tabOf(state.panes[0]).entries.find(e=>e.path===${JSON.stringify(changed)})?.size>20`);
  assert(await evaluate(`refreshSnapshot.table===state.panes[0].element.querySelector('.file-table')&&refreshSnapshot.other===state.panes[1].element.querySelector('.file-row')&&refreshSnapshot.table.scrollTop===refreshSnapshot.top&&selection(tabOf(state.panes[0])).size===1&&state.active===1`));
  await evaluate(`refreshObserver.disconnect();document.querySelector('#search').value='refresh-row';runSearch()`);
  await wait(`!tabOf(state.panes[0]).loading&&tabOf(state.panes[0]).entries.length===45`);await delay(500);
  await evaluate(`window.stableSearchRow=state.panes[0].element.querySelector('.file-row');setActive(1);updateIndex({indexing:true,count:60});updateIndex({indexing:false,count:60});`);await delay(800);
  assert(await evaluate(`stableSearchRow===state.panes[0].element.querySelector('.file-row')&&state.active===1`));
  await evaluate(`document.querySelector('#search').value='';runSearch()`);await wait(`!state.panes.some(pane=>tabOf(pane).loading)`);
  let network=null;
  if(networkRoot){
    const roots=await evaluate(`call(api.addRoot(${JSON.stringify(networkRoot)}))`);assert(roots.some(value=>value.toLowerCase().replace(/\\$/,'')===networkRoot.toLowerCase().replace(/\\$/,'')));
    await evaluate(`setActive(0);navigate(0,${JSON.stringify(networkRoot)})`);
    assert(await evaluate(`!tabOf(state.panes[0]).error&&tabOf(state.panes[0]).path.startsWith('\\\\\\\\')&&!!document.querySelector('#custom-places button.active')`));
    const count=await evaluate(`tabOf(state.panes[0]).entries.length`);
    const breadcrumb=await evaluate(`state.panes[0].element.querySelector('[data-breadcrumb]').dataset.breadcrumb`);assert(breadcrumb.startsWith('\\\\'));assert(breadcrumb.split('\\').filter(Boolean).length===2);
    await saveComplete();const saved=JSON.parse(await fs.readFile(stateFile,'utf8')),savedRoots=JSON.parse(await fs.readFile(rootsFile,'utf8'));assert(saved.panes[0].tabs.some(tab=>tab.path.startsWith('\\\\')));assert(savedRoots.roots.some(value=>value.startsWith('\\\\')));
    await window.loadURL('quadfinder://app/index.html');await wait(`window.__quadfinderReady===true`);
    assert(await evaluate(`tabOf(state.panes[0]).path.startsWith('\\\\\\\\')&&!tabOf(state.panes[0]).error&&!!document.querySelector('#custom-places button.active')`));
    await evaluate(`call(api.removeRoot(${JSON.stringify(networkRoot)}))`);network={connected:true,items:count,sidebar:true,breadcrumb:true,saved:true,restored:true};
  }
  await evaluate(`Promise.all([call(api.removeRoot(${JSON.stringify(first)})),call(api.removeRoot(${JSON.stringify(second)}))])`);
  return {passed:true,sidebarSelection:true,sidebarAfterPaneSwitch:true,unchangedNoRepaint:true,backgroundNoRepaint:true,foregroundRefresh:true,unrelatedPaneStable:true,scrollAndSelectionPreserved:true,searchNoRepaint:true,network};
}
module.exports={run};
