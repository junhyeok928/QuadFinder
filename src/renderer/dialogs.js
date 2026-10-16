// All confirmation content is rendered as text; only main-process requests can enqueue actions.
(()=>{
 const api=window.quadfind;if(!api?.onDialog)return;
 const queue=[];let current=null,previousFocus;
 const dialog=document.createElement('dialog');dialog.id='action-dialog';dialog.className='action-dialog';dialog.setAttribute('aria-labelledby','action-title');dialog.setAttribute('aria-describedby','action-description');
 dialog.innerHTML='<div class="action-heading"><span class="action-symbol" aria-hidden="true"></span><div><span class="action-eyebrow">QUADFINDER</span><h2 id="action-title"></h2></div><button class="action-close" aria-label="닫기">×</button></div><p id="action-description"></p><div class="action-files"></div><p class="action-note"></p><div class="action-choices"></div><label class="action-apply"><input type="checkbox">이번 작업의 모든 충돌에 적용</label><div class="dialog-actions action-footer"></div>';
 document.body.append(dialog);
 const get=selector=>dialog.querySelector(selector);
 function respond(action){if(!current)return;const id=current.id,applyAll=get('.action-apply input').checked;current=null;dialog.close();api.replyDialog({id,action,applyAll}).catch(()=>{});previousFocus?.isConnected&&previousFocus.focus();showNext();}
 function showNext(){if(current||!queue.length)return;current=queue.shift();previousFocus=document.activeElement;
  get('#action-title').textContent=current.title;get('#action-description').textContent=current.description||'';get('.action-note').textContent=current.note||'';get('.action-note').hidden=!current.note;
  get('.action-symbol').innerHTML=icon(current.type==='danger'?'trash':current.type==='conflict'?'copy':'document');dialog.dataset.tone=current.type||'normal';
  get('.action-files').replaceChildren();for(const file of current.files||[]){const card=document.createElement('div');card.className='action-file';const label=document.createElement('span');label.className='action-file-label';label.textContent=file.label||'';const name=document.createElement('strong');name.textContent=file.name||file.path;const location=document.createElement('span');location.className='action-file-path';location.textContent=file.path;location.title=file.path;const meta=document.createElement('span');meta.className='action-file-meta';meta.textContent=file.meta||'';card.append(label,name,location,meta);get('.action-files').append(card);}
  get('.action-files').hidden=!current.files?.length;
  get('.action-apply').hidden=!current.applyAll;get('.action-apply input').checked=false;get('.action-choices').replaceChildren();get('.action-footer').replaceChildren();
  for(const choice of current.choices){const button=document.createElement('button');button.type='button';button.dataset.dialogAction=choice.action;button.disabled=choice.disabled===true;button.addEventListener('click',()=>respond(choice.action));
   if(current.type==='conflict'){button.className='action-choice';const glyph=document.createElement('span');glyph.innerHTML=icon(choice.action==='overwrite'?'refresh':choice.action==='skip'?'right':'copy');const text=document.createElement('span');const title=document.createElement('strong');title.textContent=choice.label;const detail=document.createElement('small');detail.textContent=choice.description||'';text.append(title,detail);button.append(glyph,text);get('.action-choices').append(button);}
   else{button.textContent=choice.label;button.className=current.type==='danger'?'danger':'primary';get('.action-footer').append(button);}
  }
  const cancel=document.createElement('button');cancel.type='button';cancel.dataset.dialogAction='cancel';cancel.textContent=current.cancelLabel||'취소';cancel.addEventListener('click',()=>respond('cancel'));get('.action-footer').prepend(cancel);
  dialog.showModal();cancel.focus();
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();respond('cancel');});get('.action-close').onclick=()=>respond('cancel');
 api.onDialog(request=>{queue.push(request);showNext();});api.onDialogCancel(id=>{const index=queue.findIndex(request=>request.id===id);if(index>=0)queue.splice(index,1);if(current?.id===id){current=null;dialog.close();previousFocus?.isConnected&&previousFocus.focus();showNext();}});
})();
