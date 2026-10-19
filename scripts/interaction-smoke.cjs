const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const pause=()=>new Promise(r=>setTimeout(r,60));
async function run({window,root}){
 const evaluate=code=>window.webContents.executeJavaScript(code),source=path.join(root,'keyboard-source'),target=path.join(root,'keyboard-target');
 await fs.mkdir(source);await fs.mkdir(target);await fs.writeFile(path.join(source,'instant.txt'),'keyboard paste');
 async function wait(expression){for(let i=0;i<250;i++){if(await evaluate(expression))return;await pause();}throw Error('Interaction timeout: '+expression);}
 function key(keyCode,modifiers=[]){window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});}
 async function click(selector,blank=false){const point=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+'),r=e.getBoundingClientRect();return {x:Math.round(r.x+30),y:Math.round('+(blank?'r.bottom-22':'r.y+r.height/2')+')};})()');window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});}
 window.show();window.focus();
 await evaluate('Promise.all([navigate(0,'+JSON.stringify(source)+'),navigate(1,'+JSON.stringify(target)+')])');
 await evaluate('document.querySelector("#search").focus()');await click('.pane:first-child .file-row');
 await wait('document.activeElement.closest(".pane")===state.panes[0].element');
 // No wait between copy and paste: the native write must finish before reading.
 key('c',['control']);await click('.pane:nth-child(2) .file-table',true);key('v',['control']);
 await wait('currentJobs.some(j=>j.destination==='+JSON.stringify(target)+'&&j.status==="completed")');assert.equal(await fs.readFile(path.join(target,'instant.txt'),'utf8'),'keyboard paste');
 await wait('document.querySelector("#operations-panel").hidden');await evaluate('document.querySelector("#show-operations").click()');assert(await evaluate('!document.querySelector("#operations-panel").hidden'));await new Promise(r=>setTimeout(r,1700));assert(await evaluate('!document.querySelector("#operations-panel").hidden'),'manually opened history stays visible');await evaluate('document.querySelector("#close-jobs").click()');
 const jobsBefore=await evaluate('currentJobs.length');for(const kind of ['copy','move']){const id=await evaluate('call(api.startOperation({kind:'+JSON.stringify(kind)+',sources:'+JSON.stringify([path.join(source,'instant.txt')])+',destination:'+JSON.stringify(source)+',drop:true}))');assert.equal(id,null);}
 await evaluate('navigate(1,'+JSON.stringify(source)+')');await evaluate('(async()=>{draggedPaths='+JSON.stringify([path.join(source,'instant.txt')])+';const table=state.panes[1].element.querySelector(".file-table");await table.ondrop({preventDefault(){},target:table,shiftKey:false,dataTransfer:new DataTransfer()});})()');assert.equal(await evaluate('currentJobs.length'),jobsBefore,'same-folder drop never enqueues a job');assert.deepEqual(await fs.readdir(source),['instant.txt']);await evaluate('navigate(1,'+JSON.stringify(target)+')');
 await fs.writeFile(path.join(source,'address.txt'),'address focus');await evaluate('load(0)');
 await evaluate('(()=>{const row=[...state.panes[0].element.querySelectorAll(".file-row")].find(r=>r.title==='+JSON.stringify(path.join(source,'address.txt'))+');row.click();})()');await evaluate('fileAction("copy",0)');
 await evaluate('editPath(1)');await click('.pane:nth-child(2) .file-table',true);
 await wait('document.activeElement===state.panes[1].element.querySelector(".file-table")');key('v',['control']);
 await wait('currentJobs.some(j=>j.sources?.includes('+JSON.stringify(path.join(source,'address.txt'))+')&&j.status==="completed")');
 for(let i=0;i<250;i++){try{if(await fs.readFile(path.join(target,'address.txt'),'utf8')==='address focus')break;}catch{}if(i===249)throw Error('Address-focused paste failed');await pause();}
 // Every static popup uses its positive button, even when Cancel has focus.
 const ids=await evaluate('[...document.querySelectorAll("dialog:not(#action-dialog)")].map(d=>d.id)');
 for(const id of ids){await evaluate('(()=>{const d=document.getElementById('+JSON.stringify(id)+');d.showModal();const primary=d.querySelector(".primary");if(!primary)throw Error("Missing default action: "+d.id);window.popupChoice=null;primary.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();window.popupChoice=d.id;},{once:true,capture:true});(d.querySelector("button[value=cancel],#nav-add-cancel,#cancel-columns,.popup-close")||primary).focus();})()');key('Enter');await wait('window.popupChoice==='+JSON.stringify(id));await evaluate('document.getElementById('+JSON.stringify(id)+').close("cancel")');}
 await evaluate('fileAction("mkdir",1);document.querySelector("#folder-name").value=""');key('Enter');await pause();assert(await evaluate('document.querySelector("#folder-dialog").open'),'required name prevents empty submission');await evaluate('document.querySelector("#folder-name").value="Enter folder"');key('Enter');
 for(let i=0;i<250;i++){try{if((await fs.stat(path.join(target,'Enter folder'))).isDirectory())break;}catch{}if(i===249)throw Error('Enter did not create folder');await pause();}
 const menu=await evaluate('(()=>{const saved=nativeMenu;let args;nativeMenu=(...values)=>{args=values;return Promise.resolve();};setActive(1);const row=state.panes[0].element.querySelector(".file-row");row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:400,clientY:250}));nativeMenu=saved;return {panel:state.active,request:args};})()');assert.equal(menu.panel,0);assert.equal(menu.request[0],0);assert.equal(menu.request[3],false);
 const savedDrag=window.webContents.startDrag;let nativeItem=null;window.webContents.startDrag=item=>{nativeItem=item;};
 try{await evaluate('api.startFileDrag('+JSON.stringify([path.join(source,'instant.txt'),path.join(source,'address.txt')])+')');for(let i=0;i<100&&!nativeItem;i++)await pause();assert(nativeItem,'preload IPC reaches native drag API');assert.deepEqual(nativeItem.files,[path.join(source,'instant.txt'),path.join(source,'address.txt')]);assert(!nativeItem.icon.isEmpty());}finally{window.webContents.startDrag=savedDrag;}
 return {passed:true,sameFolderDropNoOp:true,autoHideHistory:true,manualHistoryPreserved:true,nativeDragIPC:true,firstClickPaste:true,immediateCopyPaste:true,addressFocusPaste:true,allPopupsEnter:ids.length,requiredName:true,newFolderEnter:true,nativeRightClick:true};
}
module.exports={run};
