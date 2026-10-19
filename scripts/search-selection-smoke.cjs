const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run({window,root}){
  const folder=path.join(root,'large-search'),evaluate=code=>window.webContents.executeJavaScript(code);
  await fs.mkdir(folder);
  for(let offset=0;offset<2105;offset+=50)await Promise.all(Array.from({length:Math.min(50,2105-offset)},(_,i)=>fs.writeFile(path.join(folder,`qf-page-smoke-${String(offset+i).padStart(4,'0')}.txt`),'test')));
  try{
    await evaluate(`(async()=>{$('#search').value='';state.query='';await navigate(0,${JSON.stringify(folder)});setView(0,{view:'details',showHidden:false,group:'none',inspector:'off',sort:'name'});setActive(0);})()`);
    const selectionResult=await evaluate(`(()=>{
      const pane=state.panes[0],tab=tabOf(pane),table=pane.element.querySelector('.file-table');table.focus();
      const press=shift=>table.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,shiftKey:shift,bubbles:true,cancelable:true}));
      press(false);const all=selection(tab).size;press(true);const shown=selection(tab).size;
      tab.entries[0].hidden=true;renderRows(0);selectAllEntries(0);const hiddenExcluded=selection(tab).size===2104;tab.entries[0].hidden=false;
      setView(0,{group:'type'});tab.collapsed=new Set(['.TXT']);renderRows(0);selectAllEntries(0,true);const collapsedShown=selection(tab).size;selectAllEntries(0);const collapsedAll=selection(tab).size;
      setView(0,{group:'none'});return {all,shown,hiddenExcluded,collapsedShown,collapsedAll};
    })()`);
    assert.deepEqual(selectionResult,{all:2105,shown:2000,hiddenExcluded:true,collapsedShown:0,collapsedAll:2105});
    await evaluate(`call(api.addRoot(${JSON.stringify(folder)}))`);
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){if(await evaluate(`call(api.search('qf-page-smoke-','all')).then(value=>value.total===2105)`))break;await new Promise(resolve=>setTimeout(resolve,100));}
    await evaluate(`(async()=>{$('#search').value='qf-page-smoke-';state.filter='all';await runSearch();})()`);
    assert.equal(await evaluate('tabOf(state.panes[0]).entries.length'),1000);
    await evaluate(`chooseEntry(0,tabOf(state.panes[0]).entries[0]);loadMoreSearch(0)`);
    assert.equal(await evaluate('tabOf(state.panes[0]).entries.length'),2000);
    assert.equal(await evaluate('selection(tabOf(state.panes[0])).size'),1);
    await evaluate('loadMoreSearch(0)');assert.equal(await evaluate('tabOf(state.panes[0]).entries.length'),2105);
    assert.equal(await evaluate(`!!state.panes[0].element.querySelector('.search-more')`),false);
    await evaluate('refreshSearch()');assert.equal(await evaluate('tabOf(state.panes[0]).entries.length'),2105);
    await evaluate(`$('#search').value='qf-page-smoke-';runSearch()`);assert.equal(await evaluate('tabOf(state.panes[0]).entries.length'),1000);
    return {passed:true,folderAll:2105,shownOnly:2000,hiddenExcluded:true,collapsedGroups:true,searchExpanded:2105,selectionPreserved:true,refreshPreservesLoaded:true};
  }finally{
    await evaluate(`(async()=>{$('#search').value='';state.query='';await call(api.removeRoot(${JSON.stringify(folder)}));await navigate(0,${JSON.stringify(root)});})()`);
  }
}
module.exports={run};
