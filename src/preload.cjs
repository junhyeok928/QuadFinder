const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('quadfinderTheme',process.argv.includes('--quadfinder-theme=light')?'light':'dark');
if(process.argv.includes('--quadfinder-design-preview')) {
  contextBridge.exposeInMainWorld('quadfinderDesignPreview', true);
} else contextBridge.exposeInMainWorld('quadfind', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  folders:path=>ipcRenderer.invoke('files:folders',path),
  validateFolder:path=>ipcRenderer.invoke('files:validate-folder',path),
  refreshDrives:()=>ipcRenderer.invoke('navigation:drives'),
  list: path => ipcRenderer.invoke('files:list', path),
  preview:path=>ipcRenderer.invoke('files:preview',path),
  shellMenu:input=>ipcRenderer.invoke('files:shell-menu',input),
  writeClipboard:input=>ipcRenderer.invoke('files:clipboard-write',input),
  readClipboard:()=>ipcRenderer.invoke('files:clipboard-read'),
  copyPaths:paths=>ipcRenderer.invoke('files:copy-path',paths),
  thumbnail: path => ipcRenderer.invoke('files:thumbnail', path),
  chooseFolder: (addToIndex=true) => ipcRenderer.invoke('files:choose',addToIndex),
  open: path => ipcRenderer.invoke('files:open', path),
  reveal: path => ipcRenderer.invoke('files:reveal', path),
  mkdir: (parent, name) => ipcRenderer.invoke('files:mkdir', parent, name),
  rename:(source,name)=>ipcRenderer.invoke('files:rename',source,name),
  watch:paths=>ipcRenderer.invoke('files:watch',paths),
  startOperation:input=>ipcRenderer.invoke('operations:start',input),
  cancelOperation:id=>ipcRenderer.invoke('operations:cancel',id),
  clearOperations:()=>ipcRenderer.invoke('operations:clear'),
  undo:()=>ipcRenderer.invoke('operations:undo'),
  cancelUndo:()=>ipcRenderer.invoke('operations:undo-cancel'),
  checkUpdates:()=>ipcRenderer.invoke('updater:check'),
  installUpdate:()=>ipcRenderer.invoke('updater:install'),
  openReleases:()=>ipcRenderer.invoke('updater:releases'),
  onUpdater:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('updater:changed',handler);return ()=>ipcRenderer.removeListener('updater:changed',handler);},
  onUndo:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('undo:changed',handler);return ()=>ipcRenderer.removeListener('undo:changed',handler);},
  removeRoot:path=>ipcRenderer.invoke('roots:remove',path),
  addRoot:path=>ipcRenderer.invoke('roots:add',path),
  dropPaths:files=>files.map(file=>require('electron').webUtils.getPathForFile(file)),
  search: (query, filter) => ipcRenderer.invoke('search', query, filter),
  reindex: () => ipcRenderer.invoke('index:rebuild'),
  saveLayout: state => ipcRenderer.invoke('layout:save', state),
  setZoom:factor=>ipcRenderer.invoke('view:zoom',factor),
  setTheme:theme=>ipcRenderer.invoke('view:theme',theme),
  adjustZoom:direction=>ipcRenderer.invoke('view:zoom-step',direction),
  onHistory:callback=>{const handler=(_event,direction)=>callback(direction);ipcRenderer.on('navigation:history',handler);return ()=>ipcRenderer.removeListener('navigation:history',handler);},
  onZoom:callback=>{const handler=(_event,factor)=>callback(factor);ipcRenderer.on('view:zoom',handler);return ()=>ipcRenderer.removeListener('view:zoom',handler);},
  onViewError:callback=>{const handler=(_event,message)=>callback(message);ipcRenderer.on('view:error',handler);return ()=>ipcRenderer.removeListener('view:error',handler);},
  windowAction: action => ipcRenderer.invoke('window:action', action),
  onIndex: callback => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('index:status', handler);
    return () => ipcRenderer.removeListener('index:status', handler);
  },
  onFilesChanged:callback=>{const handler=(_event,paths)=>callback(paths);ipcRenderer.on('files:changed',handler);return ()=>ipcRenderer.removeListener('files:changed',handler);},
  onOperations:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('operations:changed',handler);return ()=>ipcRenderer.removeListener('operations:changed',handler);},
  onRoots:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('roots:changed',handler);return ()=>ipcRenderer.removeListener('roots:changed',handler);}
}));
