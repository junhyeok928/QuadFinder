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
 assert(await evaluate('document.activeElement.closest(".pane")===state.panes[0].element'),'file click moves keyboard focus out of search');
 // No wait between copy and paste: the native write must finish before reading.
 key('c',['control']);await click('.pane:nth-child(2) .file-table',true);key('v',['control']);
 await wait('currentJobs.some(j=>j.destination==='+JSON.stringify(target)+'&&j.status==="completed")');assert.equal(await fs.readFile(path.join(target,'instant.txt'),'utf8'),'keyboard paste');
 await fs.writeFile(path.join(source,'address.txt'),'address focus');await evaluate('load(0)');
 await evaluate('(()=>{const row=[...state.panes[0].element.querySelectorAll(".file-row")].find(r=>r.title==='+JSON.stringify(path.join(source,'address.txt'))+');row.click();})()');await evaluate('fileAction("copy",0)');
 await evaluate('editPath(1)');await click('.pane:nth-child(2) .file-table',true);
 assert(await evaluate('document.activeElement===state.panes[1].element.querySelector(".file-table")'),'address blur does not destroy the focused file list');key('v',['control']);
 await wait('currentJobs.some(j=>j.sources?.includes('+JSON.stringify(path.join(source,'address.txt'))+')&&j.status==="completed")');
 for(let i=0;i<250;i++){try{if(await fs.readFile(path.join(target,'address.txt'),'utf8')==='address focus')break;}catch{}if(i===249)throw Error('Address-focused paste failed');await pause();}
 // Every static popup uses its positive button, even when Cancel has focus.
 const ids=await evaluate('[...document.querySelectorAll("dialog:not(#action-dialog)")].map(d=>d.id)');
 for(const id of ids){await evaluate('(()=>{const d=document.getElementById('+JSON.stringify(id)+');d.showModal();const primary=d.querySelector(".primary");if(!primary)throw Error("Missing default action: "+d.id);window.popupChoice=null;primary.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();window.popupChoice=d.id;},{once:true,capture:true});(d.querySelector("button[value=cancel],#nav-add-cancel,#cancel-columns,.popup-close")||primary).focus();})()');key('Enter');await wait('window.popupChoice==='+JSON.stringify(id));await evaluate('document.getElementById('+JSON.stringify(id)+').close("cancel")');}
 await evaluate('fileAction("mkdir",1);document.querySelector("#folder-name").value=""');key('Enter');await pause();assert(await evaluate('document.querySelector("#folder-dialog").open'),'required name prevents empty submission');await evaluate('document.querySelector("#folder-name").value="Enter folder"');key('Enter');
 for(let i=0;i<250;i++){try{if((await fs.stat(path.join(target,'Enter folder'))).isDirectory())break;}catch{}if(i===249)throw Error('Enter did not create folder');await pause();}
 const menu=await evaluate('(()=>{const saved=nativeMenu;let args;nativeMenu=(...values)=>{args=values;return Promise.resolve();};setActive(1);const row=state.panes[0].element.querySelector(".file-row");row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:400,clientY:250}));nativeMenu=saved;return {panel:state.active,request:args};})()');assert.equal(menu.panel,0);assert.equal(menu.request[0],0);assert.equal(menu.request[3],false);
 return {passed:true,firstClickPaste:true,immediateCopyPaste:true,addressFocusPaste:true,allPopupsEnter:ids.length,requiredName:true,newFolderEnter:true,nativeRightClick:true};
}
module.exports={run};
