const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAgentInfo: () => ipcRenderer.invoke('get-agent-info'),
  updateServerUrl: (url) => ipcRenderer.invoke('update-server-url', url),
  onStatusUpdate: (callback) => ipcRenderer.on('status', (event, data) => callback(data)),
  onMetricsUpdate: (callback) => ipcRenderer.on('metrics', (event, data) => callback(data)),
  onChatMessage: (callback) => ipcRenderer.on('chat', (event, data) => callback(data)),
  sendChatMessage: (text) => ipcRenderer.send('send-chat-message', text),
});
