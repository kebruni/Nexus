const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { io } = require('socket.io-client');
const { resolveConfig, writePersistedConfig, CONFIG_FILE } = require('./runtimeConfig');
const { runtimePath } = require('./paths');
const { getSystemInfo, collectMetrics } = require('./metrics');
const { executeCommand, rebootComputer, shutdownComputer, getServices, serviceAction, lockScreen, soundAlarm } = require('./systemControl');
const { listDirectory, readFile, deleteFile } = require('./fileManager');
const { startStreaming, stopStreaming, simulateMouse, simulateKeyboard, listMonitors } = require('./screenCapture');
const { getClipboard, setClipboard } = require('./clipboard');
const notifier = require('node-notifier');

let mainWindow;
let tray;
let socket;
let metricsInterval;
let config = resolveConfig();
let connectionGeneration = 0;

// Agent ID lives in the user-writable runtime dir so it survives reinstalls
// and works inside Program Files (which is read-only when packaged).
function loadOrCreateAgentId() {
  const idFile = runtimePath('.agent-id');
  try {
    const existing = fs.readFileSync(idFile, 'utf-8').trim();
    if (existing) return existing;
  } catch (_) {}
  const newId = `agent-${os.hostname()}-${Date.now().toString(36)}`;
  try {
    fs.writeFileSync(idFile, newId, 'utf-8');
  } catch (err) {
    console.error('[AgentID] Failed to persist:', err.message);
  }
  return newId;
}
const AGENT_ID = loadOrCreateAgentId();

// Ограничение на один запуск
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 560,
    title: 'PC Control Hub Agent',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#111827',
    show: false
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile('ui/index.html');
  
  // mainWindow.webContents.openDevTools(); 

  const startHidden = process.argv.includes('--hidden');
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets/icon.png');
    
    // Проверяем, существует ли файл иконки
    if (!fs.existsSync(iconPath)) {
      console.log('Tray icon not found, skipping tray creation');
      return;
    }

    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Agent', click: () => mainWindow && mainWindow.show() },
      { label: 'Open config folder', click: () => shell.openPath(path.dirname(CONFIG_FILE)) },
      { type: 'separator' },
      { label: 'Exit', click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip(`PC Control Hub Agent\n${config.SERVER_URL}`);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow && mainWindow.show());
  } catch (e) {
    console.error('Tray creation failed:', e.message);
  }
}

if (process.platform === 'win32') {
  app.setAppUserModelId(app.name || 'PC Control Hub Agent');
}

// On Windows, auto-start the agent on user login when installed (so the agent
// behaves like a normal background utility — Slack/Discord/etc).
function enableAutoLaunchOnLogin() {
  try {
    if (process.platform !== 'win32' || !app.isPackaged) return;
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden'],
    });
  } catch (err) {
    console.error('[AutoLaunch]', err.message);
  }
}

app.whenReady().then(() => {
  enableAutoLaunchOnLogin();
  createWindow();
  createTray();
  startAgentLogic();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in background
  }
});

// ── Агентская логика ──────────────────────────────────

async function startAgentLogic() {
  // Capture the generation at entry. If reloadConnection() bumps it while
  // we're awaiting getSystemInfo(), this start is stale and we abort
  // before opening a second socket.
  const myGeneration = connectionGeneration;
  console.log(`[AGENT] Connecting to: ${config.SERVER_URL}/agent`);
  const systemInfo = await getSystemInfo();

  if (myGeneration !== connectionGeneration) {
    console.log('[AGENT] startAgentLogic aborted — superseded by newer reload');
    return;
  }

  const localSocket = io(`${config.SERVER_URL}/agent`, {
    auth: {
      agentKey: config.AGENT_KEY,
      agentId: AGENT_ID,
      ...systemInfo,
    },
    transports: ['polling', 'websocket'],
    upgrade: true,
    rememberUpgrade: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 20000
  });

  if (myGeneration !== connectionGeneration) {
    // Another reload landed between the await and io(); discard this socket.
    try { localSocket.removeAllListeners(); localSocket.disconnect(); } catch (_) {}
    return;
  }
  socket = localSocket;

  socket.on('connect', () => {
    console.log('[AGENT] Connected to server!');
    updateUI('status', { online: true, server: config.SERVER_URL });
    startMetricsCollection();
  });

  socket.on('connect_error', (err) => {
    console.error('[AGENT] Connection error:', err.message);
    updateUI('status', { online: false, error: err.message });
  });

  socket.on('disconnect', () => {
    updateUI('status', { online: false });
    stopMetricsCollection();
  });

  socket.on('chat:message', ({ text, senderName }) => {
    updateUI('chat', { text, sender: senderName });
    
    // Flash taskbar to attract attention
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(true);
    }
    
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: `Message from ${senderName || 'Admin'}`,
        body: text,
        icon: path.join(__dirname, 'assets/icon.png')
      });
      notification.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notification.show();
    } else {
      notifier.notify({
        title: `Message from ${senderName || 'Admin'}`,
        message: text,
        icon: path.join(__dirname, 'assets/icon.png'),
        appID: 'PC Control Hub Agent',
        sound: true,
        wait: true
      }, (err, response, metadata) => {
        // When user clicks the notification, show the window
        if (response === 'activate' || response === 'clicked') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      });
    }
  });

  socket.on('command:execute', async ({ command, requestId }) => {
    const result = await executeCommand(command);
    socket.emit('command:result', { ...result, requestId });
  });

  socket.on('metrics', (metrics) => {
    updateUI('metrics', metrics);
  });

  setupSocketHandlers(socket);
}

function setupSocketHandlers(s) {
  s.on('screen:start', (data) => startStreaming(s, data.fps, data.quality, data.monitor || 0));
  s.on('screen:stop', () => stopStreaming());
  s.on('screen:mouse', (data) => {
    const logMsg = data.type === 'wheel' 
      ? `[INPUT] Mouse wheel ${data.wheel > 0 ? 'up' : 'down'} at ${data.x},${data.y}`
      : `[INPUT] Mouse ${data.type || 'click'} ${data.button || 'left'} at ${data.x},${data.y}`;
    console.log(logMsg);
    simulateMouse(data.x, data.y, data.type, data.button, data.wheel);
  });
  s.on('screen:keyboard', (data) => {
    console.log(`[INPUT] Keyboard ${data.type || 'press'} key=${data.key}`);
    simulateKeyboard(data.key, data.type);
  });
  s.on('screen:getMonitors', async () => {
    const monitors = await listMonitors();
    s.emit('screen:monitors', { monitors });
  });

  s.on('file:list', (data) => s.emit('file:list:result', listDirectory(data.path)));
  s.on('file:download', (data) => s.emit('file:content:result', readFile(data.path)));
  s.on('file:delete', (data) => s.emit('file:list:result', deleteFile(data.path)));
  s.on('file:upload', (data) => {
    try {
      const targetDir = data.remotePath || os.tmpdir();
      const targetPath = path.join(targetDir, path.basename(data.fileName));
      fs.writeFileSync(targetPath, Buffer.from(data.fileData, 'base64'));
      s.emit('file:transfer:complete', { success: true, fileName: data.fileName, path: targetPath });
    } catch (e) {
      s.emit('file:transfer:complete', { success: false, error: e.message });
    }
  });

  s.on('services:list', async () => s.emit('services:list:result', await getServices()));
  s.on('service:action', async (data) => s.emit('service:action:result', await serviceAction(data.serviceName, data.action)));
  
  s.on('clipboard:get', async () => {
    const res = await getClipboard();
    if (res.success) s.emit('clipboard:data', { text: res.text });
  });
  s.on('clipboard:set', (data) => setClipboard(data.text));

  s.on('command:reboot', () => rebootComputer());
  s.on('command:shutdown', () => shutdownComputer());
  s.on('command:lockscreen', async () => {
    const result = await lockScreen();
    s.emit('command:result', { command: 'lockscreen', ...result });
  });
  s.on('command:alarm', async () => {
    const result = await soundAlarm();
    s.emit('command:result', { command: 'alarm', ...result });
  });
  s.on('ping:latency', (data) => s.emit('pong:latency', data));
}

function startMetricsCollection() {
  if (metricsInterval) clearInterval(metricsInterval);
  metricsInterval = setInterval(async () => {
    try {
      const metrics = await collectMetrics();
      socket.emit('metrics', metrics);
      updateUI('metrics', metrics);
    } catch (error) {
      console.error('[Metrics] collection failed:', error.message);
    }
  }, config.METRICS_INTERVAL);
}

function stopMetricsCollection() {
  clearInterval(metricsInterval);
}

function updateUI(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

ipcMain.handle('get-agent-info', async () => {
  return {
    hostname: os.hostname(),
    agentId: AGENT_ID,
    server: config.SERVER_URL,
    // Never send the raw key to the renderer. The UI only needs to know
    // whether one is configured so it can render the "leave blank to keep"
    // hint in the connection settings modal.
    agentKeyConfigured: !!config.AGENT_KEY && config.AGENT_KEY !== 'agent-connection-key',
    configFile: CONFIG_FILE,
  };
});

ipcMain.handle('update-server-url', async (_event, serverUrl) => {
  if (typeof serverUrl !== 'string' || !/^https?:\/\//i.test(serverUrl)) {
    return { success: false, error: 'Invalid URL' };
  }
  writePersistedConfig({ serverUrl: serverUrl.replace(/\/+$/, '') });
  reloadConnection();
  return { success: true };
});

ipcMain.handle('update-connection', async (_event, payload) => {
  const updates = {};
  if (payload && typeof payload.serverUrl === 'string' && payload.serverUrl.trim()) {
    if (!/^https?:\/\//i.test(payload.serverUrl.trim())) {
      return { success: false, error: 'Invalid URL — must start with http:// or https://' };
    }
    updates.serverUrl = payload.serverUrl.trim().replace(/\/+$/, '');
  }
  if (payload && typeof payload.agentKey === 'string' && payload.agentKey.trim()) {
    updates.agentKey = payload.agentKey.trim();
  }
  if (Object.keys(updates).length === 0) {
    return { success: false, error: 'Nothing to update' };
  }
  writePersistedConfig(updates);
  reloadConnection();
  return { success: true };
});

function reloadConnection() {
  // Bump the generation so any in-flight startAgentLogic() bails out
  // before it opens a duplicate socket, then tear down the current socket
  // and start a fresh one.
  connectionGeneration += 1;
  try {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    stopMetricsCollection();
  } catch (err) {
    console.error('[AGENT] reloadConnection teardown error:', err.message);
  }
  config = resolveConfig();
  updateUI('status', { online: false, server: config.SERVER_URL });
  startAgentLogic().catch((err) => {
    console.error('[AGENT] reloadConnection start error:', err.message);
  });
}

ipcMain.on('send-chat-message', (event, text) => {
  if (socket && socket.connected && text) {
    socket.emit('chat:message', { text, senderName: os.hostname() });
  }
});
