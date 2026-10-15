// File interactions share the existing explorer state; filesystem access stays in main.
let fileClipboard=null,draggedPaths=null,renameSource=null,refreshTimer=null;
let currentJobs=[];
const terminalJobs=new Set();
const activeJob=job=>['queued','scanning','running'].includes(job.status);
function selection(tab){if(!(tab.selection instanceof Set))tab.selection=new Set(tab.selected?[tab.selected]:[]);return tab.selection;}
function selectedEntries(index=state.active){const tab=tabOf(state.panes[index]);return tab.entries.filter(entry=>selection(tab).has(entry.path));}
function updateSelection(index){
  const pane=state.panes[index],tab=tabOf(pane),selected=selection(tab);
  pane.element.querySelectorAll('.file-row').forEach(row=>{const entry=pane.visibleEntries[Number(row.dataset.row)];const isSelected=selected.has(entry.path);row.classList.toggle('selected',isSelected);row.setAttribute('aria-selected',isSelected);row.classList.toggle('cut',fileClipboard?.kind==='move'&&fileClipboard.paths.includes(entry.path));});
  pane.element.querySelector('.selection-info').textContent=selected.size>1?`${selected.size}개 선택`:selected.size?basename([...selected][0]):'';
  const bar=pane.element.querySelector('.file-actions');
  if(bar)bar.querySelectorAll('[data-file-action]').forEach(button=>{const action=button.dataset.fileAction;button.disabled=['rename','properties'].includes(action)?selected.size!==1:['copy','cut','trash'].includes(action)?!selected.size:action==='paste'?(!fileClipboard||tab.search):false;});
}
function chooseEntry(index,entry,event={},list=state.panes[index].visibleEntries){
  const tab=tabOf(state.panes[index]),selected=selection(tab);
  if(event.shiftKey&&tab.anchor){const from=list.findIndex(item=>item.path===tab.anchor),to=list.findIndex(item=>item.path===entry.path);if(!event.ctrlKey)selected.clear();if(from>=0)list.slice(Math.min(from,to),Math.max(from,to)+1).forEach(item=>selected.add(item.path));else selected.add(entry.path);}
  else if(event.ctrlKey||event.metaKey){selected.has(entry.path)?selected.delete(entry.path):selected.add(entry.path);tab.anchor=entry.path;}
  else{selected.clear();selected.add(entry.path);tab.anchor=entry.path;}
  tab.selected=entry.path;setActive(index);updateSelection(index);
}
function bindRows(index,rows,sorted){
  const pane=state.panes[index],tab=tabOf(pane);pane.visibleEntries=sorted;
  rows.querySelectorAll('[data-row]').forEach(row=>{
    const entry=sorted[Number(row.dataset.row)];row.draggable=true;
    row.onclick=event=>chooseEntry(index,entry,event,sorted);
    row.ondblclick=()=>openEntry(index,entry);
    row.onkeydown=event=>{
      if(event.key==='Enter'&&!event.altKey&&!event.ctrlKey){event.preventDefault();openEntry(index,entry);}
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const next=event.key==='ArrowDown'?row.nextElementSibling:row.previousElementSibling;if(next?.dataset.row!==undefined){const item=sorted[Number(next.dataset.row)];if(!event.ctrlKey)chooseEntry(index,item,event,sorted);next.focus();}}
      if(event.key===' '){event.preventDefault();chooseEntry(index,entry,{ctrlKey:true},sorted);}
    };
    row.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();if(!selection(tab).has(entry.path))chooseEntry(index,entry,{},sorted);showFileMenu(index,event.clientX,event.clientY);};
    row.ondragstart=event=>{if(!selection(tab).has(entry.path))chooseEntry(index,entry,{},sorted);draggedPaths=selectedEntries(index).map(item=>item.path);event.dataTransfer.setData('application/x-quadfinder',JSON.stringify(draggedPaths));event.dataTransfer.effectAllowed='copyMove';};
    row.ondragend=()=>{draggedPaths=null;document.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));};
  });
  updateSelection(index);
}
function bindPaneFeatures(index){
  const pane=state.panes[index],element=pane.element,tab=tabOf(pane),table=element.querySelector('.file-table');
  table.setAttribute('aria-multiselectable','true');
  element.querySelectorAll('[data-file-action]').forEach(button=>button.onclick=()=>fileAction(button.dataset.fileAction,index));
  table.oncontextmenu=event=>{event.preventDefault();setActive(index);showFileMenu(index,event.clientX,event.clientY,true);};
  table.onclick=event=>{if(!event.target.closest('.file-row,.columns,.load-more')){selection(tab).clear();tab.selected=null;updateSelection(index);}};
  table.ondragover=event=>{
    if(tab.search)return;event.preventDefault();event.dataTransfer.dropEffect=event.shiftKey?'move':'copy';
    element.classList.add('drop-target');
  };
  table.ondragleave=event=>{if(!table.contains(event.relatedTarget))element.classList.remove('drop-target');};
  table.ondrop=async event=>{
    event.preventDefault();element.classList.remove('drop-target');if(tab.search)return toast('파일을 받을 폴더 패널에 놓으세요.');
    let sources=draggedPaths;
    try{if(!sources&&event.dataTransfer.files.length&&api.dropPaths)sources=await api.dropPaths(Array.from(event.dataTransfer.files));}catch(error){toast(error.message);return;}
    if(!sources?.length)return;
    const row=event.target.closest('.file-row'),entry=row?pane.visibleEntries[Number(row.dataset.row)]:null;
    await transfer(event.shiftKey?'move':'copy',sources,entry?.directory?entry.path:tab.path);
    draggedPaths=null;
  };
  updateSelection(index);
}
function showFileMenu(index,x,y,background=false){
  const menu=$('#context-menu'),entries=selectedEntries(index),tab=tabOf(state.panes[index]);
  const actions=background?[['paste','붙여넣기','Ctrl V'],['mkdir','새 폴더','Ctrl Shift N'],['refresh','새로고침','F5']]:[['open','열기','Enter'],['reveal','Windows 탐색기에서 표시',''],['other','다른 패널에서 폴더 열기',''],['copy','복사','Ctrl C'],['cut','잘라내기','Ctrl X'],['paste','붙여넣기','Ctrl V'],['rename','이름 변경','F2'],['trash','휴지통으로 이동','Delete'],['properties','파일 정보','Alt Enter']];
  menu.innerHTML=actions.map(([action,label,key])=>`<button role="menuitem" data-context="${action}" ${((['rename','properties'].includes(action)&&entries.length!==1)||(action==='paste'&&(!fileClipboard||tab.search))||(action==='mkdir'&&tab.search))?'disabled':''}><span>${label}</span><kbd>${key}</kbd></button>`).join('');
  menu.hidden=false;menu.style.left=`${Math.min(x,innerWidth-menu.offsetWidth-8)}px`;menu.style.top=`${Math.min(y,innerHeight-menu.offsetHeight-8)}px`;
  menu.querySelectorAll('button').forEach(button=>button.onclick=()=>{menu.hidden=true;fileAction(button.dataset.context,index);});
  menu.querySelector('button:not(:disabled)')?.focus();
}
async function transfer(kind,sources,destination){
  try{if(!api.startOperation)throw new Error('예시 화면에서는 파일 작업을 실행할 수 없습니다.');const id=await call(api.startOperation({kind,sources,destination}));if(id)$('#operations-panel').hidden=false;return id;}
  catch(error){toast(error.message);return null;}
}
async function fileAction(action,index=state.active){
  const pane=state.panes[index],tab=tabOf(pane),entries=selectedEntries(index);setActive(index);
  try{
    if(action==='menu'){const rect=pane.element.querySelector('[data-file-action="menu"]').getBoundingClientRect();showFileMenu(index,rect.left,rect.top,entries.length===0);}
    if(action==='copy'||action==='cut'){
      if(!entries.length)return toast('파일이나 폴더를 선택하세요.');
      fileClipboard={kind:action==='cut'?'move':'copy',paths:entries.map(entry=>entry.path)};
      state.panes.forEach((_pane,i)=>updateSelection(i));toast(`${entries.length}개 항목 ${action==='cut'?'잘라내기':'복사'} · 대상 폴더에서 Ctrl+V`);
    }
    if(action==='paste'){
      if(!fileClipboard)return toast('먼저 복사하거나 잘라내세요.');if(tab.search)return toast('대상 폴더 패널을 선택하세요.');
      const id=await transfer(fileClipboard.kind,fileClipboard.paths,tab.path);if(id&&fileClipboard.kind==='move')fileClipboard=null;
      state.panes.forEach((_pane,i)=>updateSelection(i));
    }
    if(action==='copy-to'||action==='move-to'){
      if(!entries.length)return toast('파일이나 폴더를 선택하세요.');const destination=await call(api.chooseFolder(false));if(destination)await transfer(action==='move-to'?'move':'copy',entries.map(entry=>entry.path),destination);
    }
    if(action==='trash'&&entries.length)await transfer('trash',entries.map(entry=>entry.path));
    if(action==='rename'){
      if(entries.length!==1)return toast('이름을 변경할 항목 하나를 선택하세요.');renameSource=entries[0].path;$('#rename-path').textContent=renameSource;$('#rename-name').value=entries[0].name;$('#rename-dialog').showModal();$('#rename-name').focus();const end=entries[0].directory?entries[0].name.length:entries[0].name.lastIndexOf('.');$('#rename-name').setSelectionRange(0,end>0?end:entries[0].name.length);
    }
    if(action==='mkdir'&&!tab.search){$('#folder-parent').textContent=tab.path;$('#folder-name').value='';$('#folder-dialog').showModal();$('#folder-name').focus();}
    if(action==='refresh')await load(index);
    if(action==='open'&&entries[0]){if(entries[0].directory)await navigate(index,entries[0].path);else await call(api.open(entries[0].path));}
    if(action==='reveal'&&entries[0])await call(api.reveal(entries[0].path));
    if(action==='other'&&entries[0]){if(state.layout===1)applyLayout(2);const target=index===0?1:0;await navigate(target,entries[0].directory?entries[0].path:entries[0].parent);setActive(target);}
    if(action==='properties'&&entries[0]){
      const entry=entries[0];$('#properties-content').innerHTML=`<dl><dt>이름</dt><dd>${escapeHTML(entry.name)}</dd><dt>위치</dt><dd>${escapeHTML(entry.path)}</dd><dt>유형</dt><dd>${escapeHTML(typeLabel(entry))}</dd><dt>크기</dt><dd>${entry.directory?'폴더':`${sizeLabel(entry)} (${entry.size.toLocaleString()} 바이트)`}</dd><dt>수정</dt><dd>${escapeHTML(dateLabel(entry.modified))}</dd></dl>`;$('#properties-dialog').showModal();
    }
  }catch(error){toast(error.message);}
}
function renderJobs(jobs){
  currentJobs=jobs;$('#job-count').textContent=jobs.filter(activeJob).length;
  const labels={copy:'복사',move:'이동',trash:'휴지통 이동'},statuses={queued:'대기 중',scanning:'파일 확인 중',running:'진행 중',completed:'완료',partial:'일부 실패',failed:'실패',cancelled:'취소됨'};
  $('#job-list').innerHTML=jobs.length?[...jobs].reverse().map(job=>`<article class="job"><div><strong>${labels[job.kind]} · ${statuses[job.status]}</strong>${activeJob(job)?`<button data-cancel="${job.id}">취소</button>`:''}</div><progress max="100" value="${job.status==='completed'?100:job.totalBytes?Math.min(99,100*job.bytes/job.totalBytes):job.total?100*job.done/job.total:0}"></progress><p>${job.done}/${job.total}개 완료${job.skipped?` · ${job.skipped}개 건너뜀`:''}</p>${job.current?`<small title="${escapeHTML(job.current)}">${escapeHTML(job.current)}</small>`:''}${job.errors.length?`<details><summary>${job.errors.length}개 오류 확인</summary>${job.errors.map(error=>`<p>${escapeHTML(error.path)}<br>${escapeHTML(error.message)}</p>`).join('')}</details>`:''}</article>`).join(''):'<div class="empty-jobs">진행 중인 파일 작업이 없습니다.</div>';
  $('#job-list').querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>call(api.cancelOperation(button.dataset.cancel)).catch(error=>toast(error.message)));
  for(const job of jobs)if(!activeJob(job)&&!terminalJobs.has(job.id)){terminalJobs.add(job.id);queueRefresh();toast(`${labels[job.kind]} ${statuses[job.status]} · ${job.done}개 완료${job.errors.length?' · 작업 창에서 오류를 확인하세요.':''}`);}
}
function queueRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{if(document.querySelector('dialog[open],.path-input:not([hidden]):focus')||currentJobs.some(activeJob)){queueRefresh();return;}await Promise.all(state.panes.map((_pane,i)=>tabOf(state.panes[i]).search?Promise.resolve():load(i,true)));if(state.query)runSearch();},250);}
function renderRoots(roots){
  state.boot.roots=roots;$('#scope-label').textContent=`${roots.length}개 검색 폴더`;
  $('#root-list').innerHTML=roots.length?roots.map((root,i)=>`<div class="root-item"><span title="${escapeHTML(root)}">${escapeHTML(root)}</span><button data-remove-root="${i}" aria-label="${escapeHTML(root)} 검색 제외">제외</button></div>`).join(''):'<p>검색 폴더를 추가하세요.</p>';
  $('#root-list').querySelectorAll('button').forEach(button=>button.onclick=()=>call(api.removeRoot(roots[Number(button.dataset.removeRoot)])).then(renderRoots).catch(error=>toast(error.message)));
  const custom=roots.filter(root=>!state.boot.places.some(place=>place.path.toLowerCase()===root.toLowerCase()));
  $('#custom-places').innerHTML=custom.map((root,i)=>`<button data-root-nav="${i}" title="${escapeHTML(root)}">${icon('folder-blue')}<span>${escapeHTML(basename(root))}</span></button>`).join('');
  $('#custom-places').querySelectorAll('button').forEach(button=>button.onclick=()=>navigate(state.active,custom[Number(button.dataset.rootNav)]));
}
function initFeatures(boot){
  $('#rename-dialog').addEventListener('close',async()=>{if($('#rename-dialog').returnValue!=='rename')return;try{await call(api.rename(renameSource,$('#rename-name').value));queueRefresh();}catch(error){toast(error.message);}});
  $('#close-properties').onclick=()=>$('#properties-dialog').close();
  $('#manage-roots').onclick=()=>{$('#roots-dialog').showModal();renderRoots(state.boot.roots);};
  $('#close-roots').onclick=()=>$('#roots-dialog').close();
  $('#add-root').onclick=async()=>{try{const root=await call(api.chooseFolder());if(root&&!state.boot.roots.includes(root))renderRoots([...state.boot.roots,root]);}catch(error){toast(error.message);}};
  $('#add-root-path').onclick=async()=>{try{const roots=await call(api.addRoot($('#root-path').value.trim()));renderRoots(roots);$('#root-path').value='';}catch(error){toast(error.message);}};
  $('#root-path').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('#add-root-path').click();}};
  $('#show-operations').onclick=()=>$('#operations-panel').hidden=!$('#operations-panel').hidden;
  $('#close-jobs').onclick=()=>$('#operations-panel').hidden=true;
  $('#clear-jobs').onclick=()=>api.clearOperations?call(api.clearOperations()).catch(error=>toast(error.message)):renderJobs([]);
  api.onOperations?.(renderJobs);api.onFilesChanged?.(queueRefresh);api.onRoots?.(renderRoots);renderJobs(boot.jobs||[]);renderRoots(boot.roots);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#context-menu'))$('#context-menu').hidden=true;});
  document.addEventListener('keydown',event=>{
    if((event.target instanceof Element&&event.target.closest('input,textarea'))||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){$('#context-menu').hidden=true;return;}
    const menu=$('#context-menu');if(!menu.hidden&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();return;}
    const key=event.key.toLowerCase();let action;
    if(event.ctrlKey&&!event.shiftKey)action=({c:'copy',x:'cut',v:'paste'})[key];
    if(event.key==='F2')action='rename';if(event.key==='Delete')action='trash';if(event.altKey&&event.key==='Enter')action='properties';
    if(event.ctrlKey&&event.shiftKey&&key==='n')action='mkdir';if(event.key==='F6')action='move-to';
    if(action){event.preventDefault();fileAction(action);}
    if(event.ctrlKey&&key==='a'){event.preventDefault();const pane=state.panes[state.active],tab=tabOf(pane);tab.selection=new Set((pane.visibleEntries||[]).slice(0,tab.limit||2000).map(entry=>entry.path));updateSelection(state.active);}
    if(event.ctrlKey&&key==='w'){event.preventDefault();const pane=state.panes[state.active];if(pane.tabs.length>1){pane.tabs.splice(pane.active,1);pane.active=Math.min(pane.active,pane.tabs.length-1);renderPane(state.active);load(state.active);save();}}
  });
}
