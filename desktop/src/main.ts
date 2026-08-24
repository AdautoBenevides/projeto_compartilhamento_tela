import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let selectedScreenSourceId: string = '';

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(800, width),
    height: Math.min(600, height),
    title: 'Screen Share',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    resizable: true,
    minimizable: true,
    maximizable: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log renderer crashes for debugging
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer crashed:', details.reason, details.exitCode);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Main] Renderer became unresponsive');
  });
}

app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  setupIPC();
});

app.on('window-all-closed', () => {
  app.quit();
});

/**
 * Setup media permissions and display-capture handler.
 * Uses setDisplayMediaRequestHandler to auto-grant screen capture
 * via desktopCapturer (the modern Electron approach).
 * The old getUserMedia + chromeMediaSource: 'desktop' is broken in Electron 28+
 * (see electron/electron#46369 and electron/electron#47512).
 */
function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.log('[Main] Permission request:', permission);
    if (permission === 'media' || (permission as string) === 'display-capture') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, _details) => {
    if (permission === 'media' || (permission as string) === 'display-capture') {
      return true;
    }
    return false;
  });

  // This is the KEY fix: handle getDisplayMedia requests by auto-selecting the screen.
  // When the renderer calls navigator.mediaDevices.getDisplayMedia(),
  // this handler intercepts it and grants access to the selected screen automatically.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Find the source matching the user's selection, or fall back to the first one
      const selectedId = selectedScreenSourceId;
      const source = sources.find((s) => s.id === selectedId) || sources[0];
      console.log('[Main] Auto-granting display media for:', source?.name);
      callback({ video: source, audio: 'loopback' });
    }).catch((err) => {
      console.error('[Main] Failed to get display media sources:', err);
      callback(null as any);
    });
  });
}

function setupIPC(): void {
  ipcMain.handle('get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
      });
      console.log('[Main] Found', sources.length, 'screens');
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
      }));
    } catch (error: any) {
      console.error('[Main] Failed to get sources:', error);
      return [];
    }
  });

  ipcMain.handle('get-screen-stream', async (_event, _sourceId: string) => {
    // This handler exists for API compatibility.
    // Screen capture is now handled via setDisplayMediaRequestHandler + getDisplayMedia.
    return { success: true };
  });

  ipcMain.handle('set-selected-screen', (_event, sourceId: string) => {
    selectedScreenSourceId = sourceId;
    console.log('[Main] Selected screen:', sourceId);
    return true;
  });

  ipcMain.handle('get-server-url', () => {
    return process.env.SIGNAL_SERVER_URL || 'http://localhost:3001';
  });

  ipcMain.handle('set-server-url', (_event, url: string) => {
    process.env.SIGNAL_SERVER_URL = url;
    return true;
  });
}
