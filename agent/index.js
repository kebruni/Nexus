const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');
const notifier = require('node-notifier');
const config = require('./config');
const { getSystemInfo, collectMetrics } = require('./metrics');
const { executeCommand, rebootComputer, shutdownComputer, getServices, serviceAction, lockScreen, soundAlarm } = require('./systemControl');
const { listDirectory, readFile, deleteFile } = require('./fileManager');
const { startStreaming, stopStreaming, simulateMouse, simulateKeyboard, listMonitors } = require('./screenCapture');
const vnc = require('./vnc');
const { getClipboard, setClipboard } = require('./clipboard');
const { listProcesses, killProcess } = require('./processManager');

function getOrCreateAgentId() {
  const idFile = path.join(__dirname, '.agent-id');
  try {
    const existing = fs.readFileSync(idFile, 'utf-8').trim();
    if (existing) return existing;
  } catch (_) {}
  const newId = `agent-${os.hostname()}-${Date.now().toString(36)}`;
  fs.writeFileSync(idFile, newId, 'utf-8');
  return newId;
}

const AGENT_ID = getOrCreateAgentId();
let metricsInterval = null;

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          PC Control Hub — Agent                      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Hostname:  ${os.hostname()}`);
  console.log(`  Agent ID:  ${AGENT_ID}`);
  console.log(`  Server:    ${config.SERVER_URL}`);
  console.log(`  Connecting...`);

  // Collect system info for registration
  const systemInfo = await getSystemInfo();

  // Connect to server
  const socket = io(`${config.SERVER_URL}/agent`, {
    auth: {
      agentKey: config.AGENT_KEY,
      agentId: AGENT_ID,
      ...systemInfo,
    },
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
  });

  // ── Connection Events ──────────────────────────────────
  socket.on('connect', () => {
    console.log(`  ✓ Connected to server`);
    startMetricsCollection(socket);
  });

  socket.on('disconnect', (reason) => {
    console.log(`  ✗ Disconnected: ${reason}`);
    stopMetricsCollection();
    stopStreaming();
    vnc.disconnect();
  });

  socket.on('connect_error', (error) => {
    console.log(`  ✗ Connection error: ${error.message}`);
  });

  // ── Command Handlers ───────────────────────────────────

  // Execute command
  socket.on('command:execute', async ({ command, requestId }) => {
    console.log(`  [CMD] Executing: ${command}`);
    const result = await executeCommand(command);
    socket.emit('command:result', { ...result, requestId });
  });

  // Reboot
  socket.on('command:reboot', async () => {
    console.log('  [CMD] Reboot requested');
    const result = await rebootComputer();
    socket.emit('command:result', { command: 'reboot', ...result });
  });

  // Shutdown
  socket.on('command:shutdown', async () => {
    console.log('  [CMD] Shutdown requested');
    const result = await shutdownComputer();
    socket.emit('command:result', { command: 'shutdown', ...result });
  });

  // Lock Screen
  socket.on('command:lockscreen', async () => {
    console.log('  [CMD] Lock screen requested');
    const result = await lockScreen();
    socket.emit('command:result', { command: 'lockscreen', ...result });
  });

  // Sound Alarm
  socket.on('command:alarm', async () => {
    console.log('  [CMD] Alarm requested');
    const result = await soundAlarm();
    socket.emit('command:result', { command: 'alarm', ...result });
  });

  // ── Process Manager Handlers ───────────────────────────
  socket.on('processes:list', async ({ limit, requestId } = {}) => {
    const result = await listProcesses({ limit });
    socket.emit('processes:list:result', { ...result, requestId });
  });

  socket.on('processes:kill', async ({ pid, requestId }) => {
    console.log(`  [PROC] Kill request pid=${pid}`);
    const result = killProcess(pid);
    socket.emit('processes:kill:result', { ...result, requestId });
  });

  // ── Service Handlers ───────────────────────────────────

  socket.on('services:list', async () => {
    console.log('  [SVC] Listing services');
    const result = await getServices();
    socket.emit('services:list:result', result);
  });

  socket.on('service:action', async ({ serviceName, action }) => {
    console.log(`  [SVC] ${action} service: ${serviceName}`);
    const result = await serviceAction(serviceName, action);
    socket.emit('service:action:result', result);
  });

  // ── File Handlers ──────────────────────────────────────

  socket.on('file:list', ({ path: dirPath }) => {
    console.log(`  [FILE] List: ${dirPath}`);
    const result = listDirectory(dirPath);
    socket.emit('file:list:result', result);
  });

  socket.on('file:download', ({ path: filePath }) => {
    console.log(`  [FILE] Download: ${filePath}`);
    const result = readFile(filePath);
    socket.emit('file:content:result', result);
  });

  socket.on('file:delete', ({ path: filePath }) => {
    console.log(`  [FILE] Delete: ${filePath}`);
    const result = deleteFile(filePath);
    socket.emit('file:list:result', result); // Trigger a refresh
  });

  // ── Screen Handlers (legacy Socket.IO — kept for fallback) ──
  // VNC WebSocket module handles screen streaming, input, and
  // monitor listing. These Socket.IO handlers remain as a fallback
  // for older dashboards that have not upgraded to the VNC viewer.

  socket.on('screen:start', ({ quality, fps, monitor }) => {
    console.log(`  [SCREEN/fallback] Start streaming (${fps} FPS, quality ${quality}, monitor ${monitor || 0})`);
    startStreaming(socket, fps, quality, monitor || 0);
  });

  socket.on('screen:stop', () => {
    console.log('  [SCREEN/fallback] Stop streaming');
    stopStreaming();
  });

  socket.on('screen:mouse', ({ x, y, type, button }) => {
    simulateMouse(x, y, type, button);
  });

  socket.on('screen:keyboard', ({ key, type }) => {
    simulateKeyboard(key, type);
  });

  socket.on('screen:getMonitors', async () => {
    const monitors = await listMonitors();
    socket.emit('screen:monitors', { monitors });
  });

  // ── VNC WebSocket (primary screen channel) ─────────────
  vnc.connect(AGENT_ID, config.AGENT_KEY);

  // ── Chat Handler ───────────────────────────────────────
  socket.on('chat:message', ({ text, senderName }) => {
    console.log(`  [CHAT] From ${senderName}: ${text}`);
    
    notifier.notify({
      title: `Message from ${senderName || 'Admin'}`,
      message: text,
      sound: true,
      wait: false
    });
  });

  // ── Clipboard Handlers ─────────────────────────────────
  socket.on('clipboard:get', async () => {
    const result = await getClipboard();
    if (result.success) {
      socket.emit('clipboard:data', { text: result.text });
    }
  });

  socket.on('clipboard:set', async ({ text }) => {
    console.log('  [CLIP] Setting clipboard');
    await setClipboard(text);
  });

  // ── Ping/Pong for Latency ──────────────────────────────
  socket.on('ping:latency', (data) => {
    socket.emit('pong:latency', data);
  });

  // ── File Upload (from dashboard to agent) ──────────────
  socket.on('file:upload', ({ fileName, fileData, remotePath }) => {
    try {
      const targetDir = remotePath || os.tmpdir();
      const safeFileName = path.basename(fileName);
      const targetPath = path.join(targetDir, safeFileName);
      const buffer = Buffer.from(fileData, 'base64');
      fs.writeFileSync(targetPath, buffer);
      console.log(`  [FILE] Uploaded: ${targetPath} (${buffer.length} bytes)`);
      socket.emit('file:transfer:complete', {
        success: true,
        fileName,
        path: targetPath,
        size: buffer.length,
      });
    } catch (error) {
      console.error(`  [FILE] Upload error: ${error.message}`);
      socket.emit('file:transfer:complete', {
        success: false,
        fileName,
        error: error.message,
      });
    }
  });
}

// ── Metrics Collection ──────────────────────────────────
function startMetricsCollection(socket) {
  stopMetricsCollection();
  // Send immediately
  sendMetrics(socket);
  // Then periodically
  metricsInterval = setInterval(() => sendMetrics(socket), config.METRICS_INTERVAL);
}

function stopMetricsCollection() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

async function sendMetrics(socket) {
  try {
    const metrics = await collectMetrics();
    socket.emit('metrics', metrics);
  } catch (error) {
    console.error('  [Metrics Error]', error.message);
  }
}

// ── Start Agent ──────────────────────────────────────────
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
