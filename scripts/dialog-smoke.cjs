const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const pause=()=>new Promise(resolve=>setTimeout(resolve,70));
async function run({window,root,output}){
 const source=path.join(root,'dialog-source'),destination=path.join(root,'dialog-target');await fs.mkdir(source);await fs.mkdir(destination);
 const evaluate=code=>window.webContents.executeJavaScript(code);
 const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await pause();}throw Error('Dialog timeout: '+expression);};
 const click=async action=>{const point=await evaluate(`(()=>{const b=document.querySelector('#action-dialog [data-dialog-action="${action}"]');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await pause();};
 const start=async input=>{await evaluate(`window.dialogResult=null;window.dialogJob=null;void call(api.startOperation(${JSON.stringify(input)})).then(id=>{window.dialogJob=id;window.dialogResult='returned';});`);};
 const jobDone=async()=>{await wait(`window.dialogResult==='returned'&&window.dialogJob&&currentJobs.some(j=>j.id===window.dialogJob&&!['queued','scanning','running'].includes(j.status))`);const job=await evaluate('currentJobs.find(j=>j.id===window.dialogJob)');assert.equal(job.status,'completed',JSON.stringify(job.errors));return job;};
 const original=await evaluate('document.documentElement.dataset.theme');window.show();window.focus();
 try{
  for(const theme of ['dark','light']){
   await evaluate(`document.documentElement.dataset.theme='${theme}'`);
   await evaluate(`document.querySelector('#folder-name').value='';document.querySelector('#folder-dialog').showModal();`);await pause();
   await fs.writeFile(path.join(output,`dialog-folder-${theme}.png`),(await window.webContents.capturePage()).toPNG());
   await evaluate(`document.querySelector('#folder-dialog button[value="cancel"]').click();`);assert.equal(await evaluate(`document.querySelector('#folder-dialog').open`),false,'empty form can cancel');
   const file=path.join(source,theme+'.txt'),target=path.join(destination,theme+'.txt');await fs.writeFile(file,'new');await fs.writeFile(target,'old');
   await start({kind:'copy',sources:[file],destination});await wait(`document.querySelector('#action-dialog').open`);
   assert.deepEqual(await evaluate(`[...document.querySelectorAll('.action-footer button')].map(e=>e.textContent)`),['둘 다 유지','건너뛰기','덮어쓰기']);
   assert.equal(await evaluate(`document.activeElement.dataset.dialogAction`),'keep-both');
   await fs.writeFile(path.join(output,`dialog-conflict-${theme}.png`),(await window.webContents.capturePage()).toPNG());
   await click(theme==='dark'?'keep-both':'overwrite');await jobDone();assert.equal(await fs.readFile(target,'utf8'),theme==='dark'?'old':'new');
  }
  const file=path.join(source,'skip.txt');await fs.writeFile(file,'new');await fs.writeFile(path.join(destination,'skip.txt'),'old');await start({kind:'copy',sources:[file],destination});await wait(`document.querySelector('#action-dialog').open`);const bounds=window.getBounds();window.setSize(1000,680);await pause();assert.ok(await evaluate(`(()=>{const r=document.querySelector('#action-dialog').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`),'compact dialog fits');await click('skip');window.setBounds(bounds);await pause();assert.equal((await jobDone()).skipped,1);assert.equal(await fs.readFile(path.join(destination,'skip.txt'),'utf8'),'old');
  const files=['all-a.txt','all-b.txt'];for(const name of files){await fs.writeFile(path.join(source,name),'new');await fs.writeFile(path.join(destination,name),'old');}
  await start({kind:'copy',sources:files.map(name=>path.join(source,name)),destination});await wait(`document.querySelector('#action-dialog').open`);await evaluate(`document.querySelector('.action-apply input').checked=true`);await click('overwrite');assert.equal((await jobDone()).done,2);assert.equal(await evaluate(`document.querySelector('#action-dialog').open`),false);
  const executable=path.join(source,'never-run.cmd');await fs.writeFile(executable,'@exit /b 0');await evaluate(`window.openResult=null;void call(api.open(${JSON.stringify(executable)})).then(value=>window.openResult=value);`);await wait(`document.querySelector('#action-dialog').open`);await fs.writeFile(path.join(output,'dialog-open.png'),(await window.webContents.capturePage()).toPNG());await click('cancel');await wait('window.openResult===false');
  await start({kind:'trash',sources:[file]});await wait(`document.querySelector('#action-dialog').open`);await fs.writeFile(path.join(output,'dialog-delete.png'),(await window.webContents.capturePage()).toPNG());window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});await wait(`window.dialogResult==='returned'`);assert.equal(await evaluate('window.dialogJob'),null);assert.equal(await fs.readFile(file,'utf8'),'new');
  await start({kind:'trash',sources:[file]});await wait(`document.querySelector('#action-dialog').open`);assert.equal(await evaluate('document.activeElement.dataset.dialogAction'),'trash','delete is the default confirmation');window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await jobDone();await assert.rejects(fs.stat(file),{code:'ENOENT'});
  const cancelFile=path.join(source,'keyboard-cancel.txt');await fs.writeFile(cancelFile,'preserve');await start({kind:'trash',sources:[cancelFile]});await wait(`document.querySelector('#action-dialog').open`);await evaluate(`document.querySelector('.action-footer [data-dialog-action="cancel"]').focus()`);window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await jobDone();await assert.rejects(fs.stat(cancelFile),{code:'ENOENT'});
  return {passed:true,compactFits:true,formCancel:true,themes:['dark','light'],keepBoth:true,skip:true,overwrite:true,applyAll:true,executableCancel:true,deleteCancel:true,deleteConfirm:true,enterConfirm:true,positiveEnterFromCancel:true};
 }finally{await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(original)}`);}
}
module.exports={run};
