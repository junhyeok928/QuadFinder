const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session, nativeImage, screen, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const { localPath, listDirectory, createFolder } = require('./files.cjs');
const { OperationQueue, renameItem, normalizeSources } = require('./operations.cjs');
const {UndoManager}=require('./undo.cjs');
const {handleSquirrel,updateExecutable}=require('./squirrel.cjs');
const {AppUpdater}=require('./updater.cjs');
const { watch } = require('node:fs');
const windowsShell=require('./windows-shell.cjs');
const {preview}=require('./file-preview.cjs');
const {normalize:normalizeNavigation}=require('./navigation-state.cjs');
const {normalize:normalizeView}=require('./view-options.cjs');
const pdfPreviews=new Map();
let shellMenuOpen=false;
async function enrich(entries){if(!entries.length)return entries;const attributes=await windowsShell.request({mode:'attributes',paths:entries.map(entry=>entry.path)});const map=new Map(attributes.map(item=>[item.path.toLowerCase(),item]));return entries.map(entry=>({...entry,...map.get(entry.path.toLowerCase())}));}
protocol.registerSchemesAsPrivileged([{ scheme: 'quadfinder', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const smoke = !app.isPackaged && process.argv.includes('--smoke-test');
const designPreview = !app.isPackaged && process.argv.includes('--design-preview');
if(process.platform==='win32')app.setAppUserModelId('com.squirrel.quadfinder.QuadFinder');
const squirrelHandled=handleSquirrel(app);
const ownsInstance=!squirrelHandled&&(smoke||designPreview||app.requestSingleInstanceLock());
if(!ownsInstance&&!squirrelHandled)app.quit();
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
let zoomFactor=1,zoomSaveTimer;
const normalizeZoom=value=>Math.max(.7,Math.min(1.5,Math.round((Number.isFinite(value)?value:1)*100)/100));
function writeSettings(patch){
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const next={...(layout||{}),...patch,zoomFactor};
    await fs.mkdir(app.getPath('userData'),{recursive:true});
    await fs.writeFile(stateFile()+'.tmp',JSON.stringify(next,null,2));
    await fs.rename(stateFile()+'.tmp',stateFile());layout=next;
  });
  return saveQueue;
}
function setZoom(value,persist=true){
  zoomFactor=normalizeZoom(value);window.webContents.setZoomFactor(zoomFactor);send('view:zoom',zoomFactor);
  if(persist){clearTimeout(zoomSaveTimer);zoomSaveTimer=setTimeout(()=>{zoomSaveTimer=null;writeSettings({}).catch(error=>send('view:error',error.message));},150);}
  return zoomFactor;
}
let operations;
let undo;
let updater;
let functionSmokeRoot=null;
let indexTimer, changedTimer, rootsSave=Promise.resolve();
const changedPaths=new Set(),changedFolders=new Set();
let refreshAll=false,watchedFolderKey='';
const {key:pathKey}=require('./change-policy.cjs');
const {indexable,networkPath}=require('./index-paths.cjs');
let networkDrives=[];
const indexExclusions=()=>[app.getPath('userData'),...networkDrives];
const rootWatchers=[],folderWatchers=[];
const stateFile = () => path.join(app.getPath('userData'), 'layout.json');
const rootsFile = () => path.join(app.getPath('userData'),'search-roots.json');
function send(channel,value){if(window&&!window.isDestroyed())window.webContents.send(channel,value);}
function internalChange(value){const settings=app.getPath('userData'),normalized=pathKey(value);return normalized===pathKey(settings)||normalized.startsWith(pathKey(settings)+'\\')||value.split(/[\\/]/).some(part=>part.toLowerCase().startsWith('.quadfinder-'));}
function filesChanged(values){
  const paths=Array.isArray(values)?values.filter(value=>!internalChange(value)):null;
  if(paths&&!paths.length)return;
  if(paths)for(const value of paths){changedFolders.add(value);if(indexable(value,roots,indexExclusions()))changedPaths.add(value);}
  else refreshAll=true;
  clearTimeout(changedTimer);changedTimer=setTimeout(function flush(){if(operations?.active()||undo?.busy){changedTimer=setTimeout(flush,350);return;}send('files:changed',refreshAll?null:[...changedFolders]);changedFolders.clear();refreshAll=false;scheduleIndex();},350);
}
function scheduleIndex(){clearTimeout(indexTimer);indexTimer=setTimeout(()=>{const paths=[...changedPaths];changedPaths.clear();if(paths.length&&worker)worker.postMessage({type:'update',paths});},1000);}
function watchRoots(){
  rootWatchers.splice(0).forEach(watcher=>watcher.close());
  if(smoke||designPreview)return;
  for(const root of roots.filter(root=>!networkPath(root,networkDrives)))try{const watcher=watch(root,{recursive:true,persistent:false},(_event,name)=>{
    const changed=name?path.resolve(root,String(name)):root;
    if(!indexable(changed,roots,indexExclusions()))return;
    filesChanged([changed]);
  });watcher.on('error',()=>{});rootWatchers.push(watcher);}catch{}
}
async function saveRoots(){
  const content=JSON.stringify({roots},null,2);
  rootsSave=rootsSave.catch(()=>{}).then(async()=>{await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.writeFile(rootsFile()+'.tmp',content);await fs.rename(rootsFile()+'.tmp',rootsFile());});
  await rootsSave;watchRoots();send('roots:changed',roots);startIndex();
}

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
  const toolsFit=await window.webContents.executeJavaScript(`(()=>{const sidebar=document.querySelector('#sidebar').getBoundingClientRect();return [...document.querySelectorAll('.sidebar-tools button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=sidebar.left&&r.right<=sidebar.right&&r.bottom<=sidebar.bottom;});})()`);
  const maximum=await drag(600);
  await window.webContents.executeJavaScript(`document.querySelector('#sidebar-resizer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await new Promise(resolve=>setTimeout(resolve,50));
  const keyboard=(await measure()).width;
  const styles=await window.webContents.executeJavaScript(`({stuck:document.body.classList.contains('resizing-sidebar'),gradient:getComputedStyle(document.querySelector('#filters button.active')).backgroundImage,shadow:getComputedStyle(document.querySelector('#filters button.active')).boxShadow,statusGradient:getComputedStyle(document.querySelector('.statusbar')).backgroundImage,navFont:getComputedStyle(document.querySelector('#places .nav-location')).fontSize})`);
  return {expanded,shrunk,minimum,maximum,keyboard,works:toolsFit && expanded===274 && shrunk===224 && minimum===150 && maximum===Math.min(400,window.getContentBounds().width-640) && keyboard===194 && !styles.stuck && styles.gradient==='none' && styles.shadow==='none' && styles.statusGradient==='none' && styles.navFont==='12px'};
}

function startIndex() {
  if(worker){worker.postMessage({type:'rebuild',roots});return;}
  for (const { resolve } of pending.values()) resolve({ entries: [], total: 0, indexing: true });
  pending.clear();
  indexStatus = { indexing: true, count: 0, skipped: 0, limited: false };
  worker = new Worker(path.join(__dirname, 'index-worker.cjs'), { workerData: { roots,excludePaths:indexExclusions(),cachePath:smoke?null:path.join(app.getPath('userData'),'index-cache.json') } });
  worker.on('message', message => {
    if (message.type === 'results') {
      enrich(message.entries).catch(()=>message.entries).then(entries=>pending.get(message.id)?.resolve({...message,entries})).finally(()=>pending.delete(message.id));
    } else {
      indexStatus = message.type === 'error' ? { ...indexStatus, indexing: false, error: message.message } : message;
      if (!window.isDestroyed()) window.webContents.send('index:status', indexStatus);
    }
  });
  const activeWorker=worker;
  const failed=error=>{
    if(worker!==activeWorker)return;
    indexStatus = { ...indexStatus, indexing: false, error: error.message };
    if (!window.isDestroyed()) window.webContents.send('index:status', indexStatus);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
    worker=null;
  };
  worker.on('error',failed);
  worker.on('exit',code=>failed(new Error(`검색 인덱스 작업이 종료되었습니다 (${code}). 다시 검색하면 복구합니다.`)));
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('quadfinder://app/')) throw new Error('허용되지 않은 요청입니다.');
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

async function setup() {
  if(!app.isPackaged){const nativeSource=path.join(app.getAppPath(),'native/ShellBridge.cs');try{if((await fs.stat(nativeSource)).mtimeMs>(await fs.stat(windowsShell.executable())).mtimeMs)require('../scripts/build-native.cjs').buildNative();}catch{require('../scripts/build-native.cjs').buildNative();}}
  for (const [key, label, icon] of [['home', '홈', 'home'], ['desktop', '바탕 화면', 'desktop'], ['downloads', '다운로드', 'download'], ['documents', '문서', 'document'], ['pictures', '사진', 'image']]) {
    try { const directory = app.getPath(key); if ((await fs.stat(directory)).isDirectory()) places.push({ label, path: directory, icon }); } catch { /* Missing known folders are not displayed. */ }
  }
  roots = [...new Set(places.filter(item => item.icon !== 'home').map(item => item.path))];
  if(!smoke&&!designPreview)try{const saved=JSON.parse(await fs.readFile(rootsFile(),'utf8'));if(Array.isArray(saved.roots))roots=[...new Set(saved.roots.map(localPath))];}catch{}
  if (smoke) {
    const fixtures = path.join(app.getAppPath(), 'tests', 'fixtures');
    roots = [fixtures];
    places = [{label:'테스트 자료', path:fixtures, icon:'home'}];
  }
  try { layout = JSON.parse(await fs.readFile(stateFile(), 'utf8')); } catch { layout = null; }
  zoomFactor=designPreview?1:normalizeZoom(layout?.zoomFactor);
  if(process.platform==='win32')networkDrives=await windowsShell.request({mode:'network-drives'});
  const removedRoots=roots.filter(root=>networkPath(root,networkDrives));
  roots=roots.filter(root=>!networkPath(root,networkDrives));
  if(removedRoots.length&&!smoke&&!designPreview){
    const navigation=normalizeNavigation(layout?.navigation);
    navigation.favorites=[...new Set([...navigation.favorites,...removedRoots])];
    await writeSettings({navigation});
    await fs.writeFile(rootsFile(),JSON.stringify({roots},null,2));
  }
  if(smoke&&layout)layout={...layout,panes:Array.from({length:4},()=>({active:0,tabs:[{path:roots[0]}]}))};
  protocol.handle('quadfinder', async request => {
    const url = new URL(request.url);
    if(url.hostname==='preview'){const item=pdfPreviews.get(url.pathname.slice(1));if(!item||Date.now()-item.time>3600000)return new Response('Expired',{status:404});const response=await net.fetch(pathToFileURL(item.file).href);return new Response(response.body,{headers:{'Content-Type':'application/pdf','X-Content-Type-Options':'nosniff'}});}
    if(url.hostname==='app'&&['/app-icon.svg','/app-icon.ico'].includes(url.pathname))return net.fetch(pathToFileURL(path.join(app.getAppPath(),'assets',url.pathname.slice(1))).href);
    if(url.hostname==='app'&&url.pathname==='/navigation-state.js')return net.fetch(pathToFileURL(path.join(__dirname,'navigation-state.cjs')).href);
    if(url.hostname==='app'&&url.pathname==='/change-policy.js')return net.fetch(pathToFileURL(path.join(__dirname,'change-policy.cjs')).href);
    if(url.hostname==='app'&&url.pathname==='/view-options.js')return net.fetch(pathToFileURL(path.join(__dirname,'view-options.cjs')).href);
    const assets = new Set(['index.html', 'styles.css', 'themes.css', 'theme-init.js', 'renderer.js', 'features.js', 'view-ui.js', 'sidebar.js', 'icons.js', 'preview.js']);
    const file = url.pathname.slice(1) || 'index.html';
    if (url.hostname !== 'app' || !assets.has(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(__dirname, 'renderer', file)).href);
  });
  window = new BrowserWindow({ width: designPreview ? 1586 : 1520, height: designPreview ? 992 : 980, minWidth: 1000, minHeight: 680, show: !smoke && !designPreview,
    icon:path.join(app.getAppPath(),'assets/app-icon.ico'), backgroundColor: layout?.theme==='light'?'#ffffff':'#181818', title: 'QuadFinder', frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling:!smoke&&!designPreview,
      additionalArguments: [...(designPreview ? ['--quadfinder-design-preview'] : []),`--quadfinder-theme=${layout?.theme==='light'?'light':'dark'}`] } });
  window.on('app-command',(event,command)=>{
    if(!['browser-backward','browser-forward'].includes(command))return;
    event.preventDefault();send('navigation:history',command==='browser-backward'?-1:1);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.setZoomMode('isolated');
  window.webContents.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown'||!input.control||input.alt)return;
    if(input.key==='0'||input.code==='Numpad0'){event.preventDefault();setZoom(1);}
    else if(['+','='].includes(input.key)){event.preventDefault();setZoom(zoomFactor+.1);}
    else if(input.key==='-'){event.preventDefault();setZoom(zoomFactor-.1);}
  });
  window.webContents.on('did-finish-load',()=>setZoom(zoomFactor,false));
  window.webContents.on('will-navigate', event => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  undo=new UndoManager({trash:file=>shell.trashItem(file),working:()=>operations?.active()||operations?.running,changed:filesChanged});
  undo.on('update',value=>send('undo:changed',value));
  operations=new OperationQueue({trash:file=>shell.trashItem(file),changed:filesChanged,completed:(actions,label)=>undo.record(actions,label),conflict:async info=>{
    if(smoke&&functionSmokeRoot&&info.source.startsWith(functionSmokeRoot+path.sep)&&info.destination.startsWith(functionSmokeRoot+path.sep))return 'keep-both';
    const result=await dialog.showMessageBox(window,{type:'question',message:'같은 이름의 파일 또는 폴더가 있습니다.',detail:`원본: ${info.source}\n대상: ${info.destination}`,buttons:['둘 다 유지','건너뛰기','작업 취소'],defaultId:0,cancelId:2,checkboxLabel:'이번 작업의 모든 충돌에 적용',checkboxChecked:false});
    return {action:['keep-both','skip','cancel'][result.response],applyAll:result.checkboxChecked};
  }});
  operations.on('update',jobs=>{send('operations:changed',jobs);undo.publish();});
  operations.on('undo-error',error=>send('view:error',error.name==='AbortError'?'내용 검증을 중단했습니다. 완료한 파일 작업은 유지됩니다.':'실행 취소 기록을 만들지 못했습니다: '+error.message));
  operations.on('trashed',()=>undo.clear());
  updater=new AppUpdater({native:require('electron').autoUpdater,version:app.getVersion(),installed:app.isPackaged&&require('node:fs').existsSync(updateExecutable(process.execPath)),canInstall:()=>!operations.active()&&!operations.running&&!undo.busy});
  updater.on('update',value=>send('updater:changed',value));updater.start(process.argv.includes('--squirrel-firstrun'));
  window.on('close',event=>{
    if(operations.active()||undo.busy){
      event.preventDefault();
      dialog.showMessageBox(window,{type:'question',message:'진행 중인 파일 작업이 있습니다.',detail:'작업을 취소한 뒤 창을 닫으세요.',buttons:['계속 작업'],defaultId:0});
    }else if(zoomSaveTimer){
      event.preventDefault();clearTimeout(zoomSaveTimer);zoomSaveTimer=null;
      writeSettings({}).then(()=>window.close()).catch(error=>send('view:error',error.message));
    }
  });
async function readDrives(){
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
    return drives;
  }
  handle('navigation:drives',readDrives);
  handle('bootstrap', async () => {const drives=await readDrives();
    return { places, drives, roots, networkDrives, layout, zoomFactor, indexStatus, jobs:operations.snapshot(), undo:undo.snapshot(), updater:updater.snapshot(), version: app.getVersion(), smoke };
  });
  handle('files:validate-folder',async value=>{const folder=localPath(value);if(!(await fs.stat(folder)).isDirectory())throw new Error('폴더 경로를 입력하세요.');return folder;});
  handle('files:folders',async value=>{const folder=localPath(value),items=await fs.readdir(folder,{withFileTypes:true});const entries=items.filter(item=>item.isDirectory()&&!item.isSymbolicLink()&&!item.name.startsWith('.quadfinder-')).map(item=>({name:item.name,path:path.join(folder,item.name),directory:true}));return (await enrich(entries)).filter(entry=>!entry.hidden).sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));});
  handle('files:list',async value=>{const data=await listDirectory(value);data.entries=await enrich(data.entries);return data;});
  handle('files:preview',value=>preview(value,{thumbnail:async file=>{const image=await nativeImage.createThumbnailFromPath(file,{width:1200,height:900});const size=nativeImage.createFromPath(file).getSize();return {image:image.toDataURL(),width:size.width,height:size.height};},pdfURL:file=>{const token=require('node:crypto').randomUUID();if(pdfPreviews.size>=64)pdfPreviews.delete(pdfPreviews.keys().next().value);pdfPreviews.set(token,{file,time:Date.now()});return 'quadfinder://preview/'+token;}}));
  handle('files:clipboard-write',async input=>{if(!input||!['copy','move'].includes(input.kind)||!Array.isArray(input.paths)||!input.paths.length||input.paths.length>10000)throw new Error('잘못된 클립보드 요청입니다.');return windowsShell.request({mode:'clipboard-write',kind:input.kind,paths:input.paths.map(localPath)});});
  handle('files:clipboard-read',async()=>{const data=await windowsShell.request({mode:'clipboard-read'});return {kind:data.kind,paths:data.paths.filter(value=>{try{localPath(value);return true;}catch{return false;}})};});
  handle('files:copy-path',async values=>{if(!Array.isArray(values)||values.length>10000)throw new Error('잘못된 경로입니다.');clipboard.writeText(values.map(localPath).map(value=>'"'+value+'"').join('\r\n'));});
  handle('files:shell-menu',async input=>{
    if(shellMenuOpen)throw new Error('열린 Windows 메뉴를 먼저 닫으세요.');
    if(!input||!Array.isArray(input.paths)||!input.paths.length||input.paths.length>1000)throw new Error('파일을 선택하세요.');
    const paths=input.paths.map(localPath);await Promise.all(paths.map(value=>fs.access(value)));
    if(input.verb&&!['properties','openas'].includes(input.verb))throw new Error('허용되지 않은 Windows 명령입니다.');
    const bounds=window.getContentBounds(),point=screen.dipToScreenPoint({x:Math.round(bounds.x+Math.max(0,Math.min(bounds.width,(Number(input.x)||0)*zoomFactor))),y:Math.round(bounds.y+Math.max(0,Math.min(bounds.height,(Number(input.y)||0)*zoomFactor)))});
    shellMenuOpen=true;try{const result=await windowsShell.request({mode:smoke&&input.probe?'probe':'menu',paths,background:input.background===true,x:point.x,y:point.y,verb:input.verb});if(result?.action==='delete')undo.clear();if(result?.action&&!['copy','cut','properties','openas','rename'].includes(result.action))filesChanged(paths.concat(paths.map(value=>path.dirname(value))));return result;}finally{shellMenuOpen=false;}
  });
  handle('files:thumbnail', async value => {
    const file=localPath(value);
    if(!/\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(file))return null;
    const stat=await fs.stat(file);
    if(!stat.isFile() || stat.size>40*1024*1024)return null;
    try { const image=await nativeImage.createThumbnailFromPath(file,{width:256,height:160});return image.isEmpty()?null:image.toDataURL(); }
    catch { return null; }
  });
  handle('files:choose', async (addToIndex=true) => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    const directory = localPath(result.filePaths[0]);
    if(addToIndex&&!networkPath(directory,networkDrives)&&!roots.some(root=>pathKey(root)===pathKey(directory))){roots.push(directory);await saveRoots();}
    return directory;
  });
  handle('files:open', async value => {
    const file = localPath(value);
    await fs.access(file);
    const executable=/\.(exe|msi|bat|cmd|ps1|vbs|js|jse|wsf|scr|com|lnk|url|hta|reg)$/i.test(file);
    const { response } = executable?await dialog.showMessageBox(window, { type: 'question', buttons: ['취소', '열기'], defaultId: 0, cancelId: 0,
      message: '이 파일을 실행하시겠습니까?', detail: file }):{response:1};
    if (response !== 1) return false;
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
    return true;
  });
  handle('files:reveal', async value => { const file = localPath(value); await fs.access(file); shell.showItemInFolder(file); });
  handle('files:mkdir', async(...args)=>{const file=await createFolder(...args);filesChanged([file]);return file;});
  handle('files:rename',async(source,name)=>{if(undo.busy||operations.active())throw new Error('진행 중인 작업이 끝난 뒤 이름을 변경하세요.');const target=await renameItem(source,name);if(target!==source)try{await undo.record([{kind:'rename',source,target}],'이름 변경');}catch(error){send('view:error','실행 취소 기록 실패: '+error.message);}filesChanged([source,target]);return target;});
  handle('files:watch',async values=>{
    if(!Array.isArray(values)||values.length>4)throw new Error('잘못된 폴더 목록입니다.');
    const directories=[...new Map(values.map(localPath).map(value=>[pathKey(value),value])).values()];
    const signature=directories.map(pathKey).sort().join('\n');if(signature===watchedFolderKey)return;watchedFolderKey=signature;
    folderWatchers.splice(0).forEach(watcher=>watcher.close());
    if(smoke)return;
    for(const value of directories)try{const watcher=watch(value,{persistent:false},(_event,name)=>filesChanged([name?path.resolve(value,String(name)):value]));watcher.on('error',()=>{watchedFolderKey='';});folderWatchers.push(watcher);}catch{watchedFolderKey='';}
  });
  handle('files:paths',async values=>{if(!Array.isArray(values)||values.length>10000)throw new Error('잘못된 경로 목록입니다.');return values.map(localPath);});
  handle('operations:start',async input=>{
    if(undo.busy)throw new Error('실행 취소 처리가 끝난 뒤 다시 시도하세요.');
    if(!input||!['copy','move','trash'].includes(input.kind))throw new Error('잘못된 작업입니다.');
    const sources=await normalizeSources(input.sources);
    if(input.kind==='trash'){
      const {response}=smoke&&functionSmokeRoot&&sources.every(source=>source.startsWith(functionSmokeRoot+path.sep))?{response:1}:await dialog.showMessageBox(window,{type:'question',message:`${sources.length}개 항목을 휴지통으로 이동하시겠습니까?`,detail:sources.slice(0,8).join('\n')+(sources.length>8?'\n…':''),buttons:['취소','휴지통으로 이동'],defaultId:0,cancelId:0});
      if(response!==1)return null;
    }
    return operations.enqueue({kind:input.kind,sources,destination:input.destination});
  });
  handle('operations:cancel',id=>operations.cancel(id));
  handle('operations:clear',()=>operations.clear());
  handle('operations:undo',async()=>{try{return await undo.undo();}catch(error){if(error.name==='AbortError')throw new Error('실행 취소를 중단했습니다. 이미 되돌린 항목은 유지됩니다.');throw error;}});
  handle('operations:undo-cancel',()=>undo.cancel());
  handle('updater:check',()=>updater.check());
  handle('updater:install',()=>updater.install());
  handle('updater:releases',()=>shell.openExternal('https://github.com/junhyeok928/QuadFinder/releases'));
  handle('roots:remove',async value=>{roots=roots.filter(root=>pathKey(root)!==pathKey(localPath(value)));await saveRoots();return roots;});
  handle('roots:add',async value=>{
    const root=localPath(value);
    if(networkPath(root,networkDrives))throw new Error('네트워크 폴더는 검색 인덱싱에서 제외됩니다. 즐겨찾기로 추가하면 폴더 탐색은 가능합니다.');
    if(!(await fs.stat(root)).isDirectory())throw new Error('검색할 폴더를 입력하세요.');
    if(!roots.some(existing=>pathKey(existing)===pathKey(root))){roots.push(root);await saveRoots();}return roots;
  });
  handle('search', (query, filter) => {
    if (typeof query !== 'string' || query.length > 500 || !['all', 'documents', 'images', 'recent'].includes(filter)) throw new Error('잘못된 검색 조건입니다.');
    if(!worker)startIndex();
    return new Promise((resolve, reject) => { const id = ++searchId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('검색 응답 시간이 초과되었습니다. 다시 검색해 주세요.'));},20000);pending.set(id, { resolve:value=>{clearTimeout(timer);resolve(value);}, reject:error=>{clearTimeout(timer);reject(error);} }); worker.postMessage({ id, query, filter }); });
  });
  handle('index:rebuild', () => { startIndex(); return roots; });
  handle('layout:save', async value => {
    if (!value || ![1, 2, 4].includes(value.layout) || !Array.isArray(value.panes) || value.panes.length !== 4) throw new Error('잘못된 레이아웃입니다.');
    const folderViews=Object.fromEntries(Object.entries(value.folderViews||{}).slice(-2000).filter(([key])=>{try{localPath(key);return true;}catch{return false;}}).map(([key,options])=>[key,normalizeView(options)]));
    const navigation=normalizeNavigation(value.navigation);
    for(const field of ['favorites','hidden','order','expanded','recent'])navigation[field]=navigation[field].filter(value=>{try{localPath(value);return true;}catch{return false;}});
    navigation.labels=Object.fromEntries(Object.entries(navigation.labels).filter(([value])=>{try{localPath(/^[a-z]:$/i.test(value)?value+'\\':value);return true;}catch{return false;}}));
    const clean = { panelRatios:Object.fromEntries(['x','y'].map(axis=>[axis,Math.max(.2,Math.min(.8,Number.isFinite(value.panelRatios?.[axis])?value.panelRatios[axis]:.5))])), navigation, folderViews, layout: value.layout, sidebarWidth: Number.isFinite(value.sidebarWidth) ? Math.max(150,Math.min(400,Math.round(value.sidebarWidth))) : 184, panes: value.panes.map(pane => {
      if (!Array.isArray(pane.tabs) || pane.tabs.length < 1 || pane.tabs.length > 20) throw new Error('탭 개수를 확인하세요.');
      return { active: Math.max(0, Math.min(pane.tabs.length - 1, Number(pane.active) || 0)), tabs: pane.tabs.map(tab => ({ path: localPath(tab.path),view:normalizeView({view:tab.view}).view,options:normalizeView(tab.options||{view:tab.view}) })) };
    }) };
    await writeSettings(clean);
  });
  handle('view:zoom',value=>{if(typeof value!=='number'||!Number.isFinite(value))throw new Error('올바른 배율을 입력하세요.');return setZoom(value);});
  handle('view:theme',async theme=>{if(!['dark','light'].includes(theme))throw new Error('올바른 테마를 선택하세요.');await writeSettings({theme});window.setBackgroundColor(theme==='light'?'#ffffff':'#181818');return theme;});
  handle('view:zoom-step',direction=>{if(direction!==1&&direction!==-1)throw new Error('올바르지 않은 배율 변경입니다.');return setZoom(zoomFactor+direction*.1);});
  handle('window:action', action => {
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
  });
  if(!designPreview) startIndex();
  watchRoots();
  await window.loadURL('quadfinder://app/index.html');
  if(designPreview){
    const deadline=Date.now()+15000;
    while(Date.now()<deadline && !(await window.webContents.executeJavaScript('window.__quadfinderReady === true')))await new Promise(resolve=>setTimeout(resolve,100));
    await window.webContents.executeJavaScript('document.fonts.ready');
    await new Promise(resolve=>setTimeout(resolve,400));
    await fs.mkdir(path.join(app.getAppPath(),'output'),{recursive:true});
    const capture=async name=>fs.writeFile(path.join(app.getAppPath(),'output',name),(await window.webContents.capturePage()).toPNG());
    await capture('design-refined.png');
    await window.webContents.executeJavaScript(`(async()=>{document.querySelector('#theme-select').value='light';await document.querySelector('#theme-select').onchange();})()`);
    await new Promise(resolve=>setTimeout(resolve,120));await capture('design-silver-light.png');
    await window.webContents.executeJavaScript(`showFileMenu(0,500,300)`);await new Promise(resolve=>setTimeout(resolve,100));await capture('design-light-menu.png');
    await window.webContents.executeJavaScript(`(async()=>{document.querySelector('#context-menu').hidden=true;document.querySelector('#theme-select').value='dark';await document.querySelector('#theme-select').onchange();})()`);
    await window.webContents.executeJavaScript(`document.querySelectorAll('.view-mode').forEach((select,i)=>{select.value=['details','list','icons','tiles'][i];select.dispatchEvent(new Event('change'));});`);
    await new Promise(resolve=>setTimeout(resolve,300));
    await capture('design-views.png');
    await window.webContents.executeJavaScript(`document.querySelectorAll('.view-mode').forEach(select=>{select.value='details';select.dispatchEvent(new Event('change'));});`);
    await window.webContents.executeJavaScript(`showFileMenu(0,500,300)`);await new Promise(resolve=>setTimeout(resolve,100));await capture('design-context-menu.png');
    await window.webContents.executeJavaScript(`showViewMenu(0,600,180)`);await new Promise(resolve=>setTimeout(resolve,100));await capture('design-view-options.png');
    await window.webContents.executeJavaScript(`document.querySelector('#context-menu').hidden=true`);
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
    setZoom(1,false);
    await new Promise(resolve=>setTimeout(resolve,100));
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
    result.views=await window.webContents.executeJavaScript(`(()=>{const results={};const pane=document.querySelector('.pane');for(const mode of ['details','list','icons','tiles']){const select=pane.querySelector('.view-mode');select.value=mode;select.dispatchEvent(new Event('change'));const table=pane.querySelector('.file-table'),row=pane.querySelector('.file-row');results[mode]=table.classList.contains('view-'+mode)&&!!row&&(getComputedStyle(pane.querySelector('.columns')).display==='none')===(mode!=='details');}return results;})()`);
    result.sidebarResize=await checkSidebarResize();
    await new Promise(resolve=>setTimeout(resolve,250));
    await saveQueue;
    result.sidebarSaved=JSON.parse(await fs.readFile(stateFile(),'utf8')).sidebarWidth===194;
    await window.loadURL('quadfinder://app/index.html');
    const restoreDeadline=Date.now()+10000;
    while(Date.now()<restoreDeadline && !(await window.webContents.executeJavaScript('window.__quadfinderReady===true')))await new Promise(resolve=>setTimeout(resolve,50));
    result.viewRestored=await window.webContents.executeJavaScript(`document.querySelector('.view-mode').value==='tiles'`);
    await window.webContents.executeJavaScript(`document.querySelector('.view-mode').value='details';document.querySelector('.view-mode').dispatchEvent(new Event('change'));`);
    result.sidebarRestored=await window.webContents.executeJavaScript('document.querySelector("#sidebar").getBoundingClientRect().width===194');
    functionSmokeRoot=await fs.mkdtemp(path.join(app.getAppPath(),'output','functional-smoke-'));
    result.viewOptions=await require('../scripts/view-smoke.cjs').run({window,root:functionSmokeRoot,appPath:app.getAppPath(),saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,250));await saveQueue;}});
    result.fileOperations=await require('../scripts/functional-smoke.cjs').run({window,root:functionSmokeRoot});
    result.refresh=await require('../scripts/refresh-smoke.cjs').run({window,root:functionSmokeRoot,notify:paths=>send('files:changed',paths),saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,250));await saveQueue;},networkRoot:process.env.QUADFINDER_TEST_NETWORK_ROOT,stateFile:stateFile(),rootsFile:rootsFile()});
    result.sidebar=await require('../scripts/sidebar-smoke.cjs').run({window,root:functionSmokeRoot,saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,250));await saveQueue;},stateFile:stateFile(),appPath:app.getAppPath()});
    result.recent=await require('../scripts/recent-smoke.cjs').run({window,root:functionSmokeRoot,saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,250));await saveQueue;},stateFile:stateFile()});
    result.mouseHistory=await require('../scripts/history-smoke.cjs').run({window,root:functionSmokeRoot});
    result.undo=await require('../scripts/undo-smoke.cjs').run({window,root:functionSmokeRoot});
    await window.webContents.executeJavaScript(`Promise.all(state.panes.map((_pane,index)=>navigate(index,${JSON.stringify(roots[0])})))`);
    await new Promise(resolve=>setTimeout(resolve,250));await saveQueue;
    const smokeOutputRoot=path.resolve(app.getAppPath(),'output');
    if(path.dirname(functionSmokeRoot)!==smokeOutputRoot||!path.basename(functionSmokeRoot).startsWith('functional-smoke-'))throw new Error('Unexpected test directory');
    await fs.rm(functionSmokeRoot,{recursive:true,force:true});functionSmokeRoot=null;
    result.zoom=await require('../scripts/zoom-smoke.cjs').run({window,stateFile:stateFile(),output:path.join(app.getAppPath(),'output'),saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,200));await saveQueue;}});
    result.theme=await require('../scripts/theme-smoke.cjs').run({window,stateFile:stateFile(),output:path.join(app.getAppPath(),'output'),saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,200));await saveQueue;}});
    result.panelResize=await require('../scripts/panel-smoke.cjs').run({window,stateFile:stateFile(),saveComplete:async()=>{await new Promise(resolve=>setTimeout(resolve,250));await saveQueue;}});
    await fs.mkdir(path.join(app.getAppPath(), 'output'), { recursive: true });
    await fs.writeFile(path.join(app.getAppPath(), 'output', 'smoke.png'), (await window.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(app.getAppPath(), 'output', 'smoke.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.exit(result.ready && result.panes === 4 && result.rows > 0 && result.twoPane && result.searchWorks && result.filterWorks && result.pathEditWorks && result.thumbnailWorks && Object.values(result.views).every(Boolean) && result.viewRestored && result.sidebarResize.works && result.sidebarSaved && result.sidebarRestored && result.sidebar.passed && result.refresh.passed && result.mouseHistory.passed && result.viewOptions.passed && result.fileOperations.passed && result.zoom.passed && result.theme.passed && result.recent.passed && result.panelResize.passed && result.undo.passed ? 0 : 1);
  }
}
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
if(ownsInstance)app.whenReady().then(setup).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {if(operations?.active()){event.preventDefault();window?.show();return;}if(zoomSaveTimer){event.preventDefault();clearTimeout(zoomSaveTimer);zoomSaveTimer=null;writeSettings({}).then(()=>app.quit()).catch(error=>send('view:error',error.message));return;}updater?.stop();worker?.terminate();rootWatchers.forEach(watcher=>watcher.close());folderWatchers.forEach(watcher=>watcher.close());clearTimeout(indexTimer);clearTimeout(changedTimer);});
