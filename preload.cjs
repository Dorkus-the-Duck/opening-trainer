const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  revealData: () => ipcRenderer.invoke('data:reveal'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  content: {
    cached: () => ipcRenderer.invoke('content:cached'),
    onUpdated: (cb) => ipcRenderer.on('content:updated', (_e, pack) => cb(pack)),
  },
  onUpdateReady: (cb) => ipcRenderer.on('app:update-ready', (_e, info) => cb(info)),
  restartToUpdate: () => ipcRenderer.invoke('app:restart-to-update'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  proposals: {
    list: () => ipcRenderer.invoke('proposals:list'),
    review: (file, status, note) => ipcRenderer.invoke('proposals:review', file, status, note),
    approve: (file) => ipcRenderer.invoke('proposals:approve', file),
  },
  engine: {
    go: (req) => ipcRenderer.send('engine:go', req),
    stop: () => ipcRenderer.send('engine:stop'),
    onInfo: (cb) => ipcRenderer.on('engine:info', (_e, m) => cb(m)),
    onDone: (cb) => ipcRenderer.on('engine:done', (_e, m) => cb(m)),
  },
});
