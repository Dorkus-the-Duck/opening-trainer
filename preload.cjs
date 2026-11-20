const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  revealData: () => ipcRenderer.invoke('data:reveal'),
  engine: {
    go: (req) => ipcRenderer.send('engine:go', req),
    stop: () => ipcRenderer.send('engine:stop'),
    onInfo: (cb) => ipcRenderer.on('engine:info', (_e, m) => cb(m)),
    onDone: (cb) => ipcRenderer.on('engine:done', (_e, m) => cb(m)),
  },
});
