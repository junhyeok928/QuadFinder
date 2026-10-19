// All confirmation content is rendered as text; only main-process requests can enqueue actions.
(()=>{
 for(const surface of document.querySelectorAll('dialog')){
  const heading=surface.querySelector('h2');if(!heading)continue;
  const bar=document.createElement('div');bar.className='popup-heading';heading.before(bar);bar.append(heading);
  const close=document.createElement('button');close.type='button';close.className='popup-close';close.setAttribute('aria-label','닫기');close.textContent='×';close.onclick=()=>surface.close('cancel');bar.append(close);
  if(!heading.id)heading.id=surface.id+'-title';surface.setAttribute('aria-labelledby',heading.id);
  surface.querySelectorAll('button[value="cancel"]').forEach(button=>button.formNoValidate=true);
  surface.addEventListener('cancel',event=>{event.preventDefault();surface.close('cancel');});
  surface.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
   event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
   const target=event.target.closest('[data-enter-action]');
   const confirm=target?surface.querySelector('#'+target.dataset.enterAction):surface.querySelector('.primary');
   if(confirm&&!confirm.disabled)confirm.click();
  },true);
 }
 const api=window.quadfind;if(!api?.onDialog)return;
 const queue=[];let current=null,previousFocus;
 const dialog=document.createElement('dialog');dialog.id='action-dialog';dialog.className='action-dialog';dialog.setAttribute('aria-labelledby','action-title');dialog.setAttribute('aria-describedby','action-description');
 dialog.innerHTML='<div class="action-heading"><span class="action-symbol" aria-hidden="true"></span><h2 id="action-title"></h2><button class="action-close" data-dialog-action="cancel" aria-label="닫기">×</button></div><p id="action-description"></p><div class="action-files"></div><div class="action-summary"></div><p class="action-note"></p><label class="action-apply"><input type="checkbox">이번 작업의 모든 충돌에 적용</label><div class="dialog-actions action-footer"></div>';
 document.body.append(dialog);
 const get=selector=>dialog.querySelector(selector);
 function respond(action){if(!current)return;const id=current.id,applyAll=get('.action-apply input').checked;current=null;dialog.close();api.replyDialog({id,action,applyAll}).catch(()=>{});previousFocus?.isConnected&&previousFocus.focus();showNext();}
 function showNext(){if(current||!queue.length)return;current=queue.shift();previousFocus=document.activeElement;
  get('#action-title').textContent=current.title;get('#action-description').textContent=current.description||'';get('.action-note').textContent=current.note||'';get('.action-note').hidden=!current.note;
  get('.action-symbol').innerHTML=icon(current.type==='danger'?'trash':current.type==='conflict'?'copy':'file');dialog.dataset.tone=current.type||'normal';
  get('.action-files').replaceChildren();const files=current.files||[],conflict=current.type==='conflict';
  for(const file of conflict?files.slice(0,1):files){
   const card=document.createElement('div');card.className='action-file';const glyph=document.createElement('span');glyph.className='action-file-icon';glyph.innerHTML=icon('file');const content=document.createElement('div');content.className='action-file-content';
   const name=document.createElement('strong');name.textContent=file.name||file.path;const location=document.createElement('span');location.className='action-file-path';location.textContent=file.path.replace(/[\\/][^\\/]+$/,'');location.title=file.path;content.append(name,location);card.append(glyph,content);get('.action-files').append(card);
  }
  get('.action-files').hidden=!files.length;
  get('.action-summary').replaceChildren();for(const file of files){if(!file.meta)continue;const meta=document.createElement('span');meta.textContent=(conflict?file.label+' ':files.length>1?file.name+' ':'')+(conflict?file.meta.split(' · ')[0]:file.meta);meta.title=file.path+' · '+file.meta;get('.action-summary').append(meta);}
  get('.action-summary').hidden=!get('.action-summary').childElementCount;
  get('.action-apply').hidden=!current.applyAll;get('.action-apply input').checked=false;get('.action-footer').replaceChildren();
  for(const [index,choice] of current.choices.entries()){const button=document.createElement('button');button.type='button';button.dataset.dialogAction=choice.action;button.disabled=choice.disabled===true;button.textContent=choice.label;button.title=choice.description||'';button.className=current.type==='danger'?'danger':index===current.choices.length-1?'primary':'';button.addEventListener('click',()=>respond(choice.action));get('.action-footer').append(button);}
  const cancel=document.createElement('button');cancel.type='button';cancel.dataset.dialogAction='cancel';cancel.textContent=current.cancelLabel||'취소';cancel.addEventListener('click',()=>respond('cancel'));if(!conflict)get('.action-footer').prepend(cancel);
  dialog.showModal();
  const confirm=current.choices.length===1?get('.action-footer button:not([data-dialog-action="cancel"]):not(:disabled)'):null;
  if(conflict)get('.action-footer button:not(:disabled)')?.focus();else (confirm||cancel).focus();
 }
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
  if(event.repeat){event.preventDefault();return;}
  event.preventDefault();event.stopImmediatePropagation();
  const focused=event.target.closest('.action-footer button:not([data-dialog-action="cancel"]):not(:disabled)');
  const confirm=focused||get('.action-footer button:not([data-dialog-action="cancel"]):not(:disabled)');
  if(confirm)confirm.click();else respond('cancel');
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();respond('cancel');});get('.action-close').onclick=()=>respond('cancel');
 api.onDialog(request=>{queue.push(request);showNext();});api.onDialogCancel(id=>{const index=queue.findIndex(request=>request.id===id);if(index>=0)queue.splice(index,1);if(current?.id===id){current=null;dialog.close();previousFocus?.isConnected&&previousFocus.focus();showNext();}});
})();
