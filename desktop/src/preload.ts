import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  getScreenStream: (sourceId: string) => ipcRenderer.invoke('get-screen-stream', sourceId),
  setSelectedScreen: (sourceId: string) => ipcRenderer.invoke('set-selected-screen', sourceId),
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url: string) => ipcRenderer.invoke('set-server-url', url),
});
