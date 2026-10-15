const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run({window,root}){
 const evaluate=code=>window.webContents.executeJavaScript(code),pause=()=>new Promise(r=>setTimeout(r,60)),wait=async code=>{for(let i=0;i<250;i++){if(await evaluate(code))return;await pause();}throw new Error('Undo UI timeout: '+code);};
 const source=path.join(root,'undo-source'),target=path.join(root,'undo-target');await fs.mkdir(source);await fs.mkdir(target);const file=path.join(source,'undo.txt'),copy=path.join(target,'undo.txt');await fs.writeFile(file,'original');
 await evaluate(`navigate(0,${JSON.stringify(target)}).then(()=>setActive(0))`);await evaluate(`call(api.startOperation({kind:'copy',sources:[${JSON.stringify(file)}],destination:${JSON.stringify(target)}}))`);await wait(`!document.querySelector('#undo-operation').disabled&&!currentJobs.some(activeJob)`);assert.equal(await fs.readFile(copy,'utf8'),'original');
 await evaluate(`document.querySelector('#undo-operation').click()`);for(let i=0;i<150;i++){try{await fs.stat(copy);}catch(error){if(error.code==='ENOENT')break;throw error;}await pause();}await assert.rejects(fs.stat(copy),{code:'ENOENT'});assert.equal(await fs.readFile(file,'utf8'),'original');
 await wait(`document.querySelector('#undo-operation').textContent==='실행 취소'`);
 const renamed=path.join(source,'renamed.txt');await evaluate(`call(api.rename(${JSON.stringify(file)},'renamed.txt'))`);await wait(`!document.querySelector('#undo-operation').disabled`);window.webContents.sendInputEvent({type:'keyDown',keyCode:'z',modifiers:['control']});window.webContents.sendInputEvent({type:'keyUp',keyCode:'z',modifiers:['control']});for(let i=0;i<150;i++){try{await fs.stat(file);break;}catch{}await pause();}assert.equal(await fs.readFile(file,'utf8'),'original');await assert.rejects(fs.stat(renamed),{code:'ENOENT'});
 return {passed:true,copy:true,rename:true,ctrlZ:true,sourcePreserved:true};
}
module.exports={run};
