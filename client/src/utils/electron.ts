// Utility functions for Electron integration

export const isElectron = (): boolean => {
  return !!(window as any).electronAPI || navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
};

export const getElectronAPI = () => {
  return (window as any).electronAPI;
};

// Initialize Electron API listeners if available
export const initializeElectronListeners = () => {
  const electronAPI = getElectronAPI();
  
  if (electronAPI) {
    // G-Code file loading from menu
    electronAPI.loadGCodeFile((event: any, gcodeContent: string) => {
      // Dispatch custom event that GCodeControl component can listen to
      window.dispatchEvent(new CustomEvent('electron-load-gcode', { 
        detail: gcodeContent 
      }));
    });

    // Emergency stop from menu/keyboard shortcut
    electronAPI.emergencyStop((event: any) => {
      // Dispatch custom event for emergency stop
      window.dispatchEvent(new CustomEvent('electron-emergency-stop'));
    });

    // Home all axes from menu/keyboard shortcut
    electronAPI.homeAllAxes((event: any) => {
      // Dispatch custom event for home all axes
      window.dispatchEvent(new CustomEvent('electron-home-all-axes'));
    });

    // Reset position from menu
    electronAPI.resetPosition((event: any) => {
      // Dispatch custom event for reset position
      window.dispatchEvent(new CustomEvent('electron-reset-position'));
    });

    console.log('Electron API listeners initialized');
  }
};

// Clean up Electron API listeners
export const cleanupElectronListeners = () => {
  const electronAPI = getElectronAPI();
  
  if (electronAPI) {
    electronAPI.removeAllListeners('load-gcode-file');
    electronAPI.removeAllListeners('emergency-stop');
    electronAPI.removeAllListeners('home-all-axes');
    electronAPI.removeAllListeners('reset-position');
    console.log('Electron API listeners cleaned up');
  }
};