// File interactions share the existing explorer state; filesystem access stays in main.
let fileClipboard=null,draggedPaths=null,renameSource=null,refreshTimer=null;
let clipboardQueue=Promise.resolve();
function clipboardTask(task){const next=clipboardQueue.catch(()=>{}).then(task);clipboardQueue=next;return next;}
async function readFileClipboard(){return clipboardTask(async()=>{if(api.readClipboard){const data=await call(api.readClipboard());fileClipboard=data.paths.length?data:null;}return fileClipboard;});}
let currentJobs=[];
let refreshFocused=true,pendingRefreshAll=false,pendingSearch=false,refreshRunning=false;
const pendingRefreshPaths=new Set();
const terminalJobs=new Set();
const activeJob=job=>['queued','scanning','running'].includes(job.status);
function selection(tab){if(!(tab.selection instanceof Set))tab.selection=new Set(tab.selected?[tab.selected]:[]);return tab.selection;}
function selectedEntries(index=state.active){const tab=tabOf(state.panes[index]);return tab.entries.filter(entry=>selection(tab).has(entry.path));}
function updateSelection(index){
  const pane=state.panes[index],tab=tabOf(pane),selected=selection(tab);
  pane.element.querySelectorAll('.file-row').forEach(row=>{const entry=pane.visibleEntries[Number(row.dataset.row)];const isSelected=selected.has(entry.path);row.classList.toggle('selected',isSelected);row.setAttribute('aria-selected',isSelected);const check=row.querySelector('.item-check');if(check)check.checked=isSelected;row.classList.toggle('cut',fileClipboard?.kind==='move'&&fileClipboard.paths.includes(entry.path));});
  pane.element.querySelector('.selection-info').textContent=selected.size>1?`${selected.size}개 선택`:selected.size?basename([...selected][0]):'';
  updateInspector(index);
  const bar=pane.element.querySelector('.file-actions');
  if(bar)bar.querySelectorAll('[data-file-action]').forEach(button=>{const action=button.dataset.fileAction;button.disabled=['rename','properties'].includes(action)?selected.size!==1:['copy','cut','trash'].includes(action)?!selected.size:action==='paste'?((!api.readClipboard&&!fileClipboard)||tab.search):false;});
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
    row.onclick=event=>chooseEntry(index,entry,event.target.closest('.item-check')?{ctrlKey:true}:event,sorted);
    row.ondblclick=event=>{if(!event.target.closest('.item-check'))openEntry(index,entry);};
    row.onkeydown=event=>{
      if(event.key==='Enter'&&!event.altKey&&!event.ctrlKey){event.preventDefault();openEntry(index,entry);}
      if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const columns=getComputedStyle(rows).gridTemplateColumns.split(' ').filter(v=>v&&v!=='none').length||1;const step=({ArrowDown:columns,ArrowUp:-columns,ArrowLeft:-1,ArrowRight:1})[event.key];const siblings=[...rows.querySelectorAll('[data-row]')],next=siblings[siblings.indexOf(row)+step];if(next){const item=sorted[Number(next.dataset.row)];if(!event.ctrlKey)chooseEntry(index,item,event,sorted);next.focus();}}
      if(event.key===' '){event.preventDefault();chooseEntry(index,entry,{ctrlKey:true},sorted);}
    };
    row.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();setActive(index);if(!selection(tab).has(entry.path))chooseEntry(index,entry,{},sorted);showFileMenu(index,event.clientX,event.clientY,false,event.shiftKey);};
    row.ondragstart=event=>{if(!selection(tab).has(entry.path))chooseEntry(index,entry,{},sorted);const paths=selectedEntries(index).map(item=>item.path);
      if(event.isTrusted&&api.startFileDrag){event.preventDefault();draggedPaths=null;api.startFileDrag(paths);return;}
      draggedPaths=paths;event.dataTransfer.setData('application/x-quadfinder',JSON.stringify(paths));event.dataTransfer.effectAllowed='copyMove';};
    row.ondragend=()=>{draggedPaths=null;document.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));};
  });
  updateSelection(index);
}
function bindPaneFeatures(index){
  const pane=state.panes[index],element=pane.element,tab=tabOf(pane),table=element.querySelector('.file-table');
  table.setAttribute('aria-multiselectable','true');table.tabIndex=0;
  table.addEventListener('pointerdown',event=>{if(event.button>2||event.target.closest('input,button,select,.columns'))return;setActive(index);(event.target.closest('.file-row')||table).focus({preventScroll:true});});
  bindMarquee(index,table,tab);
  element.querySelectorAll('[data-file-action]').forEach(button=>button.onclick=()=>fileAction(button.dataset.fileAction,index));
  table.oncontextmenu=event=>{event.preventDefault();setActive(index);selection(tab).clear();tab.selected=null;updateSelection(index);showFileMenu(index,event.clientX,event.clientY,true,event.shiftKey);};
  table.onclick=event=>{if(!event.target.closest('.file-row,.columns,.load-more,.group-heading')){selection(tab).clear();tab.selected=null;updateSelection(index);}};
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
function showFileMenu(index,x,y,background=false,extended=false){setActive(index);if(api.shellMenu&&!(background&&tabOf(state.panes[index]).search)&&!state.boot?.preview)return nativeMenu(index,x,y,background,undefined,extended);modernFileMenu(index,x,y,background);}

async function transfer(kind,sources,destination){
  try{if(!api.startOperation)throw new Error('예시 화면에서는 파일 작업을 실행할 수 없습니다.');const id=await call(api.startOperation({kind,sources,destination}));if(id)$('#operations-panel').hidden=false;return id;}
  catch(error){toast(error.message);return null;}
}
async function fileAction(action,index=state.active){
  const pane=state.panes[index],tab=tabOf(pane),entries=selectedEntries(index),destinationPath=tab.path;setActive(index);
  try{
    if(action==='menu'){const rect=pane.element.querySelector('[data-file-action="menu"]').getBoundingClientRect();showFileMenu(index,rect.left,rect.top,entries.length===0);}
    if(action==='copy'||action==='cut'){
      if(!entries.length)return toast('파일이나 폴더를 선택하세요.');
      const copied={kind:action==='cut'?'move':'copy',paths:entries.map(entry=>entry.path)};
      await clipboardTask(async()=>{if(api.writeClipboard)await call(api.writeClipboard(copied));fileClipboard=copied;});
      state.panes.forEach((_pane,i)=>updateSelection(i));toast(`${entries.length}개 항목 ${action==='cut'?'잘라내기':'복사'} · 대상 폴더에서 Ctrl+V`);
    }
    if(action==='paste'){
      const copied=await readFileClipboard();
      if(!copied)return toast('먼저 복사하거나 잘라내세요.');if(tab.search)return toast('대상 폴더 패널을 선택하세요.');
      const id=await transfer(copied.kind,copied.paths,destinationPath);if(id&&copied.kind==='move'&&fileClipboard===copied)fileClipboard=null;
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
    if(action==='path'&&entries.length&&api.copyPaths){await call(api.copyPaths(entries.map(entry=>entry.path)));toast('경로를 복사했습니다.');}
    if(['properties','openas'].includes(action)&&entries[0]&&api.shellMenu){const rect=pane.element.getBoundingClientRect();await nativeMenu(index,rect.x+40,rect.y+60,false,action==='openas'?'openas':'properties');return;}
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
function queueRefresh(paths=null){
  if(Array.isArray(paths))paths.forEach(value=>pendingRefreshPaths.add(value));else pendingRefreshAll=true;
  if(pendingRefreshPaths.size>4096){pendingRefreshPaths.clear();pendingRefreshAll=true;}
  pendingSearch=!!state.query;
  clearTimeout(refreshTimer);if(!refreshFocused)return;
  refreshTimer=setTimeout(flushRefresh,250);
}
async function flushRefresh(){
  if(!refreshFocused)return;
  if(document.body.classList.contains('selecting-files')||refreshRunning||document.querySelector('dialog[open],.path-input:not([hidden]):focus,#context-menu:not([hidden])')||currentJobs.some(activeJob)||state.panes.some((pane,i)=>i<state.layout&&tabOf(pane).loading)){refreshTimer=setTimeout(flushRefresh,250);return;}
  const paths=pendingRefreshAll?null:[...pendingRefreshPaths],search=pendingSearch;
  pendingRefreshAll=false;pendingRefreshPaths.clear();pendingSearch=false;refreshRunning=true;
  try{await Promise.all(state.panes.map((pane,i)=>i<state.layout&&!tabOf(pane).search&&ChangePolicy.affects(tabOf(pane).path,paths)?refreshTab(i):Promise.resolve()));if(search&&refreshFocused)await refreshSearch();}
  finally{refreshRunning=false;if(pendingRefreshAll||pendingRefreshPaths.size||pendingSearch)queueRefresh([]);}
}
function setRefreshFocus(focused){refreshFocused=focused;document.body.classList.toggle('app-unfocused',!focused);if(!focused){clearTimeout(refreshTimer);return;}scheduleSidebarRefresh();if(pendingRefreshAll||pendingRefreshPaths.size||pendingSearch)queueRefresh([]);}

function renderRoots(roots){
  state.boot.roots=roots;$('#scope-label').textContent=state.boot.automaticRoots?.length?`PC 전체 · ${state.boot.automaticRoots.length}개 드라이브`:`${roots.length}개 검색 폴더`;
  $('#root-list').innerHTML=roots.length?roots.map((root,i)=>`<div class="root-item"><span title="${escapeHTML(root)}">${escapeHTML(root)}</span>${state.boot.automaticRoots?.some(value=>navKey(value)===navKey(root))?'<small>자동 검색</small>':`<button data-remove-root="${i}" aria-label="${escapeHTML(root)} 검색 제외">제외</button>`}</div>`).join(''):'<p>검색 폴더를 추가하세요.</p>';
  $('#root-list').querySelectorAll('button').forEach(button=>button.onclick=()=>call(api.removeRoot(roots[Number(button.dataset.removeRoot)])).then(renderRoots).catch(error=>toast(error.message)));
  renderSidebar();
}
function initFeatures(boot){
  let undoState=boot.undo;
  const updateUndo=value=>{undoState=value;const button=$('#undo-operation');button.disabled=!value?.available&&!value?.busy;button.textContent=value?.busy?'처리 중단':'실행 취소';button.title=value?.busy?'내용 검증 또는 실행 취소 처리를 중단합니다.':value?.label?`${value.label} 실행 취소 (Ctrl+Z) · 이번 실행에서 최근 20개 작업`:'실행 취소 (Ctrl+Z) · 이번 실행에서 완료한 복사·이동·이름 변경';};
  updateUndo(boot.undo);api.onUndo?.(updateUndo);
  let updateState=boot.updater||{phase:'portable'};
  const updateUpdater=value=>{updateState=value;const button=$('#check-updates');button.textContent=value.phase==='preview'?'미리보기':value.phase==='ready'?'재시작하여 업데이트':['checking','downloading'].includes(value.phase)?'업데이트 중…':'업데이트';button.disabled=['preview','checking','downloading'].includes(value.phase);button.title=value.message||'업데이트 확인';};updateUpdater(updateState);api.onUpdater?.(updateUpdater);
  $('#check-updates').onclick=async()=>{try{if(!api.checkUpdates)return toast('설치 버전에서 업데이트를 사용할 수 있습니다.');if(updateState.phase==='ready'){await call(api.installUpdate());return;}if(['portable','manual'].includes(updateState.phase)){await call(api.openReleases());return;}const next=await call(api.checkUpdates());updateUpdater(next);if(['current','error'].includes(next.phase))toast(next.message);}catch(error){toast(error.message);}};
  $('#undo-operation').onclick=async()=>{if(!api.undo)return;if(undoState?.busy){if(api.cancelUndo)await call(api.cancelUndo());return;}$('#undo-operation').disabled=true;try{await call(api.undo());queueRefresh();toast('작업을 되돌렸습니다.');}catch(error){toast(error.message);} };
  const updateZoom=factor=>{$('#zoom-reset').textContent=`${Math.round(factor*100)}%`;};
  updateZoom(boot.zoomFactor||1);api.onZoom?.(updateZoom);
  api.onViewError?.(message=>toast(message));
  $('#zoom-reset').onclick=()=>{if(api.setZoom)call(api.setZoom(1)).then(updateZoom).catch(error=>toast(error.message));};
  let wheelDelta=0,lastWheel=0;
  document.addEventListener('wheel',event=>{
    if(!event.ctrlKey||event.altKey||event.deltaY===0||!api.adjustZoom)return;
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?40:event.deltaMode===2?innerHeight:1),now=performance.now();
    if(now-lastWheel>250||Math.sign(delta)!==Math.sign(wheelDelta))wheelDelta=0;
    lastWheel=now;wheelDelta+=delta;
    if(Math.abs(wheelDelta)<40)return;
    const direction=wheelDelta<0?1:-1;wheelDelta=0;
    call(api.adjustZoom(direction)).then(updateZoom).catch(error=>toast(error.message));
  },{passive:false,capture:true});
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
  setRefreshFocus(boot.smoke||document.hasFocus());
  window.addEventListener('blur',()=>setRefreshFocus(false));
  window.addEventListener('focus',()=>{setRefreshFocus(true);queueRefresh(state.panes.slice(0,state.layout).map(pane=>tabOf(pane).path));if(api.readClipboard)readFileClipboard().then(()=>{state.panes.forEach((_,i)=>updateSelection(i));}).catch(()=>{});});
  api.onOperations?.(renderJobs);api.onFilesChanged?.(queueRefresh);api.onRoots?.(renderRoots);renderJobs(boot.jobs||[]);renderRoots(boot.roots);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#context-menu'))$('#context-menu').hidden=true;});
  document.addEventListener('keydown',event=>{
    if((event.target instanceof Element&&event.target.closest('input:not([type="checkbox"]),textarea,select'))||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){$('#context-menu').hidden=true;return;}
    if(event.ctrlKey&&!event.shiftKey&&event.key.toLowerCase()==='z'){event.preventDefault();$('#context-menu').hidden=true;if(undoState?.busy)toast('내용을 검증하고 있습니다. 중단하려면 상단의 처리 중단을 누르세요.');else if(!$('#undo-operation').disabled)$('#undo-operation').click();else toast('실행 취소할 수 있는 완료 작업이 없습니다.');return;}
    const menu=$('#context-menu');if(!menu.hidden&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();return;}
    if(event.target instanceof Element&&event.target.closest('#sidebar')&&!(event.ctrlKey&&event.key.toLowerCase()==='v'))return;
    if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const row=document.activeElement.closest?.('.file-row'),rect=(row||state.panes[state.active].element.querySelector('.file-table')).getBoundingClientRect();showFileMenu(state.active,rect.x+20,rect.y+20,!selectedEntries().length,event.shiftKey);return;}
    const key=event.key.toLowerCase();let action;
    if(event.ctrlKey&&event.shiftKey&&key==='c')action='path';
    if(event.altKey&&key==='p'){event.preventDefault();setView(state.active,{inspector:viewOf(tabOf(state.panes[state.active])).inspector==='preview'?'off':'preview'});return;}
    if(event.ctrlKey&&!event.shiftKey)action=({c:'copy',x:'cut',v:'paste'})[key];
    if(event.key==='F2')action='rename';if(event.key==='Delete')action='trash';if(event.altKey&&event.key==='Enter')action='properties';
    if(event.ctrlKey&&event.shiftKey&&key==='n')action='mkdir';if(event.key==='F6')action='move-to';
    if(action){event.preventDefault();fileAction(action);}
    if(event.ctrlKey&&key==='a'){event.preventDefault();const pane=state.panes[state.active],tab=tabOf(pane);tab.selection=new Set((pane.visibleEntries||[]).slice(0,tab.limit||2000).map(entry=>entry.path));updateSelection(state.active);}
    if(event.ctrlKey&&key==='w'){event.preventDefault();const pane=state.panes[state.active];if(pane.tabs.length>1){pane.tabs.splice(pane.active,1);pane.active=Math.min(pane.active,pane.tabs.length-1);renderPane(state.active);load(state.active);save();}}
  });
}
