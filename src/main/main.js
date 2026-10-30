const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'renderer', 'index.html');

let mainWindow;
let backendInstance;

// Initialize the backend once
async function initializeBackend() {
  const VideoBackend = require('./backend.js');
  backendInstance = new VideoBackend();
  await backendInstance.init();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Open DevTools in development (remove in production)
  // if (process.env.NODE_ENV !== 'production') {
  //   mainWindow.webContents.openDevTools();
  // }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle IPC messages
ipcMain.handle('trim', async (event, { inputPath, startTime, endTime }) => {
  try {
    if (!backendInstance) {
      throw new Error('Backend not initialized');
    }
    const result = await backendInstance.trimVideo(inputPath, startTime, endTime);
    return result;
  } catch (error) {
    console.error('Trim error:', error);
    throw error;
  }
});

ipcMain.handle('split', async (event, { inputPath, splitTime }) => {
  try {
    if (!backendInstance) {
      throw new Error('Backend not initialized');
    }
    const result = await backendInstance.splitVideo(inputPath, splitTime);
    return result;
  } catch (error) {
    console.error('Split error:', error);
    throw error;
  }
});

ipcMain.handle('generate-thumbnails', async (event, { videoPath, frameCount }) => {
  try {
    if (!backendInstance) {
      throw new Error('Backend not initialized');
    }
    const result = await backendInstance.generateThumbnails(videoPath, frameCount || 10);
    return result;
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    throw error;
  }
});

app.whenReady().then(async () => {
  await initializeBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle any uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  console.error('Fatal error:', error);
  // Don't crash in production silently, but log for debugging
});
