const assert=require('node:assert/strict');
async function run({window}){
 const evaluate=code=>window.webContents.executeJavaScript(code);await evaluate('state.panes[0].element.querySelector(".file-table").scrollTop=0;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const point=await evaluate('(()=>{const t=state.panes[0].element.querySelector(".file-table"),r=t.getBoundingClientRect();return {x:Math.round(r.left+80),y:Math.round(r.top+120),scrollable:t.scrollHeight>t.clientHeight};})()');assert(point.scrollable);
 window.webContents.sendInputEvent({type:'mouseWheel',x:point.x,y:point.y,deltaY:-300,deltaX:0,canScroll:true});
 const first=await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(state.panes[0].element.querySelector(".file-table").scrollTop)))))');
 await new Promise(r=>setTimeout(r,250));const settled=await evaluate('state.panes[0].element.querySelector(".file-table").scrollTop');assert(first>0,'wheel responds within three frames');assert(Math.abs(first-settled)<1,'wheel has no prolonged animation tail');
 return {passed:true,immediateWheel:true,noAnimationTail:true,first,settled};
}
module.exports={run};
