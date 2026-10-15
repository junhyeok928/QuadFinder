const sidebarCache=new Map();
let sidebarSequence=0,sidebarDrag=null,sidebarLabelPath=null,sidebarTimer,sidebarDirty=new Set();
function navState(){return state.navigation||(state.navigation=NavigationState.normalize());}
const navKey=value=>NavigationState.key(value);
function customLocations(){
  const settings=navState(),known=new Set(state.boot.places.map(item=>navKey(item.path))),hidden=new Set(settings.hidden.map(navKey));
  const paths=[...new Map([...settings.favorites,...state.boot.roots].filter(path=>!known.has(navKey(path))&&!hidden.has(navKey(path))).map(path=>[navKey(path),path])).values()];
  const order=new Map(settings.order.map((path,i)=>[navKey(path),i]));return paths.sort((a,b)=>(order.get(navKey(a))??1e6)-(order.get(navKey(b))??1e6));
}
function saveNavigation(){state.navigation=NavigationState.normalize(navState());save();}
function toggleNavSection(section,collapsed=!navState().collapsed[section]){
  navState().collapsed[section]=collapsed;
  const button=document.querySelector(`[data-nav-section="${section}"]`),group=$('#'+button.getAttribute('aria-controls'));
  button.setAttribute('aria-expanded',String(!collapsed));button.querySelector('.collapse-mark').textContent=collapsed?'›':'⌄';group.hidden=collapsed;
  syncSidebar();saveNavigation();
  if(!collapsed)for(const node of group.querySelectorAll('.nav-item'))if(node.querySelector('.nav-toggle').getAttribute('aria-expanded')==='true'&&!node.closest('.nav-children[hidden]'))loadNavChildren(node,sidebarDirty.delete(node.dataset.navPath));
}
function pinLocation(path){
  const settings=navState();settings.hidden=settings.hidden.filter(value=>navKey(value)!==navKey(path));
  if(!settings.favorites.some(value=>navKey(value)===navKey(path)))settings.favorites.push(path);
  settings.collapsed.favorites=false;saveNavigation();renderSidebar();
}
function unpinLocation(path){const settings=navState();settings.favorites=settings.favorites.filter(value=>navKey(value)!==navKey(path));if(state.boot.roots.some(value=>navKey(value)===navKey(path)))settings.hidden.push(path);saveNavigation();renderSidebar();toast('바로가기를 제거했습니다. 실제 폴더와 검색 대상은 유지됩니다.');}
function reorderLocation(path,before){const paths=customLocations(),from=paths.findIndex(value=>navKey(value)===navKey(path)),to=paths.findIndex(value=>navKey(value)===navKey(before));if(from<0||to<0||from===to)return;paths.splice(to,0,paths.splice(from,1)[0]);navState().order=paths;saveNavigation();renderSidebar();}
function openSidebarPath(path,mode='current'){
  let index=state.active;
  if(mode==='other'){if(state.layout===1)applyLayout(2);index=index===0?1:0;}
  if(mode==='tab'){const pane=state.panes[index];if(pane.tabs.length>=20)return toast('패널당 최대 20개 탭을 사용할 수 있습니다.');pane.tabs.push(makeTab(path));pane.active=pane.tabs.length-1;setActive(index);renderPane(index);load(index);save();}
  else {setActive(index);navigate(index,path);}
}
async function treeEntries(path,reload=false){
  const key=navKey(path);if(reload)sidebarCache.delete(key);
  let entry=sidebarCache.get(key);if(entry?.entries)return entry.entries;if(entry?.promise)return entry.promise;
  entry={};sidebarCache.set(key,entry);if(sidebarCache.size>128)sidebarCache.delete(sidebarCache.keys().next().value);
  entry.promise=(api.folders?call(api.folders(path)):call(api.list(path)).then(data=>data.entries.filter(item=>item.directory&&!item.link))).then(entries=>{entry.entries=entries;entry.promise=null;return entries;}).catch(error=>{sidebarCache.delete(key);throw error;});return entry.promise;
}
function makeNavItem(item,category,depth=0,parentPath=null,section=category==='drive'?'pc':'favorites'){
  const path=item.path,key=navKey(path),expanded=navState().expanded.some(value=>navKey(value)===key),id='nav-children-'+(++sidebarSequence);
  const node=document.createElement('div');node.className='nav-item';node.dataset.navPath=path;node.dataset.category=category;node.dataset.section=section;node.dataset.depth=depth;node.style.setProperty('--depth',depth);
  const label=navState().labels[key]||item.label||basename(path),drive=category==='drive';node.dataset.label=label;
  node.innerHTML=`<div class="nav-row"><button class="nav-toggle" aria-label="${escapeHTML(label)} 하위 폴더 ${expanded?'접기':'펼치기'}" aria-expanded="${expanded}" aria-controls="${id}" ${depth>=12?'disabled':''}>${expanded?'⌄':'›'}</button><button class="nav-location ${drive?'drive-button':''}" role="treeitem" aria-level="${depth+1}" aria-expanded="${expanded}" data-location="${escapeHTML(path)}" ${category==='custom'&&depth===0?'data-root-nav="true" draggable="true"':''} title="${escapeHTML(path)} · Ctrl+클릭 또는 휠클릭: 새 탭">${icon(item.icon||'folder-blue')}${drive?`<span class="drive-info"><span>${escapeHTML(label)}</span>${item.total?`<span class="drive-meter" role="meter" aria-label="${escapeHTML(label)} 사용량" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100*item.used/item.total)}"><i class="drive-fill"></i></span><small>${driveSize(item.used)} / ${driveSize(item.total)}</small>`:''}</span>`:`<span class="nav-label">${escapeHTML(label)}</span>${category!=='child'&&category!=='drive'?`<span class="place-pin">${icon('pin')}</span>`:''}`}</button></div><div id="${id}" class="nav-children" role="group" ${expanded?'':'hidden'}></div>`;
  const button=node.querySelector('.nav-location'),toggle=node.querySelector('.nav-toggle');
  node.querySelector('.drive-fill')?.style.setProperty('width',`${Math.min(100,Math.max(0,100*item.used/item.total))}%`);
  button.onclick=event=>openSidebarPath(path,event.ctrlKey||event.metaKey?'tab':'current');button.onauxclick=event=>{if(event.button===1){event.preventDefault();openSidebarPath(path,'tab');}};
  button.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();showSidebarMenu(path,category,event.clientX,event.clientY);};
  toggle.onclick=()=>expandNavItem(node,toggle.getAttribute('aria-expanded')!=='true');
  button.onkeydown=event=>{
    if(event.altKey&&event.key==='Enter'){event.preventDefault();event.stopPropagation();if(api.shellMenu)call(api.shellMenu({paths:[path],verb:'properties',x:0,y:0})).catch(error=>toast(error.message));return;}
    if(event.altKey)return;
    if(['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight','F5','ContextMenu','F2','Delete'].includes(event.key)||(event.shiftKey&&event.key==='F10')||(event.ctrlKey&&event.key.toLowerCase()==='c')){
      event.preventDefault();event.stopPropagation();
      const visible=Array.from(document.querySelectorAll('#sidebar .nav-location')).filter(element=>element.getClientRects().length),position=visible.indexOf(button);
      if(event.key==='ArrowDown')visible[Math.min(visible.length-1,position+1)]?.focus();if(event.key==='ArrowUp')visible[Math.max(0,position-1)]?.focus();if(event.key==='Home')visible[0]?.focus();if(event.key==='End')visible.at(-1)?.focus();
      if(event.key==='ArrowRight'){if(toggle.getAttribute('aria-expanded')!=='true')expandNavItem(node,true);else node.querySelector('.nav-children .nav-location')?.focus();}
      if(event.key==='ArrowLeft'){if(toggle.getAttribute('aria-expanded')==='true')expandNavItem(node,false);else if(parentPath)node.parentElement.closest('.nav-item')?.querySelector('.nav-location')?.focus();}
      if(event.key==='F5')refreshSidebar();if(event.key==='F2'&&category==='custom')renameSidebarLabel(path);if(event.key==='Delete'&&category==='custom')unpinLocation(path);
      if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){const rect=button.getBoundingClientRect();showSidebarMenu(path,category,rect.x+20,rect.bottom);}
      if(event.ctrlKey&&event.key.toLowerCase()==='c'){if(event.shiftKey&&api.copyPaths)call(api.copyPaths([path])).catch(error=>toast(error.message));else if(api.writeClipboard)call(api.writeClipboard({kind:'copy',paths:[path]})).then(()=>{fileClipboard={kind:'copy',paths:[path]};state.panes.forEach((_,i)=>updateSelection(i));toast('폴더를 복사했습니다.');}).catch(error=>toast(error.message));}
    }
  };
  if(category==='custom'&&depth===0){button.ondragstart=event=>{sidebarDrag=path;event.dataTransfer.setData('application/x-quadfinder-navigation',path);event.dataTransfer.effectAllowed='move';};button.ondragend=()=>{sidebarDrag=null;document.querySelectorAll('.nav-drop-target').forEach(element=>element.classList.remove('nav-drop-target'));};}
  button.ondragover=event=>{if((sidebarDrag&&category==='custom'&&depth===0)||(!sidebarDrag&&(event.dataTransfer.types.includes('application/x-quadfinder')||event.dataTransfer.types.includes('Files')))){event.preventDefault();event.dataTransfer.dropEffect=sidebarDrag?'move':event.shiftKey?'move':'copy';button.classList.add('nav-drop-target');}};
  button.ondragleave=()=>button.classList.remove('nav-drop-target');
  button.ondrop=async event=>{event.preventDefault();event.stopPropagation();button.classList.remove('nav-drop-target');if(sidebarDrag){if(category==='custom'&&depth===0)reorderLocation(sidebarDrag,path);sidebarDrag=null;return;}const paths=await sidebarDropPaths(event);if(paths.length)await transfer(event.shiftKey?'move':'copy',paths,path);};
  if(expanded&&!navState().collapsed[section])loadNavChildren(node);return node;
}
async function expandNavItem(node,expanded){
  const path=node.dataset.navPath,settings=navState();settings.expanded=settings.expanded.filter(value=>navKey(value)!==navKey(path));if(expanded)settings.expanded.push(path);
  const toggle=node.querySelector('.nav-toggle');toggle.setAttribute('aria-expanded',expanded);toggle.setAttribute('aria-label',`${node.dataset.label} 하위 폴더 ${expanded?'접기':'펼치기'}`);toggle.textContent=expanded?'⌄':'›';node.querySelector('.nav-location').setAttribute('aria-expanded',expanded);node.querySelector('.nav-children').hidden=!expanded;
  saveNavigation();syncSidebar();if(expanded)await loadNavChildren(node,sidebarDirty.delete(path));
}
async function loadNavChildren(node,reload=false){
  const children=node.querySelector('.nav-children'),path=node.dataset.navPath;if(!children.childElementCount)children.innerHTML='<small class="tree-message">불러오는 중…</small>';
  try{const entries=await treeEntries(path,reload);if(!node.isConnected)return;if((!refreshFocused&&!state.boot.preview)||navState().collapsed[node.dataset.section]){sidebarDirty.add(path);return;}const signature=entries.map(item=>item.path).join('\n');if(children.dataset.signature===signature)return;children.dataset.signature=signature;
    let limit=100;const render=()=>{children.replaceChildren(...entries.slice(0,limit).map(item=>makeNavItem(item,'child',Number(node.dataset.depth)+1,path,node.dataset.section)));if(!entries.length)children.innerHTML='<small class="tree-message">하위 폴더 없음</small>';if(entries.length>limit){const more=document.createElement('button');more.className='tree-more';more.textContent=`폴더 더 보기 (${entries.length-limit}개)`;more.onclick=()=>{limit+=100;render();};children.append(more);}syncSidebar();};render();
  }catch(error){if(!node.isConnected)return;children.innerHTML='<button class="tree-retry">폴더를 불러올 수 없습니다 · 다시 시도</button>';children.firstElementChild.title=error.message;children.firstElementChild.onclick=()=>loadNavChildren(node,true);}
}
function renderSidebar(){
  if(!state.boot)return;const settings=navState(),scroll=$('.sidebar-scroll').scrollTop;
  $('#places').replaceChildren(...state.boot.places.map(item=>makeNavItem(item,'place')));
  $('#custom-places').replaceChildren(...customLocations().map(path=>makeNavItem({path},'custom')));
  $('#drives').replaceChildren(...state.boot.drives.map(item=>makeNavItem(item,'drive')));
  for(const section of ['favorites','pc']){const button=document.querySelector(`[data-nav-section="${section}"]`),collapsed=settings.collapsed[section];button.setAttribute('aria-expanded',String(!collapsed));button.querySelector('.collapse-mark').textContent=collapsed?'›':'⌄';$('#'+button.getAttribute('aria-controls')).hidden=collapsed;}
  $('.sidebar-scroll').scrollTop=scroll;syncSidebar();
}
function renameSidebarLabel(path){sidebarLabelPath=path;$('#nav-label-dialog').returnValue='cancel';$('#nav-label-input').value=navState().labels[navKey(path)]||basename(path);$('#nav-label-dialog').showModal();$('#nav-label-input').focus();$('#nav-label-input').select();}
function showSidebarMenu(path,category,x,y){
  const menu=$('#context-menu'),custom=category==='custom',indexed=state.boot.roots.some(value=>navKey(value)===navKey(path));menu.className='explorer-menu';
  const actions=[['open','열기'],['tab','새 탭에서 열기'],['other','다른 패널에서 열기'],['reveal','Windows 탐색기에서 열기'],['path','경로 복사'],[custom?'unpin':'pin',custom?'즐겨찾기에서 제거':'즐겨찾기에 고정'],...(custom?[['label','표시 이름 변경'],['up','위로 이동'],['down','아래로 이동']]:[]),[indexed?'exclude':'include',indexed?'검색 대상에서 제외':'검색 대상에 포함'],['refresh','하위 폴더 새로고침'],['properties','속성']];
  const order=customLocations(),position=order.findIndex(value=>navKey(value)===navKey(path));
  menu.innerHTML=actions.map(([action,label])=>`<button role="menuitem" data-nav-action="${action}" ${(action==='up'&&position<=0)||(action==='down'&&position>=order.length-1)||(action==='properties'&&!api.shellMenu)||(action==='include'&&!api.addRoot)||(action==='exclude'&&!api.removeRoot)?'disabled':''}>${['pin','unpin'].includes(action)?icon('pin'):action==='up'?icon('up'):action==='down'?icon('up').replace('<svg','<svg class="nav-arrow-down"'):['include','exclude'].includes(action)?icon('search'):menuIcon(action==='label'?'rename':action==='tab'?'other':action)}<span>${label}</span></button>`).join('');positionMenu(menu,x,y);
  menu.querySelectorAll('button').forEach(button=>button.onclick=async()=>{menu.hidden=true;const action=button.dataset.navAction;try{
    if(['open','tab','other'].includes(action))openSidebarPath(path,action==='open'?'current':action);
    if(action==='reveal')await call(api.open(path));if(action==='path'&&api.copyPaths)await call(api.copyPaths([path]));if(action==='pin')pinLocation(path);if(action==='unpin')unpinLocation(path);if(action==='label')renameSidebarLabel(path);
    if(action==='up'||action==='down'){const paths=customLocations(),index=paths.findIndex(value=>navKey(value)===navKey(path)),other=paths[index+(action==='up'?-1:1)];if(other)reorderLocation(path,other);}
    if(action==='include'&&api.addRoot){pinLocation(path);renderRoots(await call(api.addRoot(path)));}if(action==='exclude'&&api.removeRoot){pinLocation(path);renderRoots(await call(api.removeRoot(path)));}
    if(action==='refresh'){sidebarCache.delete(navKey(path));for(const node of document.querySelectorAll('.nav-item'))if(navKey(node.dataset.navPath)===navKey(path)&&node.querySelector('.nav-toggle').getAttribute('aria-expanded')==='true')loadNavChildren(node,true);}
    if(action==='properties'&&api.shellMenu)await call(api.shellMenu({paths:[path],verb:'properties',x,y}));
  }catch(error){toast(error.message);}});menu.querySelector('button')?.focus();
}
async function sidebarDropPaths(event){try{if(draggedPaths?.length)return [...draggedPaths];const value=event.dataTransfer.getData('application/x-quadfinder');if(value){const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(item=>typeof item==='string').slice(0,256):[];}if(event.dataTransfer.files.length&&api.dropPaths)return await api.dropPaths(Array.from(event.dataTransfer.files));}catch(error){toast(error.message);}return [];}
async function pinDroppedFolders(event){event.preventDefault();event.stopPropagation();event.currentTarget.classList.remove('nav-drop-target');const paths=await sidebarDropPaths(event);let count=0;for(const path of paths)try{const folder=api.validateFolder?await call(api.validateFolder(path)):path;pinLocation(folder);count++;}catch{}toast(count?`${count}개 폴더를 즐겨찾기에 고정했습니다.`:'폴더를 놓아주세요.');}
async function refreshSidebar(){try{if(api.refreshDrives)state.boot.drives=await call(api.refreshDrives());sidebarCache.clear();renderSidebar();}catch(error){toast(error.message);}}
function setupSidebarNavigation(saved){
  state.navigation=NavigationState.normalize(saved);renderSidebar();
  document.querySelectorAll('[data-nav-section]').forEach(button=>{button.onclick=()=>toggleNavSection(button.dataset.navSection);button.onkeydown=event=>{if(event.altKey)return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();toggleNavSection(button.dataset.navSection,event.key==='ArrowLeft');}};});
  for(const element of [document.querySelector('[data-nav-section="favorites"]'),$('.pin-drop-zone')]){element.ondragover=event=>{if(event.dataTransfer.types.includes('application/x-quadfinder')||event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=['all','uninitialized','link','copyLink','linkMove'].includes(event.dataTransfer.effectAllowed)?'link':'copy';element.classList.add('nav-drop-target');}};element.ondragleave=()=>element.classList.remove('nav-drop-target');element.ondrop=pinDroppedFolders;}
  $('#choose-folder').onclick=()=>{$('#nav-add-path').value='';$('#nav-add-error').textContent='';$('#nav-add-dialog').showModal();$('#nav-add-path').focus();};
  $('#pin-current').onclick=()=>{const tab=tabOf(state.panes[state.active]);if(tab.search)return toast('고정할 폴더 패널을 선택하세요.');pinLocation(tab.path);toast('현재 폴더를 즐겨찾기에 고정했습니다.');};
  $('#refresh-sidebar').onclick=refreshSidebar;$('#nav-add-cancel').onclick=()=>$('#nav-add-dialog').close();
  $('#nav-add-choose').onclick=async()=>{try{const folder=await call(api.chooseFolder(false));if(folder)$('#nav-add-path').value=folder;}catch(error){$('#nav-add-error').textContent=error.message;}};
  $('#nav-add-dialog form').onsubmit=async event=>{event.preventDefault();$('#nav-add-submit').disabled=true;try{const path=api.validateFolder?await call(api.validateFolder($('#nav-add-path').value.trim())):$('#nav-add-path').value.trim();pinLocation(path);if($('#nav-add-index').checked&&api.addRoot)renderRoots(await call(api.addRoot(path)));$('#nav-add-dialog').close();openSidebarPath(path);}catch(error){$('#nav-add-error').textContent=error.message;}finally{$('#nav-add-submit').disabled=false;}};
  $('#nav-label-dialog').onclose=()=>{if($('#nav-label-dialog').returnValue!=='save'||!sidebarLabelPath)return;const label=$('#nav-label-input').value.trim();if(label)navState().labels[navKey(sidebarLabelPath)]=label;else delete navState().labels[navKey(sidebarLabelPath)];saveNavigation();renderSidebar();};
  $('#sidebar').addEventListener('keydown',event=>{if(event.key==='F5'){event.preventDefault();event.stopPropagation();refreshSidebar();}});
  api.onFilesChanged?.(paths=>{for(const node of document.querySelectorAll('.nav-item'))if(node.querySelector('.nav-toggle').getAttribute('aria-expanded')==='true'&&ChangePolicy.affects(node.dataset.navPath,paths))sidebarDirty.add(node.dataset.navPath);scheduleSidebarRefresh();});
  window.addEventListener('focus',scheduleSidebarRefresh);
}
function scheduleSidebarRefresh(){
  clearTimeout(sidebarTimer);if(!refreshFocused||!sidebarDirty.size)return;
  sidebarTimer=setTimeout(()=>{if(!refreshFocused)return;const paths=[...sidebarDirty];sidebarDirty.clear();for(const path of paths){sidebarCache.delete(navKey(path));for(const node of document.querySelectorAll('.nav-item'))if(navKey(node.dataset.navPath)===navKey(path)&&node.querySelector('.nav-toggle').getAttribute('aria-expanded')==='true'){if(navState().collapsed[node.dataset.section]||node.closest('.nav-children[hidden]'))sidebarDirty.add(path);else loadNavChildren(node);}}},300);
}
