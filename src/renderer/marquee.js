function bindMarquee(index,table,tab){
  let drag=null,suppressClick=false;
  const same=(a,b)=>a.size===b.size&&[...a].every(value=>b.has(value));
  function finish(cancel=false){
    if(!drag)return;const previous=drag;drag=null;cancelAnimationFrame(previous.frame);previous.listeners.abort();previous.box.remove();document.body.classList.remove('selecting-files');
    if(table.hasPointerCapture(previous.id))table.releasePointerCapture(previous.id);
    if(cancel){tab.selection=previous.base;tab.selected=previous.selected;tab.anchor=previous.anchor;if(tabOf(state.panes[index])===tab)updateSelection(index);}
    else if(previous.moved)tab.anchor=[...selection(tab)][0]||null;
    suppressClick=previous.moved;
  }
  table.cancelMarquee=()=>finish(true);
  table.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
  table.addEventListener('dragstart',event=>{if(drag)event.preventDefault();},true);
  table.addEventListener('pointerdown',event=>{
    suppressClick=false;
    if(event.button!==0||!event.isPrimary||event.target.closest('.columns,.load-more,.group-heading,input,button,.file-icon,.entry-label'))return;
    const rect=table.getBoundingClientRect();if(event.clientX>=rect.left+table.clientWidth||event.clientY>=rect.top+table.clientHeight)return;
    event.preventDefault();setActive(index);
    const box=document.createElement('div');box.className='selection-marquee';box.hidden=true;document.body.append(box);
    drag={id:event.pointerId,startX:event.clientX-rect.left+table.scrollLeft,startY:event.clientY-rect.top+table.scrollTop,clientX:event.clientX,clientY:event.clientY,downX:event.clientX,downY:event.clientY,base:new Set(selection(tab)),selected:tab.selected,anchor:tab.anchor,toggle:event.ctrlKey||event.metaKey,add:event.shiftKey,moved:false,box,listeners:new AbortController()};
    const signal=drag.listeners.signal;
    const tick=()=>{
      if(!drag)return;if(!table.isConnected||tabOf(state.panes[index])!==tab){finish(true);return;}
      const d=drag,r=table.getBoundingClientRect(),header=table.querySelector('.columns'),top=r.top+(header&&getComputedStyle(header).display!=='none'?header.getBoundingClientRect().height:0),right=r.left+table.clientWidth,bottom=r.top+table.clientHeight;
      if(!d.moved&&Math.hypot(d.clientX-d.downX,d.clientY-d.downY)>=4){d.moved=true;d.box.hidden=false;document.body.classList.add('selecting-files');table.setPointerCapture(d.id);}
      if(d.moved){
        const speed=(point,low,high)=>point<low+24?-Math.min(24,4+(low+24-point)/3):point>high-24?Math.min(24,4+(point-high+24)/3):0;
        table.scrollLeft+=speed(d.clientX,r.left,right);table.scrollTop+=speed(d.clientY,top,bottom);
        const x=Math.max(r.left,Math.min(right,d.clientX))-r.left+table.scrollLeft,y=Math.max(top,Math.min(bottom,d.clientY))-r.top+table.scrollTop;
        const left=Math.min(d.startX,x),upper=Math.min(d.startY,y),endX=Math.max(d.startX,x),endY=Math.max(d.startY,y);
        const drawLeft=Math.max(r.left,r.left+left-table.scrollLeft),drawTop=Math.max(top,r.top+upper-table.scrollTop),drawRight=Math.min(right,r.left+endX-table.scrollLeft),drawBottom=Math.min(bottom,r.top+endY-table.scrollTop);
        Object.assign(d.box.style,{left:drawLeft+'px',top:drawTop+'px',width:Math.max(0,drawRight-drawLeft)+'px',height:Math.max(0,drawBottom-drawTop)+'px'});
        const next=d.toggle||d.add?new Set(d.base):new Set();
        for(const item of table.querySelectorAll('.file-row[data-row]')){
          const bounds=item.getBoundingClientRect(),itemX=bounds.left-r.left+table.scrollLeft,itemY=bounds.top-r.top+table.scrollTop;
          if(itemX<endX&&itemX+bounds.width>left&&itemY<endY&&itemY+bounds.height>upper){const entry=state.panes[index].visibleEntries[Number(item.dataset.row)];if(entry){if(d.toggle&&d.base.has(entry.path))next.delete(entry.path);else next.add(entry.path);}}
        }
        if(!same(selection(tab),next)){tab.selection=next;tab.selected=[...next].at(-1)||null;updateSelection(index);}
      }
      if(drag)drag.frame=requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove',move=>{if(drag&&move.pointerId===drag.id){drag.clientX=move.clientX;drag.clientY=move.clientY;}},{signal});
    window.addEventListener('pointerup',up=>{if(drag&&up.pointerId===drag.id){drag.clientX=up.clientX;drag.clientY=up.clientY;cancelAnimationFrame(drag.frame);tick();finish();}},{signal});
    window.addEventListener('pointercancel',()=>finish(true),{signal});window.addEventListener('blur',()=>finish(true),{signal});
    table.addEventListener('lostpointercapture',()=>finish(true),{signal});
    window.addEventListener('keydown',key=>{if(key.key==='Escape'){key.preventDefault();key.stopImmediatePropagation();finish(true);}},{signal,capture:true});
    drag.frame=requestAnimationFrame(tick);
  });
}
