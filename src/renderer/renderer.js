const api = window.quadfind;
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = { panes: [], layout: 4, sidebarWidth: 184, active: 0, query: '', filter: 'all', request: 0, boot: null, folderViews:{} };
let toastTimer, searchTimer, saveTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
async function call(promise) { const result = await promise; if (!result.ok) throw new Error(result.error); return result.value; }
function tabOf(pane) { return pane.tabs[pane.active]; }
function basename(path) { return path.replace(/[\\/]$/, '').split(/[\\/]/).pop() || path; }
function tabLabel(path) { return state.boot?.places.find(place => place.path === path)?.label || basename(path); }
function tabIcon(tab) { return tab.search ? 'search' : state.boot?.places.find(place => place.path === tab.path)?.icon === 'download' ? 'download' : 'folder-blue'; }
function breadcrumbs(value) {
  const normalized=value.replace(/\\/g,'/'),network=normalized.startsWith('//'),parts=normalized.split('/').filter(Boolean);
  const start=network?2:1,segments=[];
  for(let count=start;count<=parts.length;count++){
    const location=(network?'\\\\':'')+parts.slice(0,count).join('\\')+'\\';
    const label=network&&count===2?'\\\\'+parts.slice(0,2).join('\\'):parts[count-1];
    segments.push(`${segments.length?icon('chevron'):''}<button data-breadcrumb="${escapeHTML(location)}" title="${escapeHTML(location)}">${escapeHTML(label)}</button>`);
  }
  return segments.join('');
}
function fileIcon(entry) {
  if (entry.directory) return 'folder';
  const ext = entry.name.split('.').pop().toLowerCase();
  return ({doc:'word',docx:'word',xls:'excel',xlsx:'excel',csv:'excel',ppt:'powerpoint',pptx:'powerpoint',pdf:'pdf',psd:'photoshop',ai:'illustrator',exe:'application',msi:'application',txt:'file',md:'file'})[ext] || fileType(entry);
}
function typeLabel(entry) {
  if (entry.directory) return '파일 폴더';
  const ext = entry.name.split('.').pop().toLowerCase();
  return ({docx:'Microsoft Word 문서',doc:'Microsoft Word 문서',xlsx:'Microsoft Excel 워크시트',xls:'Microsoft Excel 워크시트',pptx:'Microsoft PowerPoint 문서',pdf:'PDF 문서',txt:'텍스트 문서',md:'Markdown 문서',csv:'Microsoft Excel CSV',psd:'Adobe Photoshop 문서',ai:'Adobe Illustrator 문서',exe:'응용 프로그램',zip:'압축(ZIP) 폴더',mp4:'MP4 동영상'})[ext] || `${ext.toUpperCase()} ${fileType(entry)==='image'?'이미지':'파일'}`;
}
const thumbnails = new Map();
async function decorateThumbnails(rows, entries) {
  if (!api.thumbnail) return;
  const targets = Array.from(rows.querySelectorAll('[data-row]')).filter(row => fileType(entries[Number(row.dataset.row)]) === 'image').slice(0,60);
  // Restrict concurrent shell thumbnail requests and retain a small, bounded cache.
  for (let offset=0; offset<targets.length; offset+=4) await Promise.all(targets.slice(offset,offset+4).map(async row => {
    const entry=entries[Number(row.dataset.row)], key=`${entry.path}:${entry.modified}`;
    try {
      let image=thumbnails.get(key);
      if(image===undefined){image=await call(api.thumbnail(entry.path));if(thumbnails.size>=256)thumbnails.delete(thumbnails.keys().next().value);thumbnails.set(key,image);}
      const allowed=/^data:image\/(png|jpeg|webp);base64,/.test(image) || (state.boot?.preview && /^data:image\/svg\+xml;base64,/.test(image));
      if(image && allowed && row.isConnected){const holder=row.querySelector('.file-icon');const img=document.createElement('img');img.src=image;img.alt='';holder.replaceChildren(img);holder.classList.add('thumbnail');}
    } catch { /* The colour file icon remains when Windows has no thumbnail. */ }
  }));
}
function fileType(entry) {
  if (entry.directory) return 'folder';
  if (/\.(png|jpe?g|svg|gif|webp|bmp|avif)$/i.test(entry.name)) return 'image';
  if (/\.(js|cjs|ts|tsx|json|html|css|py|rs|cs|yml)$/i.test(entry.name)) return 'code';
  if (/\.(zip|7z|rar|tar|gz)$/i.test(entry.name)) return 'archive';
  if (/\.(mp4|mov|mkv|avi)$/i.test(entry.name)) return 'video';
  if (/\.(mp3|wav|flac|m4a)$/i.test(entry.name)) return 'music';
  if (/\.(docx?|xlsx?|pptx?|txt|md|pdf|hwp|hwpx|csv)$/i.test(entry.name)) return 'document';
  return 'file';
}
function sizeLabel(entry) { if (entry.directory) return '—'; const bytes = entry.size; if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`; if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`; return `${(bytes / 1073741824).toFixed(1)} GB`; }
function dateLabel(value) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => call(api.saveLayout({ layout: state.layout, sidebarWidth: state.sidebarWidth, navigation:navState(), folderViews:state.folderViews, panes: state.panes.map(pane => ({ active: pane.active, tabs: pane.tabs.map(tab => ({path:tab.path,view:tab.view,options:viewOf(tab)})) })) })).catch(error => toast(`레이아웃 저장 실패: ${error.message}`)), 150); }
function setupSidebar(savedWidth) {
  const sidebar=$('#sidebar'), handle=$('#sidebar-resizer');
  let drag=null;
  const maxWidth=()=>Math.max(150,Math.min(400,window.innerWidth-640));
  function applyWidth(width, remember=true) {
    const preferred=Number.isFinite(width)?Math.max(150,Math.min(400,Math.round(width))):184;
    const actual=Math.min(preferred,maxWidth());
    if(remember)state.sidebarWidth=preferred;
    sidebar.style.width=`${actual}px`;
    handle.setAttribute('aria-valuenow',actual);
    handle.setAttribute('aria-valuemax',maxWidth());
    handle.setAttribute('aria-valuetext',`${actual}픽셀`);
  }
  function finish(cancel=false) {
    if(!drag)return;
    const previous=drag;drag=null;
    if(cancel)applyWidth(previous.preferred);
    document.body.classList.remove('resizing-sidebar');
    if(handle.hasPointerCapture(previous.id))handle.releasePointerCapture(previous.id);
    if(!cancel)save();
  }
  applyWidth(savedWidth);
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||drag)return;
    event.preventDefault();handle.focus();
    drag={id:event.pointerId,x:event.clientX,width:sidebar.getBoundingClientRect().width,preferred:state.sidebarWidth};
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-sidebar');
  });
  handle.addEventListener('pointermove',event=>{
    if(drag&&event.pointerId===drag.id)applyWidth(Math.min(maxWidth(),drag.width+event.clientX-drag.x));
  });
  handle.addEventListener('pointerup',()=>finish());
  handle.addEventListener('pointercancel',()=>finish(true));
  handle.addEventListener('lostpointercapture',()=>finish());
  window.addEventListener('blur',()=>finish());
  window.addEventListener('resize',()=>applyWidth(state.sidebarWidth,false));
  handle.addEventListener('dblclick',()=>{applyWidth(184);save();});
  handle.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Escape'){finish(true);return;}
    const current=sidebar.getBoundingClientRect().width,step=event.shiftKey?20:10;
    applyWidth(event.key==='Home'?150:event.key==='End'?maxWidth():current+(event.key==='ArrowRight'?step:-step));
    save();
  });
}
function setActive(index) { state.active = index;syncSidebar(); document.querySelectorAll('.pane').forEach((element, i) => element.classList.toggle('active', i === index)); }
function syncSidebar(){
  const pane=state.panes[state.active];if(!pane)return;
  const tab=tabOf(pane),current=ChangePolicy.key(tab.path),buttons=[...document.querySelectorAll('nav [data-location]')];
  const selected=tab.search?null:buttons.filter(button=>!button.closest('.nav-children[hidden]')).filter(button=>{const key=ChangePolicy.key(button.dataset.location);return current===key||current.startsWith(key+'\\');}).sort((a,b)=>b.dataset.location.length-a.dataset.location.length||Number(a.closest('.nav-item')?.dataset.depth||0)-Number(b.closest('.nav-item')?.dataset.depth||0))[0];
  buttons.forEach(button=>{const active=button===selected;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));if(active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');});
  document.querySelectorAll('[data-nav-section]').forEach(button=>{const group=$('#'+button.getAttribute('aria-controls'));button.classList.toggle('section-current',!!selected&&group.hidden&&group.contains(selected));});
  syncRecentFolders();
}
function applyLayout(value) { state.layout = value; if (state.active >= value) state.active = 0; $('#panes').className = `panes layout-${value}`; document.querySelectorAll('[data-layout]').forEach(button => { const active = Number(button.dataset.layout) === value; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }); state.panes.forEach((pane, i) => { pane.element.hidden = i >= value; }); setActive(state.active); save();if(window.__quadfinderReady)queueRefresh(state.panes.slice(0,value).map(pane=>tabOf(pane).path)); }

function renderPane(index) {
  const pane = state.panes[index], tab = tabOf(pane), element = pane.element;
  element.innerHTML = `<div class="tabs-bar"><div class="tabs">${pane.tabs.map((item,i) => `<div class="tab ${pane.active===i?'current':''}"><button data-tab="${i}" title="${escapeHTML(item.path)}">${icon(tabIcon(item))}<span>${escapeHTML(item.search?'검색 결과':tabLabel(item.path))}</span></button><button class="close-tab" data-close="${i}" aria-label="${escapeHTML(tabLabel(item.path))} 탭 닫기">×</button></div>`).join('')}</div><select class="view-mode" aria-label="패널 ${index+1} 보기 방식">${Object.entries(viewModes).map(([value,label])=>`<option value="${value}" ${tab.view===value?"selected":""}>${label}</option>`).join("")}</select><button class="view-options" title="보기 옵션" aria-label="패널 ${index+1} 보기 옵션">${menuIcon('view')}</button><button class="new-tab" title="새 탭 (Ctrl+T)" aria-label="패널 ${index+1} 새 탭">${icon('plus')}</button></div>
    <div class="navigation"><button data-action="back" title="뒤로" aria-label="패널 ${index+1} 뒤로" ${tab.cursor<=0?'disabled':''}>${icon('left')}</button><button data-action="forward" title="앞으로" aria-label="패널 ${index+1} 앞으로" ${tab.cursor>=tab.history.length-1?'disabled':''}>${icon('right')}</button><button data-action="up" title="상위 폴더" aria-label="패널 ${index+1} 상위 폴더">${icon('up')}</button><div class="address ${tab.search?'search-address':''}" title="${escapeHTML(tab.search?'즐겨찾기와 추가한 폴더에서 검색':tab.path+' · 더블클릭 또는 Ctrl+L로 경로 입력')}">${tab.search?`${icon('drive')}<span class="search-scope">검색 폴더</span>`:`<div class="breadcrumbs">${breadcrumbs(tab.path)}</div>`}<input class="path-input" hidden aria-label="패널 ${index+1} 폴더 경로" value="${escapeHTML(tab.path)}" ${tab.search?'readonly':''}></div><button class="refresh-button" data-action="refresh" title="새로고침" aria-label="패널 ${index+1} 새로고침">${icon('refresh')}</button><button data-action="mkdir" title="새 폴더" aria-label="패널 ${index+1} 새 폴더" ${tab.search?'disabled':''}>${icon('new-folder')}</button></div>
    <div class="pane-body"><div class="file-table view-${tab.view}" role="listbox" aria-label="패널 ${index+1} 파일 목록">${renderColumns(index)}<div class="rows"></div></div>${viewOf(tab).inspector!=='off'?`<aside class="file-inspector"><header><strong>${viewOf(tab).inspector==='preview'?'미리보기':'세부 정보'}</strong><button class="close-inspector" aria-label="보조 창 닫기">×</button></header><div class="inspector-content"></div></aside>`:''}</div><div class="pane-footer"><span class="item-count"></span><span class="selection-info"></span><div class="file-actions"><button data-file-action="copy" title="복사 (Ctrl+C)">복사</button><button data-file-action="cut" title="잘라내기 (Ctrl+X)">잘라내기</button><button data-file-action="paste" title="붙여넣기 (Ctrl+V)">붙여넣기</button><button data-file-action="menu" title="파일 작업 메뉴" aria-label="패널 ${index+1} 파일 작업 메뉴">⋯</button></div></div>`;
  element.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { pane.active = Number(button.dataset.tab); setActive(index); renderPane(index); load(index); save(); });
  element.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { if (pane.tabs.length === 1) return toast('마지막 탭은 닫을 수 없습니다.'); pane.tabs.splice(Number(button.dataset.close), 1); pane.active = Math.min(pane.active, pane.tabs.length-1); renderPane(index); load(index); save(); });
  element.querySelector('.view-mode').onchange=event=>{setView(index,{view:event.target.value});};
  element.querySelector('.new-tab').onclick = () => newTab(index);
  element.querySelector('.path-input').onkeydown = event => { if (event.key === 'Enter') navigate(index, event.target.value); if(event.key==='Escape')renderPane(index); };
  element.querySelector('.path-input').onblur = () => { if(tabOf(pane)===tab && !tab.loading)renderPane(index); };
  element.querySelector('.address').ondblclick = () => editPath(index);
  element.querySelectorAll('[data-breadcrumb]').forEach(button=>button.onclick=()=>navigate(index,button.dataset.breadcrumb));
  element.querySelectorAll('[data-action]').forEach(button => button.onclick = () => {
    setActive(index);
    const action = button.dataset.action;
    if (action === 'refresh') tab.search ? runSearch() : load(index);
    if (action === 'up') navigate(index, tab.parent || tab.path);
    if (action === 'back' || action === 'forward') navigateHistory(action==='back'?-1:1,index);
    if (action === 'mkdir') { $('#folder-parent').textContent = tab.path; $('#folder-name').value = ''; $('#folder-dialog').showModal(); $('#folder-name').focus(); }
  });
  element.querySelectorAll('[data-sort]').forEach(button => button.onclick = () => { const sort=button.dataset.sort;setView(index,{sort,desc:viewOf(tab).sort===sort?!viewOf(tab).desc:false}); });
  renderRows(index);
  bindPaneFeatures(index);
  bindViewFeatures(index);
}
function renderRows(index) {
  const pane = state.panes[index], tab = tabOf(pane), element = pane.element;
  const rows = element.querySelector('.rows'),sorted=visibleSorted(index);pane.visibleEntries=sorted;
  if (tab.loading || tab.error || !sorted.length) {
    rows.innerHTML = `<div class="empty-state">${icon(tab.search?'search':'folder')}<strong>${tab.loading?'불러오는 중…':tab.error?'폴더를 열 수 없습니다':tab.search?'검색 결과가 없습니다':'폴더가 비어 있습니다'}</strong><small>${escapeHTML(tab.error || (tab.search?'다른 파일명을 입력하거나 검색 폴더를 추가해보세요.':'새 폴더를 만들거나 다른 경로로 이동하세요.'))}</small></div>`;
  } else {
    rows.innerHTML=renderFileRows(index,sorted);
    decorateThumbnails(rows, sorted);
    bindRows(index,rows,sorted);
    if(sorted.length>(tab.limit||2000)){const more=document.createElement('button');more.className='load-more';more.textContent='다음 2,000개 표시';more.onclick=()=>{tab.limit=(tab.limit||2000)+2000;renderRows(index);};rows.append(more);}
  }
  element.querySelector('.item-count').textContent = tab.search ? `${(tab.total||0).toLocaleString()}개 검색 결과${tab.total>1000?' · 상위 1,000개 표시':''}` : `${sorted.length.toLocaleString()}개 항목${tab.entries.length>2000?' · 상위 2,000개 표시':''}`;
  rows.querySelectorAll('[data-group]').forEach(button=>button.onclick=event=>{event.stopPropagation();const set=tab.collapsed;set.has(button.dataset.group)?set.delete(button.dataset.group):set.add(button.dataset.group);renderRows(index);});
  updateSelection(index);
}
function makeTab(path,view='details',savedOptions) {const tab={path,options:ViewOptions.normalize(savedOptions||state.folderViews[folderKey(path)]||{view}),entries:[],history:[path],cursor:0,loading:false,search:false,request:0};Object.defineProperty(tab,'view',{get(){return this.options.view;},set(value){this.options.view=value;}});return tab;}

function navigateHistory(direction,index=state.active) {
  if(![-1,1].includes(direction)||document.querySelector('dialog[open]'))return;
  const pane=state.panes[index],tab=tabOf(pane),next=tab.cursor+direction;
  if(tab.loading||next<0||next>=tab.history.length)return;
  tab.cursor=next;return navigate(index,tab.history[next],false);
}
let lastHistoryInput=null;
function historyInput(direction,source){
  const now=performance.now();
  // Some drivers emit both a Windows command and a Chromium side-button event.
  if(lastHistoryInput&&lastHistoryInput.direction===direction&&lastHistoryInput.source!==source&&now-lastHistoryInput.time<180)return;
  lastHistoryInput={direction,source,time:now};return navigateHistory(direction);
}
function editPath(index) { const pane=state.panes[index];if(tabOf(pane).search)return;const input=pane.element.querySelector('.path-input');pane.element.querySelector('.breadcrumbs').hidden=true;input.hidden=false;input.focus();input.select(); }
async function navigate(index, path, history=true, preserve=false,recordVisit=true) {
  const pane = state.panes[index], tab = tabOf(pane), previous = tab.path;
  tab.search = false;
  const request = ++tab.request;
  tab.loading = true; tab.error = null; renderPane(index);
  try {
    const data = await call(api.list(path));
    if (request !== tab.request) return;
    if(folderKey(previous)!==folderKey(data.path))tab.options=ViewOptions.normalize(state.folderViews[folderKey(data.path)]||{});
    tab.path = data.path; tab.parent = data.parent; tab.entries = data.entries;
    if(recordVisit&&!preserve)rememberFolder(data.path);
    if(preserve){const existing=new Set(data.entries.map(entry=>entry.path));tab.selection=new Set([...selection(tab)].filter(value=>existing.has(value)));}
    else {tab.selected=null;tab.selection=new Set();tab.anchor=null;tab.limit=2000;}
    if (history && previous !== data.path) { tab.history = tab.history.slice(0,tab.cursor+1); tab.history.push(data.path); tab.cursor = tab.history.length-1; }
    save();
    api.watch?.(state.panes.map(item=>tabOf(item).path));
  } catch (error) { if (request !== tab.request) return; tab.error = error.message; tab.entries = []; }
  tab.loading = false;
  if (tabOf(pane)===tab) renderPane(index);
  syncSidebar();
}
async function refreshTab(index){
  const pane=state.panes[index],tab=tabOf(pane);if(tab.loading||tab.refreshing||tab.search)return;
  const request=++tab.request;tab.refreshing=true;
  try{
    const data=await call(api.list(tab.path));if(tab.request!==request||tabOf(pane)!==tab)return;
    if(!refreshFocused){queueRefresh([tab.path]);return;}
    const changed=!!tab.error||!ChangePolicy.sameEntries(tab.entries,data.entries,viewOf(tab).columns.some(column=>column.id==='accessed'));
    tab.entries=data.entries;tab.parent=data.parent;tab.error=null;tab.refreshError=null;
    if(!changed)return;
    const existing=new Set(data.entries.map(entry=>entry.path));tab.selection=new Set([...selection(tab)].filter(value=>existing.has(value)));
    const table=pane.element.querySelector('.file-table'),top=table.scrollTop,left=table.scrollLeft;
    const focus=document.activeElement.closest?.('.file-row'),focusedPath=focus&&pane.element.contains(focus)?focus.title:null;
    renderRows(index);bindViewFeatures(index);table.scrollTop=top;table.scrollLeft=left;
    if(focusedPath)Array.from(table.querySelectorAll('.file-row')).find(row=>row.title===focusedPath)?.focus({preventScroll:true});
  }catch(error){if(tab.request===request&&tab.refreshError!==error.message){tab.refreshError=error.message;toast(`폴더 갱신 실패: ${error.message}`);}}
  finally{tab.refreshing=false;}
}
async function refreshSearch(){
  const pane=state.panes[0],tab=tabOf(pane),query=state.query;if(!query||!tab.search||tab.loading)return;
  const token=++state.request;
  try{const result=await call(api.search(query,state.filter));if(token!==state.request||tabOf(pane)!==tab||!tab.search||$('#search').value.trim()!==query)return;
    if(!refreshFocused){queueRefresh([]);return;}
    const changed=result.total!==tab.total||!ChangePolicy.sameEntries(tab.entries,result.entries);tab.entries=result.entries;tab.total=result.total;
    if(!changed)return;const existing=new Set(result.entries.map(entry=>entry.path));tab.selection=new Set([...selection(tab)].filter(value=>existing.has(value)));
    const table=pane.element.querySelector('.file-table'),top=table.scrollTop,left=table.scrollLeft,focused=document.activeElement.closest?.('.file-row'),focusedPath=focused&&pane.element.contains(focused)?focused.title:null;renderRows(0);bindViewFeatures(0);table.scrollTop=top;table.scrollLeft=left;if(focusedPath)Array.from(table.querySelectorAll('.file-row')).find(row=>row.title===focusedPath)?.focus({preventScroll:true});
  }catch(error){toast(`검색 갱신 실패: ${error.message}`);}
}
async function load(index,preserve=false) { const tab=tabOf(state.panes[index]);if(preserve)return refreshTab(index);if(tab.search)return runSearch();return navigate(index,tab.path,false,false,false); }
function newTab(index) { const pane=state.panes[index]; if (pane.tabs.length>=20) return toast('패널당 최대 20개 탭을 사용할 수 있습니다.'); pane.tabs.push(makeTab(tabOf(pane).path,tabOf(pane).view)); pane.active=pane.tabs.length-1; setActive(index); renderPane(index); load(index); save(); }
async function openEntry(index,entry) {
  if (entry.directory) { if (tabOf(state.panes[index]).search) { const target=state.layout>1?1:0; if (target===index) { newTab(index); } navigate(target,entry.path); setActive(target); } else navigate(index,entry.path); }
  else if (tabOf(state.panes[index]).search) { const target=state.layout>1?1:0; if (target===index) newTab(index); await navigate(target,entry.parent); const tab=tabOf(state.panes[target]); tab.selected=entry.path;tab.selection=new Set([entry.path]); renderRows(target); setActive(target); }
  else call(api.open(entry.path)).catch(error=>toast(error.message));
}
async function runSearch() {
  const token=++state.request;
  state.query=$('#search').value.trim();
  if (!state.query) { state.panes.forEach((pane,index)=>{ pane.tabs.forEach(tab=>tab.search=false); renderPane(index); load(index); }); return; }
  const pane=state.panes[0];
  const tab=tabOf(pane); tab.search=true; tab.loading=true; tab.error=null; tab.request++;
  setActive(0); renderPane(0);syncSidebar();
  try { const result=await call(api.search(state.query,state.filter)); if(token!==state.request||tabOf(pane)!==tab||!tab.search)return; tab.entries=result.entries;tab.selection=new Set([...selection(tab)].filter(value=>result.entries.some(entry=>entry.path===value)));tab.total=result.total; tab.loading=false; renderPane(0); }
  catch(error) { if(token!==state.request)return; tab.error=error.message; tab.loading=false; renderPane(0); }
}
function updateIndex(status) { $('#index-status').textContent = status.error?'검색 인덱스 오류':status.indexing?`파일 인덱싱 중 · ${(status.scanned||0).toLocaleString()}개 폴더 확인`:status.skipped?'인덱스 확인 완료 · 일부 폴더 접근 불가':status.limited?'인덱스 한도 도달 (25만 항목)':'인덱스 준비 완료'; $('#index-count').textContent=`${status.count.toLocaleString()}개 파일·폴더`; $('.status-dot').classList.toggle('busy',status.indexing); $('#index-status').title = status.error || [status.current,`${status.skipped||0}개 폴더 접근 불가 · 네트워크 폴더는 인덱싱 제외`,...(status.warnings||[]).map(item=>`${item.code}: ${item.path}`),status.cacheError&&`캐시 저장 실패: ${status.cacheError}`].filter(Boolean).join('\n'); if(state.query&&!status.indexing)queueRefresh([]); }

async function init() {
  const boot=await call(api.bootstrap()); state.boot=boot;
  const applyTheme=value=>{document.documentElement.dataset.theme=value==='light'?'light':'dark';$('#theme-select').value=document.documentElement.dataset.theme;};
  applyTheme(boot.layout?.theme||window.quadfinderTheme);
  $('#theme-select').onchange=async()=>{const previous=document.documentElement.dataset.theme,next=$('#theme-select').value;applyTheme(next);$('#theme-select').disabled=true;try{if(api.setTheme)await call(api.setTheme(next));}catch(error){applyTheme(previous);toast(`테마 저장 실패: ${error.message}`);}finally{$('#theme-select').disabled=false;}};
  if (boot.preview) $('#preview-label').textContent='디자인 미리보기 · 예시 데이터';
  $('#scope-label').textContent=`${boot.roots.length}개 폴더에서 검색`;
  const saved=boot.layout;state.folderViews=saved?.folderViews||{};
  setupSidebar(saved?.sidebarWidth);
  const defaults=[boot.places.find(item=>item.icon==='document')?.path,boot.places.find(item=>item.icon==='document')?.path,boot.places.find(item=>item.icon==='image')?.path,boot.places.find(item=>item.icon==='download')?.path];
  for(let i=0;i<4;i++) {
    const element=document.createElement('section'); element.className='pane'; element.setAttribute('aria-label',`탐색 패널 ${i+1}`); $('#panes').append(element);
    const savedPane=saved?.panes?.[i];
    const pane={element,active:savedPane?.active||0,tabs:(savedPane?.tabs?.length?savedPane.tabs:[{path:defaults[i]||boot.places[0].path}]).map(tab=>makeTab(tab.path,tab.view,tab.options)),sort:boot.preview?'none':'name',desc:false};
    if(boot.preview)pane.tabs.forEach(tab=>tab.options.sort='none');
    if(pane.active>=pane.tabs.length)pane.active=0;
    state.panes.push(pane); element.addEventListener('pointerdown',event=>{if(event.button<3)setActive(i);}); renderPane(i);
  }
  setupSidebarNavigation(saved?.navigation);
  document.querySelectorAll('[data-window]').forEach(button=>button.onclick=()=>call(api.windowAction(button.dataset.window)).catch(error=>toast(error.message)));
  document.querySelectorAll('[data-layout]').forEach(button=>button.onclick=()=>applyLayout(Number(button.dataset.layout)));
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));if(state.query)runSearch();else toast('검색어를 입력하면 선택한 필터가 적용됩니다.');});
  $('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,180);};
  $('#search').onkeydown=event=>{if(event.key==='Enter'){clearTimeout(searchTimer);runSearch();}if(event.key==='Escape'){$('#search').value='';runSearch();}};
  $('#clear-search').onclick=()=>{$('#search').value='';runSearch();$('#search').focus();};
  $('#reindex').onclick=async()=>{try{await call(api.reindex());toast('파일 목록을 다시 수집합니다.');}catch(error){toast(error.message);}};
  $('#folder-dialog').addEventListener('close',async()=>{if($('#folder-dialog').returnValue!=='create')return;try{await call(api.mkdir($('#folder-parent').textContent,$('#folder-name').value));await load(state.active);toast('새 폴더를 만들었습니다.');}catch(error){toast(error.message);}});
  $('#folder-dialog button[value="cancel"]').formNoValidate=true;
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey&&['k','f'].includes(event.key.toLowerCase())){event.preventDefault();$('#search').focus();$('#search').select();}
    if(event.ctrlKey&&event.key.toLowerCase()==='t'){event.preventDefault();newTab(state.active);}
    if(event.ctrlKey&&event.key.toLowerCase()==='l'){event.preventDefault();editPath(state.active);}
    if(event.key==='F5'){event.preventDefault();load(state.active);}
    if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();navigateHistory(event.key==='ArrowLeft'?-1:1);}
    if(event.altKey&&event.key==='ArrowUp'){event.preventDefault();const tab=tabOf(state.panes[state.active]);navigate(state.active,tab.parent||tab.path);}
  });
  applyLayout([1,2,4].includes(saved?.layout)?saved.layout:4);
  api.onHistory?.(direction=>historyInput(direction,'windows'));
  const sideButton=event=>event.button===3||event.button===4;
  for(const type of ['pointerdown','mousedown','auxclick'])document.addEventListener(type,event=>{if(sideButton(event)){event.preventDefault();event.stopPropagation();}},true);
  document.addEventListener('pointerup',event=>{if(!sideButton(event))return;event.preventDefault();event.stopPropagation();historyInput(event.button===3?-1:1,'mouse');},true);
  api.onIndex(updateIndex); updateIndex(boot.indexStatus);
  await Promise.all(state.panes.map((_pane,i)=>load(i)));
  initFeatures(boot);
  if(boot.preview){$('#search').value='프로젝트';await runSearch();const tab=tabOf(state.panes[0]);tab.selected=tab.entries.find(entry=>entry.name==='프로젝트 제안서.docx')?.path;tab.selection=new Set(tab.selected?[tab.selected]:[]);renderRows(0);}
  window.__quadfinderReady=true;
}
function driveSize(bytes){return bytes>=1024**4?`${(bytes/1024**4).toFixed(2)} TB`:`${Math.round(bytes/1024**3)} GB`;}
init().catch(error=>{toast(error.message);$('#index-status').textContent='시작 실패';});
