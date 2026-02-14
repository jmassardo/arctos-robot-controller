const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');

// Import and start the Express server
let server;
let mainWindow;
const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 5000;

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open G-Code File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'G-Code Files', extensions: ['gcode', 'nc', 'cnc', 'txt'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              try {
                const gcodeContent = await fs.readFile(filePath, 'utf-8');
                mainWindow.webContents.send('load-gcode-file', gcodeContent);
              } catch (error) {
                dialog.showErrorBox('Error', `Failed to load G-Code file: ${error.message}`);
              }
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Robot',
      submenu: [
        {
          label: 'Emergency Stop',
          accelerator: 'Escape',
          click: () => {
            mainWindow.webContents.send('emergency-stop');
          },
        },
        {
          label: 'Home All Axes',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            mainWindow.webContents.send('home-all-axes');
          },
        },
        { type: 'separator' },
        {
          label: 'Reset Position',
          click: () => {
            mainWindow.webContents.send('reset-position');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Arctos Robot Controller',
              message: 'Arctos Robot Controller',
              detail:
                'Desktop application for controlling multi-axis robotic arms\\n\\nVersion: 1.0.0\\nAuthor: Arctos Robotics',
            });
          },
        },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/jmassardo/arctos-robot-controller');
          },
        },
      ],
    },
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png'), // We'll create this
    title: 'Arctos Robot Controller',
    titleBarStyle: 'default',
    show: false, // Don't show until ready
  });

  // Wait for server to be ready then load the app
  const loadApp = () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Loading Electron app from: ${url}`);
    mainWindow.loadURL(url);
  };

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Focus on the app
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app after a short delay to ensure server is running
  setTimeout(loadApp, 2000);
}

// Start the Express server
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // Set Electron environment variable
      process.env.ELECTRON = 'true';
      process.env.NODE_ENV = 'production';

      // Import and start the server
      server = require('../server.js');

      // Give the server a moment to start
      setTimeout(() => {
        console.log(`Electron server started on port ${PORT}`);
        resolve();
      }, 1500);
    } catch (error) {
      console.error('Failed to start server:', error);
      reject(error);
    }
  });
}

// App event handlers
app.whenReady().then(async () => {
  try {
    // Start the Express server first
    await startServer();

    // Create the main window
    createWindow();

    // Create application menu
    createMenu();
  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Clean up server if needed
  if (server && server.close) {
    server.close();
  }
});

// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // In development, ignore certificate errors
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior
    callback(false);
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent, navigationUrl) => {
    navigationEvent.preventDefault();
    shell.openExternal(navigationUrl);
  });
});
