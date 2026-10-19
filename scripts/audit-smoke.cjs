const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run({window,root,clipboard}){
 const folder=path.join(root,'audit'),file=path.join(folder,'audit.txt');await fs.mkdir(folder);await fs.writeFile(file,'audit');const evaluate=code=>window.webContents.executeJavaScript(code);
 // File writes use a child process; path text must not be overwritten when it finishes later.
 await evaluate('Promise.all([call(api.writeClipboard({kind:"copy",paths:'+JSON.stringify([file])+'})),call(api.copyPaths('+JSON.stringify([file])+'))])');
 assert.deepEqual((await evaluate('call(api.readClipboard())')).paths,[]);assert.equal(await clipboard.readText(),'"'+file+'"');
 await evaluate('navigate(0,'+JSON.stringify(folder)+')');await evaluate('state.panes[0].element.querySelector(".file-row").click();fileAction("cut",0)');assert(await evaluate('!!state.panes[0].element.querySelector(".file-row.cut")'));
 await evaluate('fileAction("path",0)');assert(await evaluate('fileClipboard===null&&!state.panes[0].element.querySelector(".file-row.cut")'),'copying a path clears stale cut decorations');
 const count=await evaluate('(()=>{const saved=openEntry;let calls=0;openEntry=()=>{calls++;};try{const row=state.panes[0].element.querySelector(".file-row");row.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",repeat:true,bubbles:true,cancelable:true}));row.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true}));if(calls!==0)throw Error("Repeated or composing Enter opened a file");row.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));return calls;}finally{openEntry=saved;}})()');assert.equal(count,1);
 return {passed:true,clipboardWriteOrder:true,pathCopyClearsCut:true,heldEnterSingleOpen:true,imeEnterIgnored:true};
}
module.exports={run};
