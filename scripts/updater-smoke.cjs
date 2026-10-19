const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
async function run({window,updater,output}){
  const original=updater.snapshot();
  const visible=window.isVisible();
  if(process.argv.includes('--updater-test'))window.showInactive();
  try{
    const states=[{phase:'available',available:true,latestVersion:'v0.14.1',manualDownload:true,message:'v0.14.1 새 버전이 있습니다.'},{phase:'current',available:false,message:'최신 버전입니다.'}];
    for(const state of states){
      window.webContents.send('updater:changed',state);
      const result=await window.webContents.executeJavaScript(`(async()=>{
        const button=document.querySelector('#check-updates'),expected=${state.available};
        const deadline=Date.now()+3000;
        while(button.classList.contains('has-update')!==expected){if(Date.now()>deadline)throw Error('Update dot did not change');await new Promise(resolve=>setTimeout(resolve,20));}
        const style=getComputedStyle(button,'::after');
        return {dot:button.classList.contains('has-update'),content:style.content,width:style.width,colour:style.backgroundColor,label:button.getAttribute('aria-label'),disabled:button.disabled};
      })()`);
      assert.equal(result.dot,state.available);assert.equal(result.disabled,false);
      if(state.available){assert.ok(Math.abs(parseFloat(result.width)-6)<0.1);assert.equal(result.colour,'rgb(239, 68, 68)');assert.match(result.label,/새 버전 있음/);await new Promise(resolve=>setTimeout(resolve,150));await fs.writeFile(path.join(output,'update-dot.png'),(await window.webContents.capturePage({x:0,y:0,width:1520,height:40})).toPNG());}
      else assert.equal(result.content,'none');
    }
    return {availableDot:true,currentWithoutDot:true};
  }finally{window.webContents.send('updater:changed',original);if(!visible&&process.argv.includes('--updater-test'))window.hide();}
}
module.exports={run};
