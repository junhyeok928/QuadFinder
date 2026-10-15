const viewModes=ViewOptions.modes,columnFields=ViewOptions.fields;
function viewOf(tab){return tab.options||(tab.options=ViewOptions.normalize({view:tab.view}));}
function folderKey(value){return value.replace(/\//g,'\\').replace(/([^:])\\$/,'$1').toLowerCase();}
function setView(index,patch){
  const pane=state.panes[index],tab=tabOf(pane);tab.options=ViewOptions.normalize({...viewOf(tab),...patch});tab.collapsed=new Set();
  state.folderViews[folderKey(tab.path)]=tab.options;
  if(!tab.options.showHidden)for(const entry of tab.entries)if(entry.hidden)selection(tab).delete(entry.path);
  setActive(index);renderPane(index);save();
}
function visibleSorted(index){
  const tab=tabOf(state.panes[index]),options=viewOf(tab);
  const entries=tab.entries.filter(entry=>options.showHidden||!entry.hidden);
  function compare(a,b){const sort=options.sort;let result=0;
    if(sort==='name')result=a.name.localeCompare(b.name,'ko',{numeric:true});
    else if(sort==='type')result=typeLabel(a).localeCompare(typeLabel(b),'ko');
    else if(['parent','extension'].includes(sort))result=String(a[sort]||'').localeCompare(String(b[sort]||''),'ko');
    else if(sort!=='none')result=(a[sort]||0)-(b[sort]||0);
    return Number(b.directory)-Number(a.directory)||result*(options.desc?-1:1)||a.name.localeCompare(b.name,'ko',{numeric:true});
  }
  if(options.sort!=='none')entries.sort(compare);
  if(options.group!=='none')entries.sort((a,b)=>ViewOptions.groupKey(a,options.group).localeCompare(ViewOptions.groupKey(b,options.group),'ko'));
  return entries;
}
function renderColumns(index){const tab=tabOf(state.panes[index]),options=viewOf(tab);return `<div class="columns">${options.columns.map(column=>`<div class="column" data-column="${column.id}" draggable="true"><button data-sort="${tab.search&&column.id==='modified'?'parent':column.id}" aria-label="${columnFields[column.id]} 정렬">${columnFields[tab.search&&column.id==='modified'?'parent':column.id]}${options.sort===column.id?(options.desc?' ↓':' ↑'):''}</button><span class="column-resize" role="separator" tabindex="0" aria-orientation="vertical" aria-label="${columnFields[column.id]} 열 너비" data-resize="${column.id}" title="드래그하여 너비 조절 · 더블클릭하여 자동 맞춤"></span></div>`).join('')}</div>`;}
function cellValue(entry,id){return id==='type'?typeLabel(entry):id==='size'?sizeLabel(entry):['modified','created','accessed'].includes(id)?entry[id]?dateLabel(entry[id]):'—':entry[id]||'—';}
function renderEntryCells(entry,tab){const options=viewOf(tab);return options.columns.map(column=>column.id==='name'?`<span class="file-name">${options.checkboxes?`<input class="item-check" type="checkbox" aria-label="${escapeHTML(entry.name)} 선택" ${selection(tab).has(entry.path)?'checked':''}>`:''}<span class="file-icon ${fileIcon(entry)}">${icon(fileIcon(entry))}</span><span class="entry-label">${escapeHTML(ViewOptions.displayName(entry,options))}${entry.link?' ↗':''}</span></span>`:`<span class="file-cell" data-field="${column.id}" title="${escapeHTML(cellValue(entry,tab.search&&column.id==='modified'?'parent':column.id))}">${escapeHTML(cellValue(entry,tab.search&&column.id==='modified'?'parent':column.id))}</span>`).join('')+(options.view==='content'||options.view==='tile'?`<span class="content-meta">${escapeHTML(typeLabel(entry))} · ${sizeLabel(entry)}<br>${escapeHTML(dateLabel(entry.modified))}${tab.search?`<br>${escapeHTML(entry.parent)}`:''}</span>`:'');}
function renderFileRows(index,entries){
  const pane=state.panes[index],tab=tabOf(pane),options=viewOf(tab);let previous=null;const collapsed=tab.collapsed||(tab.collapsed=new Set());
  const shown=entries.slice(0,tab.limit||2000);const counts=new Map();for(const entry of shown){const key=ViewOptions.groupKey(entry,options.group);counts.set(key,(counts.get(key)||0)+1);}
  return shown.map((entry,i)=>{let header='';const group=ViewOptions.groupKey(entry,options.group);
    if(options.group!=='none'&&group!==previous){previous=group;header=`<button class="group-heading" data-group="${escapeHTML(group)}" aria-expanded="${!collapsed.has(group)}">${collapsed.has(group)?'›':'⌄'} ${escapeHTML(group)} <small>(${counts.get(group)})</small></button>`;}
    return header+(collapsed.has(group)?'':`<div class="file-row ${selection(tab).has(entry.path)?'selected':''} ${entry.hidden?'hidden-file':''}" role="option" aria-selected="${selection(tab).has(entry.path)}" tabindex="0" data-row="${i}" title="${escapeHTML(entry.path)}">${renderEntryCells(entry,tab)}</div>`);
  }).join('');
}
function positionMenu(menu,x,y){menu.hidden=false;menu.style.left=`${Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-8))}px`;}
function menuIcon(name){const paths={cut:'M8 8l9 12M8 16L17 4M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',copy:'M8 8h12v13H8zM16 8V3H3v13h5',paste:'M8 5H4v16h16V5h-4M8 3h8v4H8z',rename:'M4 8v10h8M4 8h8M16 3v18m-3-18h6m-6 18h6',trash:'M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7m4-7v7',properties:'M12 11v7m0-12v1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',open:'M3 5h7l2 3h9l-3 12H3z',reveal:'M3 5h7l2 3h9v12H3z',other:'M3 4h18v16H3zM12 4v16',more:'M4 5h16v14H4zM8 9h8m-8 4h5',view:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',sort:'M4 6h14M4 12h10M4 18h6m10-6v9m-3-3 3 3 3-3',refresh:'M20 8a8 8 0 1 0 0 8m0-14v6h-6',mkdir:'M3 6h7l2 3h9v12H3zM15 12v6m-3-3h6',path:'M9 15l6-6M8 17l-2 2a4 4 0 0 1-5-5l5-5m10-2 2-2a4 4 0 0 1 5 5l-5 5'};return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.more}"/></svg>`;}
function menuButton(action,label,key='',disabled=false){return `<button role="menuitem" data-context="${action}" ${disabled?'disabled':''}>${menuIcon(action)}<span>${label}</span><kbd>${key}</kbd></button>`;}
function modernFileMenu(index,x,y,background=false){
  const menu=$('#context-menu'),entries=selectedEntries(index),tab=tabOf(state.panes[index]);menu.className='explorer-menu';
  const buttons=background?[]:[['cut','잘라내기'],['copy','복사'],['rename','이름 변경'],['trash','삭제']];
  menu.innerHTML=(buttons.length?`<div class="menu-command-bar">${buttons.map(([action,label])=>`<button role="menuitem" data-context="${action}" title="${label}" aria-label="${label}" ${action==='rename'&&entries.length!==1?'disabled':''}>${menuIcon(action)}</button>`).join('')}</div>`:'')+
    (background?menuButton('view','보기','›')+menuButton('sort','정렬 기준','›')+menuButton('group','그룹화 기준','›')+menuButton('refresh','새로 고침','F5')+'<hr>'+menuButton('paste','붙여넣기','Ctrl+V',tab.search||(!api.readClipboard&&!fileClipboard))+menuButton('mkdir','새 폴더','Ctrl+Shift+N',tab.search):menuButton('open','열기','Enter')+menuButton('openas','연결 프로그램', '',entries.length!==1||entries[0]?.directory)+menuButton('path','경로로 복사','Ctrl+Shift+C')+menuButton('reveal','파일 위치 열기')+menuButton('other','다른 패널에서 열기')+'<hr>'+menuButton('properties','속성','Alt+Enter',!entries.length))+'<hr>'+menuButton('more','더 많은 옵션 표시','Shift+우클릭',!api.shellMenu||(background&&tab.search));
  positionMenu(menu,x,y);menu.querySelectorAll('[data-context]').forEach(button=>button.onclick=()=>{menu.hidden=true;const action=button.dataset.context;if(['view','sort','group'].includes(action))showViewMenu(index,x,y,action==='view'?false:action);else if(action==='more')nativeMenu(index,x,y,background);else fileAction(action,index);});menu.querySelector('button:not(:disabled)')?.focus();
}
async function nativeMenu(index,x,y,background=false,verb){try{if(!api.shellMenu)return toast('Windows 시스템 메뉴는 데스크톱 앱에서 사용할 수 있습니다.');const tab=tabOf(state.panes[index]);const result=await call(api.shellMenu({paths:background?[tab.path]:selectedEntries(index).map(entry=>entry.path),background,x,y,verb}));if(result?.action==='rename')fileAction('rename',index);else queueRefresh();}catch(error){toast(error.message);}}
function showViewMenu(index,x,y,panel=false){
  const menu=$('#context-menu'),options=viewOf(tabOf(state.panes[index]));menu.className='explorer-menu view-menu';
  const choice=(key,value,label,checked)=>`<button role="${['showHidden','showExtensions','checkboxes'].includes(key)?'menuitemcheckbox':'menuitemradio'}" aria-checked="${checked}" data-view-key="${key}" data-view-value="${value}"><span class="menu-check">${checked?'✓':''}</span><span>${label}</span></button>`;
  const link=(value,label)=>`<button role="menuitem" data-view-panel="${value}">${menuIcon(value==='sort'?'sort':'view')}<span>${label}</span><kbd>›</kbd></button>`;
  const back='<button role="menuitem" data-view-back>‹ 보기 옵션</button><hr>';
  if(panel===true||panel==='sort')menu.innerHTML=back+`<div class="menu-section-label">정렬 기준</div>${['name','modified','type','size','created'].map(value=>choice('sort',value,columnFields[value],options.sort===value)).join('')}<hr>${choice('desc','false','오름차순',!options.desc)}${choice('desc','true','내림차순',options.desc)}`;
  else if(panel==='group')menu.innerHTML=back+`<div class="menu-section-label">그룹화 기준</div>${Object.entries({none:'없음',type:'유형',modified:'수정 날짜',size:'크기'}).map(([value,label])=>choice('group',value,label,options.group===value)).join('')}`;
  else if(panel==='show')menu.innerHTML=back+[['showHidden','숨긴 항목'],['showExtensions','파일 확장명'],['checkboxes','항목 확인란']].map(([key,label])=>choice(key,String(!options[key]),label,options[key])).join('');
  else menu.innerHTML=`<div class="menu-section-label">보기 방식</div>${Object.entries(viewModes).map(([value,label])=>choice('view',value,label,options.view===value)).join('')}<hr>${link('sort','정렬 기준')}${link('group','그룹화 기준')}${link('show','표시')}<hr>${Object.entries({off:'보조 창 닫기',preview:'미리보기 창',details:'세부 정보 창'}).map(([value,label])=>choice('inspector',value,label,options.inspector===value)).join('')}<hr><button role="menuitem" data-columns>열 선택 및 순서…</button><button role="menuitem" data-reset>이 폴더 보기 초기화</button>`;
  menu.scrollTop=0;positionMenu(menu,x,y);
  menu.querySelectorAll('[data-view-panel]').forEach(button=>button.onclick=()=>showViewMenu(index,x,y,button.dataset.viewPanel));menu.querySelector('[data-view-back]')?.addEventListener('click',()=>showViewMenu(index,x,y));
  menu.querySelectorAll('[data-view-key]').forEach(button=>button.onclick=()=>{menu.hidden=true;let value=button.dataset.viewValue;if(value==='true'||value==='false')value=value==='true';setView(index,{[button.dataset.viewKey]:value});});
  menu.querySelector('[data-columns]')?.addEventListener('click',()=>{menu.hidden=true;showColumnDialog(index);});menu.querySelector('[data-reset]')?.addEventListener('click',()=>{menu.hidden=true;setView(index,ViewOptions.normalize());});
  menu.querySelector('button')?.focus();
}

function showColumnDialog(index){
  const options=viewOf(tabOf(state.panes[index]));const dialog=$('#columns-dialog');let columns=options.columns.map(column=>({...column}));
  const render=()=>{const all=[...columns.map(column=>column.id),...Object.keys(columnFields).filter(id=>!columns.some(column=>column.id===id))];$('#column-options').innerHTML=all.map(id=>`<div class="column-option"><label><input type="checkbox" data-toggle-column="${id}" ${columns.some(column=>column.id===id)?'checked':''} ${id==='name'?'disabled':''}>${columnFields[id]}</label><button data-move-column="${id}" data-step="-1" aria-label="${columnFields[id]} 앞으로">↑</button><button data-move-column="${id}" data-step="1" aria-label="${columnFields[id]} 뒤로">↓</button></div>`).join('');
    dialog.querySelectorAll('[data-toggle-column]').forEach(input=>input.onchange=()=>{columns=input.checked?[...columns,{id:input.dataset.toggleColumn,width:150}]:columns.filter(column=>column.id!==input.dataset.toggleColumn);render();});
    dialog.querySelectorAll('[data-move-column]').forEach(button=>{const from=columns.findIndex(column=>column.id===button.dataset.moveColumn),to=from+Number(button.dataset.step);button.disabled=from<0||to<0||to>=columns.length;button.onclick=()=>{[columns[from],columns[to]]=[columns[to],columns[from]];render();};});
  };render();$('#cancel-columns').onclick=()=>dialog.close();$('#apply-columns').onclick=()=>{dialog.close();setView(index,{columns});};dialog.showModal();
}
function bindViewFeatures(index){
  const pane=state.panes[index],tab=tabOf(pane),options=viewOf(tab),element=pane.element;
  element.querySelector('.view-options').onclick=event=>{const r=event.currentTarget.getBoundingClientRect();showViewMenu(index,r.left,r.bottom);};
  const table=element.querySelector('.file-table');table.style.setProperty('--column-template',options.columns.map(column=>`${column.width}px`).join(' '));
  table.querySelectorAll('.group-heading').forEach(button=>button.onclick=event=>{event.stopPropagation();const set=tab.collapsed;set.has(button.dataset.group)?set.delete(button.dataset.group):set.add(button.dataset.group);renderRows(index);bindViewFeatures(index);});
  table.querySelector('.columns').oncontextmenu=event=>{event.preventDefault();event.stopPropagation();showColumnDialog(index);};
  let dragging;
  table.querySelectorAll('.column').forEach(column=>{column.ondragstart=event=>{dragging=column.dataset.column;event.dataTransfer.setData('application/x-quadfinder-column',dragging);};column.ondragover=event=>{if(dragging)event.preventDefault();};column.ondrop=event=>{if(!dragging)return;event.preventDefault();event.stopPropagation();const columns=[...options.columns],from=columns.findIndex(c=>c.id===dragging),to=columns.findIndex(c=>c.id===column.dataset.column);columns.splice(to,0,columns.splice(from,1)[0]);dragging=null;setView(index,{columns});};});
  table.querySelectorAll('[data-resize]').forEach(handle=>{
    const column=options.columns.find(c=>c.id===handle.dataset.resize);let drag;
    const apply=width=>{column.width=Math.max(65,Math.min(800,Math.round(width)));table.style.setProperty('--column-template',options.columns.map(c=>`${c.width}px`).join(' '));};
    handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();handle.parentElement.draggable=false;drag={x:event.clientX,width:column.width};handle.setPointerCapture(event.pointerId);};
    handle.onpointermove=event=>{if(drag)apply(drag.width+event.clientX-drag.x);};
    handle.onpointerup=handle.onpointercancel=()=>{if(drag){handle.parentElement.draggable=true;drag=null;state.folderViews[folderKey(tab.path)]=options;save();}};
    handle.ondblclick=()=>{const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font='14px Segoe UI';apply(Math.max(context.measureText(columnFields[column.id]).width,...(pane.visibleEntries||[]).slice(0,2000).map(entry=>context.measureText(column.id==='name'?ViewOptions.displayName(entry,options):cellValue(entry,tab.search&&column.id==='modified'?'parent':column.id)).width))+(column.id==='name'?64:28));state.folderViews[folderKey(tab.path)]=options;save();};
    handle.onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();apply(column.width+(event.key==='ArrowRight'?10:-10));state.folderViews[folderKey(tab.path)]=options;save();}};
  });
  element.querySelector('.close-inspector')?.addEventListener('click',()=>setView(index,{inspector:'off'}));
  updateInspector(index);
}
async function updateInspector(index){
  const pane=state.panes[index],tab=tabOf(pane),options=viewOf(tab),target=pane.element.querySelector('.inspector-content');if(!target||options.inspector==='off')return;
  const entries=selectedEntries(index),key=entries.map(e=>e.path+':'+e.modified).join('|')+':'+options.inspector;if(target.dataset.key===key)return;target.dataset.key=key;
  if(entries.length!==1){target.textContent=entries.length?`${entries.length}개 항목 선택 · ${sizeLabel({size:entries.reduce((sum,e)=>sum+(e.directory?0:e.size),0)})}`:'파일을 선택하세요.';return;}
  const entry=entries[0];target.textContent='불러오는 중…';
  try{const data=api.preview?await call(api.preview(entry.path)):{...entry,kind:'unsupported'};if(!target.isConnected||target.dataset.key!==key)return;
    if(options.inspector==='details'){target.innerHTML=`<div class="inspector-icon">${icon(fileIcon(entry))}</div><strong>${escapeHTML(data.name)}</strong><dl>${[['유형',typeLabel(entry)],['위치',data.path],['크기',data.directory?'폴더':sizeLabel(data)],['수정한 날짜',dateLabel(data.modified)],['만든 날짜',data.created?dateLabel(data.created):'—'],...(data.width?[['해상도',`${data.width} × ${data.height}`]]:[])].map(([key,value])=>`<dt>${key}</dt><dd>${escapeHTML(value)}</dd>`).join('')}</dl>`;}
    else if(data.kind==='image'){const image=document.createElement('img');image.src=data.image;image.alt=data.name;target.replaceChildren(image);}
    else if(data.kind==='text'){const pre=document.createElement('pre');pre.textContent=data.text;target.replaceChildren(pre);if(data.truncated)target.append('앞부분 128 KB만 표시합니다.');}
    else if(data.kind==='pdf'){const frame=document.createElement('iframe');frame.src=data.url;frame.title=data.name;target.replaceChildren(frame);}
    else target.textContent=data.kind==='folder'?'폴더를 선택했습니다.':data.message||'이 파일 형식은 미리보기를 지원하지 않습니다.';
  }catch(error){if(target.isConnected&&target.dataset.key===key)target.textContent=error.message;}
}
