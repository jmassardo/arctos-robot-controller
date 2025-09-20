const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  loadGCodeFile: (callback) => {
    ipcRenderer.on('load-gcode-file', callback);
  },
  
  // Robot control
  emergencyStop: (callback) => {
    ipcRenderer.on('emergency-stop', callback);
  },
  
  homeAllAxes: (callback) => {
    ipcRenderer.on('home-all-axes', callback);
  },
  
  resetPosition: (callback) => {
    ipcRenderer.on('reset-position', callback);
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Platform info
  platform: process.platform,
  
  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});