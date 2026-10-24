// Preload script for context isolation
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Video playback control methods
  play: () => ipcRenderer.send('play'),
  pause: () => ipcRenderer.send('pause'),
  seek: (time) => ipcRenderer.send('seek', time),
  setVolume: (volume) => ipcRenderer.send('set-volume', volume),
  getCurrentTime: () => ipcRenderer.send('get-current-time'),
  getDuration: () => ipcRenderer.send('get-duration'),
  
  // File operations
  loadVideo: (filePath) => ipcRenderer.send('load-video', filePath),
  
  // Status queries
  onStatusChange: (callback) => ipcRenderer.on('status-change', (event, status) => callback(status))
});
