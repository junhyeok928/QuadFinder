const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('quadfind', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  list: path => ipcRenderer.invoke('files:list', path),
  chooseFolder: () => ipcRenderer.invoke('files:choose'),
  open: path => ipcRenderer.invoke('files:open', path),
  reveal: path => ipcRenderer.invoke('files:reveal', path),
  mkdir: (parent, name) => ipcRenderer.invoke('files:mkdir', parent, name),
  search: (query, filter) => ipcRenderer.invoke('search', query, filter),
  reindex: () => ipcRenderer.invoke('index:rebuild'),
  saveLayout: state => ipcRenderer.invoke('layout:save', state),
  windowAction: action => ipcRenderer.invoke('window:action', action),
  onIndex: callback => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('index:status', handler);
    return () => ipcRenderer.removeListener('index:status', handler);
  }
}));
