const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const { localPath, listDirectory, createFolder } = require('./files.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'quadfinder', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const smoke = process.argv.includes('--smoke-test');
const designPreview = !app.isPackaged && process.argv.includes('--design-preview');
if (smoke) app.setPath('userData', path.join(app.getAppPath(), 'output', 'smoke-profile'));
if (designPreview) app.setPath('userData', path.join(app.getAppPath(), 'output', 'design-profile'));
let window;
let worker;
let searchId = 0;
let indexStatus = { indexing: false, count: 0, skipped: 0, limited: false };
const pending = new Map();
let roots = [];
let places = [];
let layout;
let saveQueue = Promise.resolve();
const stateFile = () => path.join(app.getPath('userData'), 'layout.json');

async function checkSidebarResize() {
  await window.webContents.executeJavaScript(`document.querySelector('#sidebar-resizer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  const measure=()=>window.webContents.executeJavaScript(`({width:document.querySelector('#sidebar').getBoundingClientRect().width,x:Math.round(document.querySelector('#sidebar-resizer').getBoundingClientRect().x+4),y:200})`);
  const drag=async delta=>{
    const rect=await measure();
    window.webContents.sendInputEvent({type:'mouseMove',x:rect.x,y:rect.y});
    await new Promise(resolve=>setTimeout(resolve,30));
    window.webContents.sendInputEvent({type:'mouseDown',x:rect.x,y:rect.y,button:'left',clickCount:1});
    await new Promise(resolve=>setTimeout(resolve,30));
    window.webContents.sendInputEvent({type:'mouseMove',x:rect.x+delta,y:rect.y,button:'left',modifiers:['leftButtonDown']});
    await new Promise(resolve=>setTimeout(resolve,30));
    window.webContents.sendInputEvent({type:'mouseUp',x:rect.x+delta,y:rect.y,button:'left',clickCount:1});
    await new Promise(resolve=>setTimeout(resolve,50));
    return (await measure()).width;
  };
  const expanded=await drag(90);
  const shrunk=await drag(-50);
  const minimum=await drag(-200);
  const maximum=await drag(600);
  await window.webContents.executeJavaScript(`document.querySelector('#sidebar-resizer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await new Promise(resolve=>setTimeout(resolve,50));
  const keyboard=(await measure()).width;
  const styles=await window.webContents.executeJavaScript(`({stuck:document.body.classList.contains('resizing-sidebar'),gradient:getComputedStyle(document.querySelector('#filters button.active')).backgroundImage,shadow:getComputedStyle(document.querySelector('#filters button.active')).boxShadow,statusGradient:getComputedStyle(document.querySelector('.statusbar')).backgroundImage,navFont:getComputedStyle(document.querySelector('#places button')).fontSize})`);
  return {expanded,shrunk,minimum,maximum,keyboard,works:expanded===274 && shrunk===224 && minimum===150 && maximum===Math.min(400,window.getContentBounds().width-640) && keyboard===194 && !styles.stuck && styles.gradient==='none' && styles.shadow==='none' && styles.statusGradient==='none' && styles.navFont==='12px'};
}

function startIndex() {
  if (worker) worker.terminate();
  for (const { resolve } of pending.values()) resolve({ entries: [], total: 0, indexing: true });
  pending.clear();
  indexStatus = { indexing: true, count: 0, skipped: 0, limited: false };
  worker = new Worker(path.join(__dirname, 'index-worker.cjs'), { workerData: { roots } });
  worker.on('message', message => {
    if (message.type === 'results') {
      pending.get(message.id)?.resolve(message);
      pending.delete(message.id);
    } else {
      indexStatus = message.type === 'error' ? { ...indexStatus, indexing: false, error: message.message } : message;
      if (!window.isDestroyed()) window.webContents.send('index:status', indexStatus);
    }
  });
  worker.on('error', error => {
    indexStatus = { ...indexStatus, indexing: false, error: error.message };
    if (!window.isDestroyed()) window.webContents.send('index:status', indexStatus);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  });
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('quadfinder://app/')) throw new Error('허용되지 않은 요청입니다.');
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

async function setup() {
  for (const [key, label, icon] of [['home', '홈', 'home'], ['desktop', '바탕 화면', 'desktop'], ['downloads', '다운로드', 'download'], ['documents', '문서', 'document'], ['pictures', '사진', 'image']]) {
    try { const directory = app.getPath(key); if ((await fs.stat(directory)).isDirectory()) places.push({ label, path: directory, icon }); } catch { /* Missing known folders are not displayed. */ }
  }
  roots = [...new Set(places.filter(item => item.icon !== 'home').map(item => item.path))];
  if (smoke) {
    const fixtures = path.join(app.getAppPath(), 'tests', 'fixtures');
    roots = [fixtures];
    places = [{label:'테스트 자료', path:fixtures, icon:'home'}];
  }
  try { layout = JSON.parse(await fs.readFile(stateFile(), 'utf8')); } catch { layout = null; }
  protocol.handle('quadfinder', request => {
    const url = new URL(request.url);
    const assets = new Set(['index.html', 'styles.css', 'renderer.js', 'icons.js', 'preview.js']);
    const file = url.pathname.slice(1) || 'index.html';
    if (url.hostname !== 'app' || !assets.has(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(__dirname, 'renderer', file)).href);
  });
  window = new BrowserWindow({ width: designPreview ? 1586 : 1520, height: designPreview ? 992 : 980, minWidth: 1000, minHeight: 680, show: !smoke && !designPreview,
    backgroundColor: '#14181e', title: 'QuadFinder', frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: designPreview ? ['--quadfinder-design-preview'] : [] } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  handle('bootstrap', async () => {
    const drives = [];
    if (process.platform === 'win32') for (let code = 65; code <= 90; code++) {
      const root = String.fromCharCode(code) + ':\\';
      try {
        await fs.access(root);
        let capacity={};
        try { const stats=await fs.statfs(root);capacity={total:stats.blocks*stats.bsize,used:(stats.blocks-stats.bfree)*stats.bsize}; } catch { /* Some volumes don't report capacity. */ }
        drives.push({ label: `로컬 디스크 (${root.slice(0, 2)})`, path: root, icon: 'drive', ...capacity });
      } catch { /* Not mounted. */ }
    }
    return { places, drives, roots, layout, indexStatus, version: app.getVersion(), smoke };
  });
  handle('files:list', listDirectory);
  handle('files:thumbnail', async value => {
    const file=localPath(value);
    if(!/\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(file))return null;
    const stat=await fs.stat(file);
    if(!stat.isFile() || stat.size>40*1024*1024)return null;
    try { const image=await nativeImage.createThumbnailFromPath(file,{width:104,height:62});return image.isEmpty()?null:image.toDataURL(); }
    catch { return null; }
  });
  handle('files:choose', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    const directory = localPath(result.filePaths[0]);
    if (!roots.includes(directory)) { roots.push(directory); startIndex(); }
    return directory;
  });
  handle('files:open', async value => {
    const file = localPath(value);
    await fs.access(file);
    const { response } = await dialog.showMessageBox(window, { type: 'question', buttons: ['취소', '열기'], defaultId: 0, cancelId: 0,
      message: '기본 앱에서 파일을 여시겠습니까?', detail: file });
    if (response !== 1) return false;
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
    return true;
  });
  handle('files:reveal', async value => { const file = localPath(value); await fs.access(file); shell.showItemInFolder(file); });
  handle('files:mkdir', createFolder);
  handle('search', (query, filter) => {
    if (typeof query !== 'string' || query.length > 500 || !['all', 'documents', 'images', 'recent'].includes(filter)) throw new Error('잘못된 검색 조건입니다.');
    return new Promise((resolve, reject) => { const id = ++searchId; pending.set(id, { resolve, reject }); worker.postMessage({ id, query, filter }); });
  });
  handle('index:rebuild', () => { startIndex(); return roots; });
  handle('layout:save', async value => {
    if (!value || ![1, 2, 4].includes(value.layout) || !Array.isArray(value.panes) || value.panes.length !== 4) throw new Error('잘못된 레이아웃입니다.');
    const clean = { layout: value.layout, sidebarWidth: Number.isFinite(value.sidebarWidth) ? Math.max(150,Math.min(400,Math.round(value.sidebarWidth))) : 184, panes: value.panes.map(pane => {
      if (!Array.isArray(pane.tabs) || pane.tabs.length < 1 || pane.tabs.length > 20) throw new Error('탭 개수를 확인하세요.');
      return { active: Math.max(0, Math.min(pane.tabs.length - 1, Number(pane.active) || 0)), tabs: pane.tabs.map(tab => ({ path: localPath(tab.path) })) };
    }) };
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      await fs.writeFile(stateFile() + '.tmp', JSON.stringify(clean, null, 2));
      await fs.rename(stateFile() + '.tmp', stateFile());
      layout=clean;
    });
    await saveQueue;
  });
  handle('window:action', action => {
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
  });
  if(!designPreview) startIndex();
  await window.loadURL('quadfinder://app/index.html');
  if(designPreview){
    const deadline=Date.now()+15000;
    while(Date.now()<deadline && !(await window.webContents.executeJavaScript('window.__quadfinderReady === true')))await new Promise(resolve=>setTimeout(resolve,100));
    await window.webContents.executeJavaScript('document.fonts.ready');
    await new Promise(resolve=>setTimeout(resolve,400));
    await fs.mkdir(path.join(app.getAppPath(),'output'),{recursive:true});
    const capture=async name=>fs.writeFile(path.join(app.getAppPath(),'output',name),(await window.webContents.capturePage()).toPNG());
    await capture('design-refined.png');
    const checks=await window.webContents.executeJavaScript(`({ready:window.__quadfinderReady===true,rows:document.querySelectorAll('.file-row').length,colourFiles:document.querySelectorAll('.file-icon.word,.file-icon.excel,.file-icon.pdf').length,toolbarHeight:document.querySelector('.search-toolbar').getBoundingClientRect().height,firstPaneY:document.querySelector('.pane').getBoundingClientRect().y,overflow:document.documentElement.scrollWidth>innerWidth})`);
    checks.sidebarResize=await checkSidebarResize();
    window.setSize(1000,680);
    await new Promise(resolve=>setTimeout(resolve,200));
    await capture('design-compact.png');
    checks.compactOverflow=await window.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth || document.querySelector(".search-toolbar").getBoundingClientRect().right>innerWidth');
    await window.webContents.executeJavaScript(`document.querySelector('#sidebar-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);
    await capture('design-sidebar-wide.png');
    checks.wideSidebarOverflow=await window.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth || document.querySelector(".search-toolbar").getBoundingClientRect().right>innerWidth');
    await fs.writeFile(path.join(app.getAppPath(),'output','design-checks.json'),JSON.stringify(checks,null,2));
    console.log(JSON.stringify(checks));
    app.exit(checks.ready && checks.rows>=20 && checks.colourFiles>0 && !checks.overflow && !checks.compactOverflow && !checks.wideSidebarOverflow && checks.sidebarResize.works ? 0 : 1);
  }
  if (smoke) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !(await window.webContents.executeJavaScript('window.__quadfinderReady === true'))) await new Promise(resolve => setTimeout(resolve, 100));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const waitFor = async predicate => { const deadline = Date.now()+10000; while(!predicate()){if(Date.now()>deadline)throw new Error('UI wait timeout');await new Promise(resolve=>setTimeout(resolve,50));} };
      const initialRows=document.querySelectorAll('.file-row').length;
      const pathInput=document.querySelector('.pane:first-child .path-input');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'l',ctrlKey:true,bubbles:true}));
      const pathEditWorks=!pathInput.hidden && document.activeElement===pathInput;
      pathInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      document.querySelector('[data-layout="2"]').click();
      const twoPane=document.querySelectorAll('.pane:not([hidden])').length===2;
      document.querySelector('[data-layout="4"]').click();
      document.querySelector('.new-tab').click();
      await waitFor(()=>document.querySelectorAll('.pane:first-child .tab').length===2 && document.querySelectorAll('.pane:first-child .file-row').length>0);
      document.querySelector('.pane:first-child [data-close="1"]').click();
      const search=document.querySelector('#search');search.value='프로젝트';search.dispatchEvent(new Event('input'));
      await waitFor(()=>document.querySelector('.pane:first-child .tab.current').textContent.includes('검색 결과') && document.querySelectorAll('.pane:first-child .file-row').length===1);
      const searchWorks=document.querySelector('.pane:first-child .file-row').textContent.includes('프로젝트 안내.md');
      document.querySelector('[data-filter="images"]').click();
      await waitFor(()=>document.querySelector('.pane:first-child .empty-state strong')?.textContent==='검색 결과가 없습니다');
      const filterWorks=true;
      document.querySelector('#clear-search').click();
      await waitFor(()=>document.querySelectorAll('.pane:first-child .file-row').length===1 && !document.querySelector('.pane:first-child .tab.current').textContent.includes('검색 결과'));
      return {ready:window.__quadfinderReady===true,panes:document.querySelectorAll('.pane').length,rows:initialRows,twoPane,searchWorks,filterWorks,pathEditWorks,title:document.title};
    })()`);
    const thumbnailResult=await window.webContents.executeJavaScript(`window.quadfind.thumbnail(${JSON.stringify(path.join(app.getAppPath(),'docs','design-concept.png'))})`);
    result.thumbnailWorks=thumbnailResult.ok && /^data:image\/png;base64,/.test(thumbnailResult.value);
    result.sidebarResize=await checkSidebarResize();
    await new Promise(resolve=>setTimeout(resolve,250));
    await saveQueue;
    result.sidebarSaved=JSON.parse(await fs.readFile(stateFile(),'utf8')).sidebarWidth===194;
    await window.loadURL('quadfinder://app/index.html');
    const restoreDeadline=Date.now()+10000;
    while(Date.now()<restoreDeadline && !(await window.webContents.executeJavaScript('window.__quadfinderReady===true')))await new Promise(resolve=>setTimeout(resolve,50));
    result.sidebarRestored=await window.webContents.executeJavaScript('document.querySelector("#sidebar").getBoundingClientRect().width===194');
    await fs.mkdir(path.join(app.getAppPath(), 'output'), { recursive: true });
    await fs.writeFile(path.join(app.getAppPath(), 'output', 'smoke.png'), (await window.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(app.getAppPath(), 'output', 'smoke.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.exit(result.ready && result.panes === 4 && result.rows > 0 && result.twoPane && result.searchWorks && result.filterWorks && result.pathEditWorks && result.thumbnailWorks && result.sidebarResize.works && result.sidebarSaved && result.sidebarRestored ? 0 : 1);
  }
}
app.whenReady().then(setup).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => worker?.terminate());
