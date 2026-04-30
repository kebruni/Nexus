const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const store = require('./store');
const { authenticate, changeAdminPassword, authMiddleware, socketAuthMiddleware, agentAuthMiddleware, logSecurityWarnings, isMustChangePassword } = require('./auth');

/* ── Local file-system helpers (server machine) ────────── */
const os = require('os');
function localListDirectory(dirPath) {
  try {
    const defaultPath = process.platform === 'win32' ? 'C:\\' : '/';
    const resolvedPath = path.resolve(dirPath || defaultPath);
    const items = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const files = [];
    for (const item of items) {
      try {
        const fullPath = path.join(resolvedPath, item.name);
        const stats = fs.statSync(fullPath);
        files.push({
          name: item.name, path: fullPath,
          isDirectory: item.isDirectory(), size: stats.size,
          modified: stats.mtime.toISOString(), created: stats.birthtime.toISOString(),
        });
      } catch {
        files.push({
          name: item.name, path: path.join(resolvedPath, item.name),
          isDirectory: item.isDirectory(), size: 0,
          modified: null, created: null, error: 'Access denied',
        });
      }
    }
    return { success: true, path: resolvedPath, parentPath: path.dirname(resolvedPath), files };
  } catch (error) {
    return { success: false, path: dirPath, error: error.message, files: [] };
  }
}

function localReadFile(filePath) {
  try {
    const resolved = path.resolve(filePath);
    const stats = fs.statSync(resolved);
    if (stats.size > 10 * 1024 * 1024) return { success: false, error: 'File too large (max 10MB)' };
    const content = fs.readFileSync(resolved);
    return { success: true, path: resolved, name: path.basename(resolved), size: stats.size, content: content.toString('base64') };
  } catch (error) {
    return { success: false, path: filePath, error: error.message };
  }
}

function localWriteFile(fileName, base64Data, destDir) {
  try {
    const targetDir = path.resolve(destDir || 'C:\\');
    const targetPath = path.join(targetDir, fileName);
    // Prevent path traversal
    if (!targetPath.startsWith(targetDir)) return { success: false, error: 'Invalid path' };
    fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
    return { success: true, path: targetPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for screenshots
  pingInterval: 30000,
  pingTimeout: 60000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── REST API Routes ───────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Agent installer download ──────────────────────────────
// The Windows installer is produced by `npm --prefix agent run build`
// (electron-builder NSIS target) and lands in `agent/dist-gui/`. CI
// (`.github/workflows/build-agent-installer.yml`) does the same on
// `windows-latest` and uploads the artifact. We resolve the latest
// `Nexus-Agent-Setup-*.exe` and stream it to the browser.
function findInstallerArtifact() {
  const distDir = path.join(__dirname, '..', 'agent', 'dist-gui');
  try {
    const entries = fs.readdirSync(distDir);
    const candidates = entries
      .filter((name) => /^Nexus-Agent-Setup-.*\.exe$/.test(name))
      .map((name) => {
        const full = path.join(distDir, name);
        return { name, full, mtime: fs.statSync(full).mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return candidates[0] || null;
  } catch (_) {
    return null;
  }
}

app.get('/api/agent/installer/info', (req, res) => {
  const artifact = findInstallerArtifact();
  if (!artifact) {
    return res.status(404).json({
      available: false,
      hint: 'Run "npm --prefix agent run build" or download from CI artifacts',
    });
  }
  const stats = fs.statSync(artifact.full);
  const m = artifact.name.match(/Nexus-Agent-Setup-(.+)\.exe$/);
  res.json({
    available: true,
    fileName: artifact.name,
    version: m ? m[1] : null,
    size: stats.size,
    modified: stats.mtime.toISOString(),
    downloadUrl: '/api/agent/installer/download',
  });
});

app.get('/api/agent/installer/download', (req, res) => {
  const artifact = findInstallerArtifact();
  if (!artifact) {
    return res.status(404).send('Installer not built. Run `npm --prefix agent run build` first.');
  }
  res.download(artifact.full, 'Nexus-Agent-Setup.exe');
});

// Legacy URL kept for backward compatibility with the dashboard tile that
// previously linked to /AgentSetup.exe.
app.get('/AgentSetup.exe', (req, res) => res.redirect(302, '/api/agent/installer/download'));

// Rate limiter for login
const loginAttempts = new Map();

// Login
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (loginAttempts.has(ip)) {
    const attempts = loginAttempts.get(ip);
    // Filter attempts older than 15 minutes
    const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
    if (recentAttempts.length >= 5) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }
    recentAttempts.push(now);
    loginAttempts.set(ip, recentAttempts);
  } else {
    loginAttempts.set(ip, [now]);
  }

  const { username, password } = req.body;
  const result = authenticate(username, password);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Clear attempts on successful login
  loginAttempts.delete(ip);
  store.addEvent('admin_login', `Admin ${username} logged in`);
  res.json(result);
});

// Verify token
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user, mustChangePassword: isMustChangePassword() });
});

// Change admin password (used to clear the mustChangePassword flag set on first boot).
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = changeAdminPassword(currentPassword, newPassword);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('admin_password_changed', `Admin ${req.user.username} changed their password`);
  res.json({ success: true });
});

// Get all agents
app.get('/api/agents', authMiddleware, (req, res) => {
  res.json(store.getAllAgents());
});

// Get single agent
app.get('/api/agents/:id', authMiddleware, (req, res) => {
  const agent = store.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Get metrics history for agent
app.get('/api/agents/:id/metrics', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 60;
  res.json(store.getMetricsHistory(req.params.id, limit));
});

// Get event log
app.get('/api/events', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const agentId = req.query.agentId || null;
  res.json(store.getEvents(limit, agentId));
});

// ── Chat API ──────────────────────────────────────────────
app.get('/api/chat/:agentId', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(store.getChatMessages(req.params.agentId, limit));
});

// ── Alerts API ────────────────────────────────────────────
app.get('/api/alerts', authMiddleware, (req, res) => {
  res.json(store.getAlerts());
});

app.get('/api/alerts/unread', authMiddleware, (req, res) => {
  res.json(store.getUnacknowledgedAlerts());
});

app.post('/api/alerts/:id/acknowledge', authMiddleware, (req, res) => {
  const alert = store.acknowledgeAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

// ── Alert Rules API ───────────────────────────────────────
app.get('/api/alert-rules', authMiddleware, (req, res) => {
  res.json(store.getAlertRules());
});

app.post('/api/alert-rules', authMiddleware, (req, res) => {
  const rule = store.addAlertRule(req.body);
  store.addEvent('alert_rule_created', `Alert rule "${rule.name}" created`);
  res.json(rule);
});

app.put('/api/alert-rules/:id', authMiddleware, (req, res) => {
  const rule = store.updateAlertRule(req.params.id, req.body);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  res.json(rule);
});

app.delete('/api/alert-rules/:id', authMiddleware, (req, res) => {
  store.deleteAlertRule(req.params.id);
  res.json({ success: true });
});

// ── Groups API ────────────────────────────────────────────
app.get('/api/groups', authMiddleware, (req, res) => {
  res.json(store.getGroups());
});

app.post('/api/groups', authMiddleware, (req, res) => {
  const { name, color } = req.body;
  const group = store.addGroup(name, color);
  store.addEvent('group_created', `Group "${name}" created`);
  res.json(group);
});

app.delete('/api/groups/:name', authMiddleware, (req, res) => {
  store.deleteGroup(req.params.name);
  res.json({ success: true });
});

app.put('/api/agents/:id/group', authMiddleware, (req, res) => {
  const agent = store.setAgentGroup(req.params.id, req.body.group);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// ── Scripts API ───────────────────────────────────────────
app.get('/api/scripts', authMiddleware, (req, res) => {
  res.json(store.getScripts());
});

app.post('/api/scripts', authMiddleware, (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  const script = store.addScript({ name, code });
  store.addEvent('script_created', `Script "${name}" created`);
  res.json(script);
});

app.delete('/api/scripts/:id', authMiddleware, (req, res) => {
  store.deleteScript(req.params.id);
  res.json({ success: true });
});

// ── Socket.IO Namespaces ──────────────────────────────────

// Agent namespace — agents connect here
const agentNsp = io.of('/agent');
agentNsp.use(agentAuthMiddleware);

// Dashboard namespace — web clients connect here
const dashNsp = io.of('/dashboard');
dashNsp.use(socketAuthMiddleware);

// ── Agent Socket Handlers ─────────────────────────────────
agentNsp.on('connection', (socket) => {
  const agentInfo = socket.handshake.auth;
  const agentId = agentInfo.agentId || socket.id;

  console.log(`[Agent Connected] ${agentInfo.hostname} (${agentId})`);

  // Register agent in store
  const agent = store.registerAgent(agentId, agentInfo);

  // Notify dashboard clients
  dashNsp.emit('agent:connected', agent);
  dashNsp.emit('agents:list', store.getAllAgents());

  // Start periodic latency ping
  const pingInterval = setInterval(() => {
    socket.emit('ping:latency', { timestamp: Date.now() });
  }, 10000);

  // ─ Receive metrics from agent
  socket.on('metrics', (metrics) => {
    store.updateMetrics(agentId, metrics);
    // Forward to all dashboard clients that are subscribed to this agent
    dashNsp.emit('agent:metrics', { agentId, metrics, timestamp: new Date().toISOString() });

    // Check alert rules
    const newAlerts = store.checkAlerts(agentId, metrics);
    if (newAlerts.length > 0) {
      for (const alert of newAlerts) {
        store.addEvent('alert_triggered', alert.message, agentId);
        dashNsp.emit('alert:new', alert);
      }
    }
  });

  // ─ Receive command result from agent
  socket.on('command:result', (data) => {
    store.addEvent('command_result', `Command result from ${agent.hostname}: ${data.command}`, agentId);
    dashNsp.emit('command:result', { agentId, ...data });
  });

  // ─ Receive file list from agent
  socket.on('file:list:result', (data) => {
    dashNsp.emit('file:list:result', { agentId, ...data });
  });

  // ─ Receive file content from agent
  socket.on('file:content:result', (data) => {
    dashNsp.emit('file:content:result', { agentId, ...data });
  });

  // ─ Receive services list from agent
  socket.on('services:list:result', (data) => {
    dashNsp.emit('services:list:result', { agentId, ...data });
  });

  // ─ Receive service action result from agent
  socket.on('service:action:result', (data) => {
    dashNsp.emit('service:action:result', { agentId, ...data });
  });

  // ─ Receive screenshot from agent
  socket.on('screen:frame', (data) => {
    dashNsp.emit('screen:frame', { agentId, ...data });
  });

  // ─ Receive chat message from agent
  socket.on('chat:message', (data) => {
    const msg = store.addChatMessage(agentId, 'agent', data.senderName || agentInfo.hostname, data.text);
    dashNsp.emit('chat:message', msg);
  });

  // ─ Ping / pong for latency measurement
  socket.on('pong:latency', (data) => {
    const latency = Date.now() - data.timestamp;
    store.updateLatency(agentId, latency);
    dashNsp.emit('agent:latency', { agentId, latency });
  });

  // ─ Clipboard data from agent
  socket.on('clipboard:data', (data) => {
    dashNsp.emit('clipboard:data', { agentId, ...data });
  });

  // ─ Remote cursor position from agent
  socket.on('screen:cursor', (data) => {
    dashNsp.emit('screen:cursor', { agentId, ...data });
  });

  // ─ Multi-monitor info from agent
  socket.on('screen:monitors', (data) => {
    dashNsp.emit('screen:monitors', { agentId, monitors: data.monitors });
  });

  // ─ File transfer progress from agent
  socket.on('file:transfer:progress', (data) => {
    dashNsp.emit('file:transfer:progress', { agentId, ...data });
  });

  socket.on('file:transfer:complete', (data) => {
    dashNsp.emit('file:transfer:complete', { agentId, ...data });
  });

  socket.on('file:upload:data', (data) => {
    // Agent is sending a file to the dashboard
    dashNsp.emit('file:upload:data', { agentId, ...data });
  });

  // ─ Agent disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[Agent Disconnected] ${agentInfo.hostname} (${agentId}) — ${reason}`);
    clearInterval(pingInterval);
    store.removeAgent(agentId);
    dashNsp.emit('agent:disconnected', { agentId });
    dashNsp.emit('agents:list', store.getAllAgents());
  });
});

// ── Dashboard Socket Handlers ─────────────────────────────
dashNsp.on('connection', (socket) => {
  console.log(`[Dashboard Connected] ${socket.user.username}`);

  // Send current agents list
  socket.emit('agents:list', store.getAllAgents());

  // ─ Request agents list on demand (for SPA navigation)
  socket.on('agents:requestList', () => {
    socket.emit('agents:list', store.getAllAgents());
  });

  // ─ Request command execution on agent
  socket.on('command:execute', ({ agentId, command }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_sent', `Admin sent command to ${agentId}: ${command}`, agentId);
      agentSocket.emit('command:execute', { command, requestId: Date.now().toString() });
    } else {
      socket.emit('command:result', { agentId, error: 'Agent not connected', command });
    }
  });

  // ─ Reboot
  socket.on('command:reboot', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_reboot', `Admin sent reboot to ${agentId}`, agentId);
      agentSocket.emit('command:reboot');
    }
  });

  // ─ Shutdown
  socket.on('command:shutdown', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_shutdown', `Admin sent shutdown to ${agentId}`, agentId);
      agentSocket.emit('command:shutdown');
    }
  });

  // ─ Lock Screen
  socket.on('command:lockscreen', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_lock', `Admin locked screen on ${agentId}`, agentId);
      agentSocket.emit('command:lockscreen');
    }
  });

  // ─ Sound Alarm
  socket.on('command:alarm', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_alarm', `Admin triggered alarm on ${agentId}`, agentId);
      agentSocket.emit('command:alarm');
    }
  });

  // ─ File operations
  socket.on('file:list', ({ agentId, dirPath }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('file:list', { path: dirPath });
    } else {
      socket.emit('file:list:result', { agentId, error: 'Agent not connected' });
    }
  });

  socket.on('file:download', ({ agentId, filePath }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('file_download', `Admin downloaded file: ${filePath}`, agentId);
      agentSocket.emit('file:download', { path: filePath });
    }
  });

  socket.on('file:delete', ({ agentId, filePath }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('file_delete', `Admin deleted file: ${filePath}`, agentId);
      agentSocket.emit('file:delete', { path: filePath });
    }
  });

  // ─ Local (server) file operations
  socket.on('local:file:list', ({ dirPath }) => {
    const result = localListDirectory(dirPath);
    socket.emit('local:file:list:result', result);
  });

  socket.on('local:file:read', ({ filePath }) => {
    const result = localReadFile(filePath);
    socket.emit('local:file:read:result', result);
  });

  // ─ Transfer: local → agent (push file from server disk to agent)
  socket.on('local:transfer:to-agent', ({ filePath, destAgentId, destPath, transferId }) => {
    const dstSocket = findAgentSocket(destAgentId);
    if (!dstSocket) {
      socket.emit('file:transfer:status', { transferId, success: false, error: 'Agent not connected' });
      return;
    }
    const fileName = path.basename(filePath);
    store.addEvent('file_transfer', `Local transfer "${fileName}" to ${destAgentId}`, destAgentId);

    socket.emit('file:transfer:status', { transferId, status: 'reading', fileName });
    const readResult = localReadFile(filePath);
    if (!readResult.success) {
      socket.emit('file:transfer:status', { transferId, success: false, error: readResult.error || 'Failed to read local file' });
      return;
    }

    socket.emit('file:transfer:status', { transferId, status: 'writing', fileName, size: readResult.size });
    dstSocket.emit('file:upload', { fileName: readResult.name, fileData: readResult.content, remotePath: destPath });
    dstSocket.once('file:transfer:complete', (result) => {
      socket.emit('file:transfer:status', { transferId, success: result.success, fileName: readResult.name, size: readResult.size, destPath: result.path, error: result.error });
    });
  });

  // ─ Transfer: agent → local (pull file from agent to server disk)
  socket.on('local:transfer:from-agent', ({ sourceAgentId, filePath, destPath, transferId }) => {
    const srcSocket = findAgentSocket(sourceAgentId);
    if (!srcSocket) {
      socket.emit('file:transfer:status', { transferId, success: false, error: 'Agent not connected' });
      return;
    }
    const fileName = filePath.split(/[/\\]/).pop();
    store.addEvent('file_transfer', `Transfer "${fileName}" from ${sourceAgentId} to server`, sourceAgentId);

    socket.emit('file:transfer:status', { transferId, status: 'reading', fileName });
    srcSocket.emit('file:download', { path: filePath });
    srcSocket.once('file:content:result', (data) => {
      if (!data.success) {
        socket.emit('file:transfer:status', { transferId, success: false, error: data.error || 'Failed to read from agent' });
        return;
      }
      socket.emit('file:transfer:status', { transferId, status: 'writing', fileName: data.name, size: data.size });
      const writeResult = localWriteFile(data.name, data.content, destPath);
      socket.emit('file:transfer:status', { transferId, success: writeResult.success, fileName: data.name, size: data.size, destPath: writeResult.path, error: writeResult.error });
      if (writeResult.success) {
        // Send updated local listing to refresh the panel
        const listResult = localListDirectory(destPath);
        socket.emit('local:file:list:result', listResult);
      }
    });
  });

  // ─ Services
  socket.on('services:list', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('services:list');
    }
  });

  socket.on('service:action', ({ agentId, serviceName, action }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('service_action', `Admin ${action} service ${serviceName}`, agentId);
      agentSocket.emit('service:action', { serviceName, action });
    }
  });

  // ─ Screen streaming (superseded by screen:start with monitor selection above)
  socket.on('screen:stop', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('screen:stop');
    }
  });

  socket.on('screen:mouse', ({ agentId, x, y, type, button, wheel }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      const logMsg = type === 'wheel'
        ? `[INPUT] Forward wheel to ${agentId}: ${wheel > 0 ? 'up' : 'down'} @ ${x},${y}`
        : `[INPUT] Forward mouse to ${agentId}: ${type || 'click'} ${button || 'left'} @ ${x},${y}`;
      console.log(logMsg);
      agentSocket.emit('screen:mouse', { x, y, type, button, wheel });
    } else {
      console.log(`[INPUT] Mouse dropped: agent ${agentId} not connected`);
    }
  });

  socket.on('screen:keyboard', ({ agentId, key, type }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      console.log(`[INPUT] Forward keyboard to ${agentId}: ${type || 'press'} key=${key}`);
      agentSocket.emit('screen:keyboard', { key, type });
    } else {
      console.log(`[INPUT] Keyboard dropped: agent ${agentId} not connected`);
    }
  });

  // ─ Chat from admin to agent
  socket.on('chat:send', ({ agentId, text }) => {
    const msg = store.addChatMessage(agentId, 'admin', socket.user.username, text);
    // Send to agent
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('chat:message', { text, senderName: socket.user.username });
    }
    // Broadcast to all dashboards
    dashNsp.emit('chat:message', msg);
  });

  // ─ Clipboard sync
  socket.on('clipboard:send', ({ agentId, text }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('clipboard:set', { text });
    }
  });

  socket.on('clipboard:request', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('clipboard:get');
    }
  });

  // ─ Multi-monitor: request monitor list
  socket.on('screen:getMonitors', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('screen:getMonitors');
    }
  });

  // ─ Screen start with monitor selection
  socket.on('screen:start', ({ agentId, quality, fps, monitor }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('screen_start', `Admin started screen viewing`, agentId);
      agentSocket.emit('screen:start', { quality: quality || 50, fps: fps || 2, monitor: monitor || 0 });
    }
  });

  // ─ File upload to agent (push file from dashboard)
  socket.on('file:upload', ({ agentId, fileName, fileData, remotePath }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('file_upload', `Admin uploaded file: ${fileName} to ${remotePath}`, agentId);
      agentSocket.emit('file:upload', { fileName, fileData, remotePath });
    }
  });

  // ─ File transfer between agents (SFTP-like)
  socket.on('file:transfer', ({ sourceAgentId, destAgentId, filePath, destPath, transferId }) => {
    const srcSocket = findAgentSocket(sourceAgentId);
    const dstSocket = findAgentSocket(destAgentId);

    if (!srcSocket) {
      socket.emit('file:transfer:status', { transferId, success: false, error: 'Source agent not connected' });
      return;
    }
    if (!dstSocket) {
      socket.emit('file:transfer:status', { transferId, success: false, error: 'Destination agent not connected' });
      return;
    }

    const fileName = filePath.split(/[/\\]/).pop();
    store.addEvent('file_transfer', `Transfer "${fileName}" from ${sourceAgentId} to ${destAgentId}`, sourceAgentId);

    // Step 1: Read file from source agent
    socket.emit('file:transfer:status', { transferId, status: 'reading', fileName });
    srcSocket.emit('file:download', { path: filePath });

    // Listen for the source agent's response (one-time)
    const onContent = (data) => {
      if (!data.success) {
        socket.emit('file:transfer:status', { transferId, success: false, error: data.error || 'Failed to read source file' });
        return;
      }

      // Step 2: Write file to destination agent
      socket.emit('file:transfer:status', { transferId, status: 'writing', fileName, size: data.size });
      dstSocket.emit('file:upload', {
        fileName: data.name,
        fileData: data.content,
        remotePath: destPath,
      });

      // Listen for destination's completion (one-time)
      const onComplete = (result) => {
        socket.emit('file:transfer:status', {
          transferId,
          success: result.success,
          fileName: data.name,
          size: data.size,
          destPath: result.path,
          error: result.error,
        });
        dstSocket.off('file:transfer:complete', onComplete);
      };
      dstSocket.once('file:transfer:complete', onComplete);
    };
    srcSocket.once('file:content:result', onContent);
  });

  // ─ Wake-on-LAN
  socket.on('wol:send', ({ macAddress, agentId: targetId }) => {
    try {
      const mac = macAddress.replace(/[:-]/g, '');
      const macBuffer = Buffer.from(mac, 'hex');
      const magicPacket = Buffer.alloc(102);
      // 6 bytes of 0xFF
      for (let i = 0; i < 6; i++) magicPacket[i] = 0xff;
      // 16 repetitions of MAC
      for (let i = 0; i < 16; i++) macBuffer.copy(magicPacket, 6 + i * 6);

      const dgram = require('dgram');
      const udpSocket = dgram.createSocket('udp4');
      udpSocket.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', () => {
        udpSocket.close();
      });
      udpSocket.setBroadcast(true);

      store.addEvent('wol_sent', `Wake-on-LAN sent to ${macAddress}`, targetId);
      socket.emit('wol:result', { success: true, macAddress });
    } catch (error) {
      socket.emit('wol:result', { success: false, error: error.message });
    }
  });

  // ─ Ping agent for latency
  socket.on('ping:agent', ({ agentId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('ping:latency', { timestamp: Date.now() });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Dashboard Disconnected] ${socket.user.username}`);
  });
});

// ── Helper: find connected agent socket by agentId ────────
function findAgentSocket(agentId) {
  for (const [, socket] of agentNsp.sockets) {
    if (socket.handshake.auth.agentId === agentId) {
      return socket;
    }
  }
  return null;
}

// ── Start Server ──────────────────────────────────────────
server.listen(config.PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              PC Control Hub — Server                     ║
║══════════════════════════════════════════════════════════║
║  HTTP Server:    http://localhost:${config.PORT}                ║
║  Socket.IO:      ws://localhost:${config.PORT}                  ║
║  Agent NS:       /agent                                  ║
║  Dashboard NS:   /dashboard                              ║
╚══════════════════════════════════════════════════════════╝
  `);
  logSecurityWarnings();
});

// ── Graceful shutdown: flush in-memory store to disk ─────
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Server] Received ${signal}, flushing store and exiting...`);
  try {
    store.flushSync();
  } catch (err) {
    console.error('[Server] Flush failed during shutdown:', err.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
