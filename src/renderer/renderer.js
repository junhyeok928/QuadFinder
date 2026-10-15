const api = window.quadfind;
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = { panes: [], layout: 4, sidebarWidth: 184, active: 0, query: '', filter: 'all', request: 0, boot: null };
let toastTimer, searchTimer, saveTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
async function call(promise) { const result = await promise; if (!result.ok) throw new Error(result.error); return result.value; }
function tabOf(pane) { return pane.tabs[pane.active]; }
function basename(path) { return path.replace(/[\\/]$/, '').split(/[\\/]/).pop() || path; }
function tabLabel(path) { return state.boot?.places.find(place => place.path === path)?.label || basename(path); }
function tabIcon(tab) { return tab.search ? 'search' : state.boot?.places.find(place => place.path === tab.path)?.icon === 'download' ? 'download' : 'folder-blue'; }
function breadcrumbs(path) {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.map((part, index) => `${index ? icon('chevron') : ''}<button data-breadcrumb="${escapeHTML(parts.slice(0,index+1).join('\\')+'\\')}" title="${escapeHTML(part)}">${escapeHTML(part)}</button>`).join('');
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
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => call(api.saveLayout({ layout: state.layout, sidebarWidth: state.sidebarWidth, panes: state.panes.map(pane => ({ active: pane.active, tabs: pane.tabs.map(tab => ({path:tab.path})) })) })).catch(error => toast(`레이아웃 저장 실패: ${error.message}`)), 150); }
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
function setActive(index) { state.active = index; document.querySelectorAll('.pane').forEach((element, i) => element.classList.toggle('active', i === index)); }
function applyLayout(value) { state.layout = value; if (state.active >= value) state.active = 0; $('#panes').className = `panes layout-${value}`; document.querySelectorAll('[data-layout]').forEach(button => { const active = Number(button.dataset.layout) === value; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }); state.panes.forEach((pane, i) => { pane.element.hidden = i >= value; }); setActive(state.active); save(); }

function renderPane(index) {
  const pane = state.panes[index], tab = tabOf(pane), element = pane.element;
  element.innerHTML = `<div class="tabs-bar"><div class="tabs">${pane.tabs.map((item,i) => `<div class="tab ${pane.active===i?'current':''}"><button data-tab="${i}" title="${escapeHTML(item.path)}">${icon(tabIcon(item))}<span>${escapeHTML(item.search?'검색 결과':tabLabel(item.path))}</span></button><button class="close-tab" data-close="${i}" aria-label="${escapeHTML(tabLabel(item.path))} 탭 닫기">×</button></div>`).join('')}</div><button class="new-tab" title="새 탭 (Ctrl+T)" aria-label="패널 ${index+1} 새 탭">${icon('plus')}</button></div>
    <div class="navigation"><button data-action="back" title="뒤로" aria-label="패널 ${index+1} 뒤로" ${tab.cursor<=0?'disabled':''}>${icon('left')}</button><button data-action="forward" title="앞으로" aria-label="패널 ${index+1} 앞으로" ${tab.cursor>=tab.history.length-1?'disabled':''}>${icon('right')}</button><button data-action="up" title="상위 폴더" aria-label="패널 ${index+1} 상위 폴더">${icon('up')}</button><div class="address ${tab.search?'search-address':''}" title="${escapeHTML(tab.search?'즐겨찾기와 추가한 폴더에서 검색':tab.path+' · 더블클릭 또는 Ctrl+L로 경로 입력')}">${tab.search?`${icon('drive')}<span class="search-scope">검색 폴더</span>`:`<div class="breadcrumbs">${breadcrumbs(tab.path)}</div>`}<input class="path-input" hidden aria-label="패널 ${index+1} 폴더 경로" value="${escapeHTML(tab.path)}" ${tab.search?'readonly':''}></div><button class="refresh-button" data-action="refresh" title="새로고침" aria-label="패널 ${index+1} 새로고침">${icon('refresh')}</button><button data-action="mkdir" title="새 폴더" aria-label="패널 ${index+1} 새 폴더" ${tab.search?'disabled':''}>${icon('new-folder')}</button></div>
    <div class="file-table" role="listbox" aria-label="패널 ${index+1} 파일 목록"><div class="columns"><button data-sort="name">이름</button><button data-sort="modified">${tab.search?'위치':'수정한 날짜'}</button><button class="size-label" data-sort="size">크기</button><span class="file-extra">${tab.search?'수정한 날짜':'유형'}</span></div><div class="rows"></div></div><div class="pane-footer"><span class="item-count"></span><span class="selection-info"></span></div>`;
  element.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { pane.active = Number(button.dataset.tab); setActive(index); renderPane(index); load(index); save(); });
  element.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { if (pane.tabs.length === 1) return toast('마지막 탭은 닫을 수 없습니다.'); pane.tabs.splice(Number(button.dataset.close), 1); pane.active = Math.min(pane.active, pane.tabs.length-1); renderPane(index); load(index); save(); });
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
    if (action === 'back' || action === 'forward') { tab.cursor += action==='back'?-1:1; navigate(index,tab.history[tab.cursor],false); }
    if (action === 'mkdir') { $('#folder-parent').textContent = tab.path; $('#folder-name').value = ''; $('#folder-dialog').showModal(); $('#folder-name').focus(); }
  });
  element.querySelectorAll('[data-sort]').forEach(button => button.onclick = () => { const sort = button.dataset.sort; pane.desc = pane.sort===sort?!pane.desc:false; pane.sort = sort; renderPane(index); });
  renderRows(index);
}
function renderRows(index) {
  const pane = state.panes[index], tab = tabOf(pane), element = pane.element;
  const rows = element.querySelector('.rows');
  if (tab.loading || tab.error || !tab.entries.length) {
    rows.innerHTML = `<div class="empty-state">${icon(tab.search?'search':'folder')}<strong>${tab.loading?'불러오는 중…':tab.error?'폴더를 열 수 없습니다':tab.search?'검색 결과가 없습니다':'폴더가 비어 있습니다'}</strong><small>${escapeHTML(tab.error || (tab.search?'다른 파일명을 입력하거나 검색 폴더를 추가해보세요.':'새 폴더를 만들거나 다른 경로로 이동하세요.'))}</small></div>`;
  } else {
    const sorted = pane.sort==='none' ? [...tab.entries] : [...tab.entries].sort((a,b) => Number(b.directory)-Number(a.directory) || (pane.sort==='name'?a.name.localeCompare(b.name,'ko',{numeric:true}):(a[pane.sort]-b[pane.sort])) * (pane.desc?-1:1));
    // The renderer is deliberately bounded; the index retains the full supported search scope.
    rows.innerHTML = sorted.slice(0,2000).map((entry,i) => `<div class="file-row ${tab.selected===entry.path?'selected':''}" role="option" aria-selected="${tab.selected===entry.path}" tabindex="0" data-row="${i}" title="${escapeHTML(entry.path)}"><span class="file-name"><span class="file-icon ${fileIcon(entry)}">${icon(fileIcon(entry))}</span><span>${escapeHTML(entry.name)}${entry.link?' ↗':''}</span></span><span class="file-date" title="${escapeHTML(tab.search?entry.parent:new Date(entry.modified).toLocaleString('ko-KR'))}">${escapeHTML(tab.search?entry.parent:dateLabel(entry.modified))}</span><span class="file-size">${sizeLabel(entry)}</span><span class="file-extra" title="${escapeHTML(typeLabel(entry))}">${escapeHTML(tab.search?dateLabel(entry.modified):typeLabel(entry))}</span></div>`).join('');
    decorateThumbnails(rows, sorted);
    rows.querySelectorAll('[data-row]').forEach(row => {
      const entry = sorted[Number(row.dataset.row)];
      row.onclick = () => { tab.selected = entry.path; setActive(index); rows.querySelectorAll('.file-row').forEach(item => { const selected = item===row; item.classList.toggle('selected',selected); item.setAttribute('aria-selected',selected); }); element.querySelector('.selection-info').textContent = entry.name; };
      row.ondblclick = () => openEntry(index, entry);
      row.onkeydown = event => { if (event.key==='Enter') openEntry(index,entry); if (event.key==='ArrowDown') { event.preventDefault(); row.nextElementSibling?.focus(); } if (event.key==='ArrowUp') { event.preventDefault(); row.previousElementSibling?.focus(); } };
      row.oncontextmenu = event => { event.preventDefault(); call(api.reveal(entry.path)).catch(error=>toast(error.message)); };
    });
  }
  element.querySelector('.item-count').textContent = tab.search ? `${(tab.total||0).toLocaleString()}개 검색 결과${tab.total>1000?' · 상위 1,000개 표시':''}` : `${tab.entries.length.toLocaleString()}개 항목${tab.entries.length>2000?' · 상위 2,000개 표시':''}`;
  element.querySelector('.selection-info').textContent = tab.selected?basename(tab.selected):'';
}
function makeTab(path) { return {path, entries:[], history:[path], cursor:0, loading:false, search:false, request:0}; }
function editPath(index) { const pane=state.panes[index];if(tabOf(pane).search)return;const input=pane.element.querySelector('.path-input');pane.element.querySelector('.breadcrumbs').hidden=true;input.hidden=false;input.focus();input.select(); }
async function navigate(index, path, history=true) {
  const pane = state.panes[index], tab = tabOf(pane), previous = tab.path;
  tab.search = false;
  const request = ++tab.request;
  tab.loading = true; tab.error = null; renderPane(index);
  try {
    const data = await call(api.list(path));
    if (request !== tab.request) return;
    tab.path = data.path; tab.parent = data.parent; tab.entries = data.entries; tab.selected = null;
    if (history && previous !== data.path) { tab.history = tab.history.slice(0,tab.cursor+1); tab.history.push(data.path); tab.cursor = tab.history.length-1; }
    save();
  } catch (error) { if (request !== tab.request) return; tab.error = error.message; tab.entries = []; }
  tab.loading = false;
  if (tabOf(pane)===tab) renderPane(index);
}
async function load(index) { const tab=tabOf(state.panes[index]); if (tab.search) return runSearch(); return navigate(index,tab.path,false); }
function newTab(index) { const pane=state.panes[index]; if (pane.tabs.length>=20) return toast('패널당 최대 20개 탭을 사용할 수 있습니다.'); pane.tabs.push(makeTab(tabOf(pane).path)); pane.active=pane.tabs.length-1; setActive(index); renderPane(index); load(index); save(); }
async function openEntry(index,entry) {
  if (entry.directory) { if (tabOf(state.panes[index]).search) { const target=state.layout>1?1:0; if (target===index) { newTab(index); } navigate(target,entry.path); setActive(target); } else navigate(index,entry.path); }
  else if (tabOf(state.panes[index]).search) { const target=state.layout>1?1:0; if (target===index) newTab(index); await navigate(target,entry.parent); const tab=tabOf(state.panes[target]); tab.selected=entry.path; renderRows(target); setActive(target); }
  else call(api.open(entry.path)).catch(error=>toast(error.message));
}
async function runSearch() {
  const token=++state.request;
  state.query=$('#search').value.trim();
  if (!state.query) { state.panes.forEach((pane,index)=>{ pane.tabs.forEach(tab=>tab.search=false); renderPane(index); load(index); }); return; }
  const pane=state.panes[0];
  const tab=tabOf(pane); tab.search=true; tab.loading=true; tab.error=null; tab.request++;
  setActive(0); renderPane(0);
  try { const result=await call(api.search(state.query,state.filter)); if(token!==state.request||tabOf(pane)!==tab||!tab.search)return; tab.entries=result.entries; tab.total=result.total; tab.loading=false; renderPane(0); }
  catch(error) { if(token!==state.request)return; tab.error=error.message; tab.loading=false; renderPane(0); }
}
function updateIndex(status) { $('#index-status').textContent = status.error?'검색 인덱스 오류':status.indexing?'파일 인덱싱 중…':status.limited?'인덱스 한도 도달 (25만 항목)':'인덱스 준비 완료'; $('#index-count').textContent=`${status.count.toLocaleString()}개 파일·폴더`; $('.status-dot').classList.toggle('busy',status.indexing); $('#index-status').title = status.error || `${status.skipped||0}개 폴더 접근 불가 · 최신 파일 반영은 새로고침 버튼 사용`; if(state.query) { clearTimeout(searchTimer); searchTimer=setTimeout(runSearch,150); } }

async function init() {
  const boot=await call(api.bootstrap()); state.boot=boot;
  if (boot.preview) $('#preview-label').textContent='디자인 미리보기 · 예시 데이터';
  $('#scope-label').textContent=`${boot.roots.length}개 폴더에서 검색`;
  const saved=boot.layout;
  setupSidebar(saved?.sidebarWidth);
  const defaults=[boot.places.find(item=>item.icon==='document')?.path,boot.places.find(item=>item.icon==='document')?.path,boot.places.find(item=>item.icon==='image')?.path,boot.places.find(item=>item.icon==='download')?.path];
  for(let i=0;i<4;i++) {
    const element=document.createElement('section'); element.className='pane'; element.setAttribute('aria-label',`탐색 패널 ${i+1}`); $('#panes').append(element);
    const savedPane=saved?.panes?.[i];
    const pane={element,active:savedPane?.active||0,tabs:(savedPane?.tabs?.length?savedPane.tabs:[{path:defaults[i]||boot.places[0].path}]).map(tab=>makeTab(tab.path)),sort:boot.preview?'none':'name',desc:false};
    if(pane.active>=pane.tabs.length)pane.active=0;
    state.panes.push(pane); element.addEventListener('pointerdown',()=>setActive(i)); renderPane(i);
  }
  for(const [selector,items] of [['#places',boot.places.filter(place=>place.icon!=='image')],['#drives',boot.drives]]) {
    $(selector).innerHTML=items.map((place,i)=>`<button data-place="${i}" class="${selector==='#drives'?'drive-button':''}" title="${escapeHTML(place.path)}">${icon(place.icon)}${selector==='#drives'?`<span class="drive-info"><span>${escapeHTML(place.label)}</span>${place.total?`<span class="drive-meter" role="meter" aria-label="${escapeHTML(place.label)} 사용량" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100*place.used/place.total)}"><i class="drive-fill" data-percent="${Math.round(100*place.used/place.total)}"></i></span><small>${driveSize(place.used)} / ${driveSize(place.total)}</small>`:''}</span>`:`<span>${escapeHTML(place.label)}</span>${place.icon!=='home'?`<span class="place-pin">${icon('pin')}</span>`:''}`}</button>`).join('');
    $(selector).querySelectorAll('.drive-fill').forEach(bar=>bar.style.width=`${bar.dataset.percent}%`);
    $(selector).querySelectorAll('button').forEach(button=>button.onclick=()=>{ navigate(state.active,items[Number(button.dataset.place)].path); document.querySelectorAll('nav button').forEach(item=>item.classList.toggle('active',item===button)); });
  }
  $('#choose-folder').onclick=async()=>{try{const path=await call(api.chooseFolder());if(path){navigate(state.active,path);$('#scope-label').textContent='즐겨찾기 + 추가한 폴더에서 검색';}}catch(error){toast(error.message);}};
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
    if(event.ctrlKey&&event.key.toLowerCase()==='k'){event.preventDefault();$('#search').focus();$('#search').select();}
    if(event.ctrlKey&&event.key.toLowerCase()==='t'){event.preventDefault();newTab(state.active);}
    if(event.ctrlKey&&event.key.toLowerCase()==='l'){event.preventDefault();editPath(state.active);}
    if(event.key==='F5'){event.preventDefault();load(state.active);}
    if(event.altKey&&event.key==='ArrowUp'){event.preventDefault();const tab=tabOf(state.panes[state.active]);navigate(state.active,tab.parent||tab.path);}
  });
  applyLayout([1,2,4].includes(saved?.layout)?saved.layout:4);
  api.onIndex(updateIndex); updateIndex(boot.indexStatus);
  await Promise.all(state.panes.map((_pane,i)=>load(i)));
  if(boot.preview){$('#search').value='프로젝트';await runSearch();const tab=tabOf(state.panes[0]);tab.selected=tab.entries.find(entry=>entry.name==='프로젝트 제안서.docx')?.path;renderRows(0);}
  window.__quadfinderReady=true;
}
function driveSize(bytes){return bytes>=1024**4?`${(bytes/1024**4).toFixed(2)} TB`:`${Math.round(bytes/1024**3)} GB`;}
init().catch(error=>{toast(error.message);$('#index-status').textContent='시작 실패';});
