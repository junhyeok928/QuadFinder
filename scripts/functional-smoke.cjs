const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

async function run({window,root}){
  const source=path.join(root,'source'),target=path.join(root,'target'),moved=path.join(root,'moved');
  await Promise.all([source,target,moved].map(folder=>fs.mkdir(folder)));
  await fs.writeFile(path.join(source,'alpha.txt'),'first file');await fs.writeFile(path.join(source,'beta.txt'),'second file');
  const evaluate=code=>window.webContents.executeJavaScript(code);
  const waitJob=async id=>{
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){const jobs=await evaluate('currentJobs');const job=jobs.find(item=>item.id===id);if(job&&!['queued','scanning','running'].includes(job.status)){assert.equal(job.status,'completed',JSON.stringify(job.errors));return job;}await new Promise(resolve=>setTimeout(resolve,50));}
    throw new Error('File operation UI timed out');
  };
  await evaluate(`Promise.all([navigate(0,${JSON.stringify(source)}),navigate(1,${JSON.stringify(target)}),navigate(2,${JSON.stringify(moved)})])`);
  const multiSelect=await evaluate(`(()=>{const rows=document.querySelectorAll('.pane:first-child .file-row');rows[0].click();rows[1].dispatchEvent(new MouseEvent('click',{ctrlKey:true,bubbles:true}));return document.querySelectorAll('.pane:first-child .file-row.selected').length===2;})()`);
  assert(multiSelect);
  await evaluate(`fileAction('copy',0)`);
  const copyId=await evaluate(`fileAction('paste',1).then(()=>currentJobs[currentJobs.length-1]?.id)`);
  await waitJob(copyId);
  assert.equal(await fs.readFile(path.join(target,'alpha.txt'),'utf8'),'first file');assert.equal(await fs.readFile(path.join(target,'beta.txt'),'utf8'),'second file');
  // Paste again to exercise the real conflict route with only these disposable fixtures.
  const conflictId=await evaluate(`fileAction('paste',1).then(()=>currentJobs[currentJobs.length-1]?.id)`);await waitJob(conflictId);
  assert.equal(await fs.readFile(path.join(target,'alpha (2).txt'),'utf8'),'first file');
  await evaluate(`load(1)`);
  await evaluate(`(()=>{const row=[...document.querySelectorAll('.pane:nth-child(2) .file-row')].find(row=>row.title===${JSON.stringify(path.join(target,'alpha.txt'))});row.click();})()`);
  await evaluate(`fileAction('rename',1);document.querySelector('#rename-name').value='renamed.txt';document.querySelector('#rename-dialog form').requestSubmit(document.querySelector('#rename-dialog button[value="rename"]'));`);
  const renameDeadline=Date.now()+10000;
  while(Date.now()<renameDeadline){try{await fs.stat(path.join(target,'renamed.txt'));break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
  assert.equal(await fs.readFile(path.join(target,'renamed.txt'),'utf8'),'first file');
  await evaluate(`load(1)`);
  const beforeMove=await evaluate('currentJobs.length');
  await evaluate(`(()=>{const row=[...document.querySelectorAll('.pane:nth-child(2) .file-row')].find(row=>row.title===${JSON.stringify(path.join(target,'renamed.txt'))});row.click();const data=new DataTransfer();row.dispatchEvent(new DragEvent('dragstart',{dataTransfer:data,bubbles:true}));document.querySelector('.pane:nth-child(3) .file-table').dispatchEvent(new DragEvent('drop',{dataTransfer:data,shiftKey:true,bubbles:true,cancelable:true}));})()`);
  let moveId;
  for(let i=0;i<200;i++){const jobs=await evaluate('currentJobs');if(jobs.length>beforeMove){moveId=jobs.at(-1).id;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  await waitJob(moveId);await assert.rejects(fs.stat(path.join(target,'renamed.txt')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(moved,'renamed.txt'),'utf8'),'first file');
  await evaluate(`load(2)`);
  await evaluate(`document.querySelector('.pane:nth-child(3) .file-row').click()`);
  const trashId=await evaluate(`fileAction('trash',2).then(()=>currentJobs[currentJobs.length-1]?.id)`);await waitJob(trashId);await assert.rejects(fs.stat(path.join(moved,'renamed.txt')),{code:'ENOENT'});
  const menu=await evaluate(`(()=>{const table=document.querySelector('.pane:nth-child(2) .file-table');table.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:250}));return [...document.querySelectorAll('#context-menu [role="menuitem"]')].some(button=>button.textContent.includes('붙여넣기'));})()`);assert(menu);
  await evaluate(`document.querySelector('#context-menu').hidden=true;document.querySelector('#operations-panel').hidden=true;`);
  await evaluate(`document.querySelector('#manage-roots').click();document.querySelector('#root-path').value=${JSON.stringify(root)};document.querySelector('#add-root-path').click();`);
  const rootsDeadline=Date.now()+10000;
  while(Date.now()<rootsDeadline){if(await evaluate(`state.boot.roots.includes(${JSON.stringify(root)})`))break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert(await evaluate(`state.boot.roots.includes(${JSON.stringify(root)})`));
  const settings=JSON.parse(await fs.readFile(path.join(path.dirname(path.dirname(root)),'output','smoke-profile','search-roots.json'),'utf8'));
  assert(settings.roots.includes(root));
  await evaluate(`call(api.removeRoot(${JSON.stringify(root)})).then(()=>document.querySelector('#close-roots').click())`);
  return {passed:true,multiSelect,copy:true,collision:true,rename:true,dragMove:true,nativeRecycleBin:true,contextMenu:menu,searchRootsSaved:true};
}
module.exports={run};
