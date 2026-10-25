const { contextBridge, ipcRenderer } = require('electron');

const invoke = (method, ...args) => ipcRenderer.invoke(`naturalwrite:${method}`, ...args);
contextBridge.exposeInMainWorld('naturalwrite', Object.freeze({
  load: () => invoke('load'),
  saveProfile: profile => invoke('saveProfile', profile),
  deleteProfile: id => invoke('deleteProfile', id),
  setActiveProfile: id => invoke('setActiveProfile', id),
  saveDocument: document => invoke('saveDocument', document),
  deleteDocument: id => invoke('deleteDocument', id),
  importSamples: () => invoke('importSamples'),
  exportDocument: document => invoke('exportDocument', document),
  revise: input => invoke('revise', input),
  saveProviderConfig: config => invoke('saveProviderConfig', config),
  openDataFolder: () => invoke('openDataFolder'),
}));
