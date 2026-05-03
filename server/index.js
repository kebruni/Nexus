const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const store = require('./store');
const notifier = require('./notifier');
const {
  authenticate,
  verifyTotpTicket,
  startTotpEnroll,
  confirmTotpEnroll,
  disableTotp,
  getTotpStatus,
  regenerateRecoveryCodes,
  changeAdminPassword,
  authMiddleware,
  requireRole,
  socketAuthMiddleware,
  agentAuthMiddleware,
  logSecurityWarnings,
  listUsers,
  createUser,
  deleteUser,
  updateUserRole,
  resetUserPassword,
  ROLES,
} = require('./auth');

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

// ── Static dashboard (production build) ───────────────────
// When the client has been built (`npm --prefix client run build`),
// serve it from the same origin so admins can open the dashboard at
// http://<server-host>:<PORT> without needing the Vite dev server.
// API routes registered below keep priority because they're declared
// before the SPA fallback.
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const HAS_CLIENT_DIST = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
if (HAS_CLIENT_DIST) {
  app.use(express.static(CLIENT_DIST));
}

// ── REST API Routes ───────────────────────────────────────

// Health check — extended to expose enough to drive an external uptime probe
// (UptimeRobot / BetterStack) without requiring auth. We only return non-sensitive
// summary counts; no config, no secrets, no user data.
const SERVER_STARTED_AT = new Date().toISOString();
let SERVER_VERSION = 'dev';
try {
  // Avoid a top-level require so the healthcheck never throws if package.json moves.
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  if (pkg && pkg.version) SERVER_VERSION = pkg.version;
} catch (_) {
  /* ignore */
}

app.get('/api/health', (req, res) => {
  let agentTotal = 0;
  let agentOnline = 0;
  let storeOk = true;
  try {
    const allAgents = store.getAllAgents();
    agentTotal = allAgents.length;
    agentOnline = allAgents.filter((a) => a.status === 'online').length;
  } catch (err) {
    storeOk = false;
  }
  const memInfo = process.memoryUsage();
  res.json({
    status: storeOk ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    startedAt: SERVER_STARTED_AT,
    version: SERVER_VERSION,
    nodeVersion: process.version,
    agents: {
      total: agentTotal,
      online: agentOnline,
    },
    memoryMB: {
      rss: Math.round(memInfo.rss / 1024 / 1024),
      heapUsed: Math.round(memInfo.heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
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
  if (result.totpRequired) {
    // Password was correct but the account requires a 2FA code to finish login.
    store.addEvent('login_totp_pending', `${username} entered correct password — awaiting 2FA code`);
    return res.json({ totpRequired: true, ticket: result.ticket, username: result.username });
  }
  store.addEvent('admin_login', `Admin ${username} logged in`);
  res.json(result);
});

// Step 2 of login when 2FA is enabled — exchange the ticket + code for a session token.
app.post('/api/auth/login/totp', (req, res) => {
  const { ticket, code } = req.body || {};
  if (!ticket || !code) return res.status(400).json({ error: 'ticket and code are required' });
  const result = verifyTotpTicket(ticket, code);
  if (!result.success) return res.status(401).json({ error: result.error });
  store.addEvent('admin_login', `Admin ${result.username} logged in (2FA via ${result.method})`);
  res.json(result);
});

// Verify token
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  // Reflect the token's own `mustChangePassword` claim so the client treats
  // a sticky pre-change-password session as still pending, even after the
  // server-side flag has already been cleared by an earlier change.
  res.json({ valid: true, user: req.user, mustChangePassword: !!req.user.mustChangePassword });
});

// Change admin password (used to clear the mustChangePassword flag set on first boot).
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = changeAdminPassword(currentPassword, newPassword, req.user.username);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('admin_password_changed', `Admin ${req.user.username} changed their password`);
  res.json({ success: true });
});

// ── 2FA (TOTP) self-service endpoints ─────────────────────
app.get('/api/auth/2fa/status', authMiddleware, (req, res) => {
  res.json(getTotpStatus(req.user.username));
});

app.post('/api/auth/2fa/enroll', authMiddleware, (req, res) => {
  const result = startTotpEnroll(req.user.username, 'Nexus');
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.post('/api/auth/2fa/verify', authMiddleware, (req, res) => {
  const { code } = req.body || {};
  const result = confirmTotpEnroll(req.user.username, code);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('2fa_enabled', `User ${req.user.username} enabled 2FA`);
  res.json(result);
});

app.post('/api/auth/2fa/disable', authMiddleware, (req, res) => {
  const { currentPassword } = req.body || {};
  const result = disableTotp(req.user.username, currentPassword);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('2fa_disabled', `User ${req.user.username} disabled 2FA`);
  res.json({ success: true });
});

app.post('/api/auth/2fa/recovery-codes', authMiddleware, (req, res) => {
  const { currentPassword } = req.body || {};
  const result = regenerateRecoveryCodes(req.user.username, currentPassword);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('2fa_recovery_regenerated', `User ${req.user.username} regenerated recovery codes`);
  res.json(result);
});

// ── User management (admin only) ──────────────────────────
app.get('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
  res.json({ users: listUsers(), roles: ROLES });
});

app.post('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
  const { username, password, role } = req.body || {};
  const result = createUser({ username, password, role });
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('user_created', `User "${username}" (${role}) created by ${req.user.username}`);
  res.status(201).json(result.user);
});

app.delete('/api/users/:username', authMiddleware, requireRole('admin'), (req, res) => {
  const target = req.params.username;
  if (target === req.user.username) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const result = deleteUser(target);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('user_deleted', `User "${target}" deleted by ${req.user.username}`);
  res.json({ success: true });
});

app.put('/api/users/:username/role', authMiddleware, requireRole('admin'), (req, res) => {
  const target = req.params.username;
  const { role } = req.body || {};
  if (target === req.user.username && role !== 'admin') {
    return res.status(400).json({ error: 'Cannot demote yourself' });
  }
  const result = updateUserRole(target, role);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('user_role_changed', `User "${target}" role -> ${role} by ${req.user.username}`);
  res.json(result.user);
});

app.put('/api/users/:username/password', authMiddleware, requireRole('admin'), (req, res) => {
  const target = req.params.username;
  const { newPassword } = req.body || {};
  const result = resetUserPassword(target, newPassword);
  if (!result.success) return res.status(400).json({ error: result.error });
  store.addEvent('user_password_reset', `Password reset for "${target}" by ${req.user.username}`);
  res.json({ success: true });
});

// ── Webhooks (alert delivery channels — admin only) ──────────
const WEBHOOK_TYPES = ['telegram', 'discord', 'slack', 'generic'];

function validateWebhookPayload(body) {
  if (!body || typeof body !== 'object') return 'invalid body';
  if (!body.name || typeof body.name !== 'string' || body.name.length > 80) return 'name required (≤80 chars)';
  if (!WEBHOOK_TYPES.includes(body.type)) return `type must be one of ${WEBHOOK_TYPES.join(', ')}`;
  const cfg = body.config || {};
  if (body.type === 'telegram' && (!cfg.botToken || !cfg.chatId)) return 'telegram requires config.botToken and config.chatId';
  if (body.type === 'discord' && !cfg.url) return 'discord requires config.url';
  if (body.type === 'slack' && !cfg.url) return 'slack requires config.url';
  if (body.type === 'generic' && !cfg.url) return 'generic requires config.url';
  return null;
}

app.get('/api/webhooks', authMiddleware, requireRole('admin'), (req, res) => {
  res.json({ webhooks: store.getWebhooks(), types: WEBHOOK_TYPES });
});

app.post('/api/webhooks', authMiddleware, requireRole('admin'), (req, res) => {
  const err = validateWebhookPayload(req.body);
  if (err) return res.status(400).json({ error: err });
  const hook = store.addWebhook(req.body);
  store.addEvent('webhook_created', `Webhook "${hook.name}" (${hook.type}) created by ${req.user.username}`);
  res.status(201).json(hook);
});

app.put('/api/webhooks/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const hook = store.getWebhook(req.params.id);
  if (!hook) return res.status(404).json({ error: 'not found' });
  const updated = store.updateWebhook(req.params.id, req.body || {});
  store.addEvent('webhook_updated', `Webhook "${updated.name}" updated by ${req.user.username}`);
  res.json(updated);
});

app.delete('/api/webhooks/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const hook = store.getWebhook(req.params.id);
  if (!hook) return res.status(404).json({ error: 'not found' });
  store.deleteWebhook(req.params.id);
  store.addEvent('webhook_deleted', `Webhook "${hook.name}" deleted by ${req.user.username}`);
  res.json({ success: true });
});

app.post('/api/webhooks/:id/test', authMiddleware, requireRole('admin'), async (req, res) => {
  const hook = store.getWebhook(req.params.id);
  if (!hook) return res.status(404).json({ error: 'not found' });
  const sample = notifier.buildTestAlert();
  const result = await notifier.sendOne(hook, sample);
  store.setWebhookLastDelivery(hook.id, result);
  store.addEvent('webhook_tested', `Webhook "${hook.name}" tested by ${req.user.username}: ${result.ok ? 'ok' : result.error}`);
  res.json(result);
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

app.post('/api/alerts/:id/acknowledge', authMiddleware, requireRole('operator'), (req, res) => {
  const alert = store.acknowledgeAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

app.post('/api/alerts/acknowledge-all', authMiddleware, requireRole('operator'), (req, res) => {
  const count = store.acknowledgeAllAlerts();
  res.json({ acknowledged: count });
});

// ── Alert Rules API ───────────────────────────────────────
app.get('/api/alert-rules', authMiddleware, (req, res) => {
  res.json(store.getAlertRules());
});

app.post('/api/alert-rules', authMiddleware, requireRole('operator'), (req, res) => {
  const rule = store.addAlertRule(req.body);
  store.addEvent('alert_rule_created', `Alert rule "${rule.name}" created`);
  res.json(rule);
});

app.put('/api/alert-rules/:id', authMiddleware, requireRole('operator'), (req, res) => {
  const rule = store.updateAlertRule(req.params.id, req.body);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  res.json(rule);
});

app.delete('/api/alert-rules/:id', authMiddleware, requireRole('operator'), (req, res) => {
  store.deleteAlertRule(req.params.id);
  res.json({ success: true });
});

// ── Groups API ────────────────────────────────────────────
app.get('/api/groups', authMiddleware, (req, res) => {
  res.json(store.getGroups());
});

app.post('/api/groups', authMiddleware, requireRole('operator'), (req, res) => {
  const { name, color } = req.body;
  const group = store.addGroup(name, color);
  store.addEvent('group_created', `Group "${name}" created`);
  res.json(group);
});

app.delete('/api/groups/:name', authMiddleware, requireRole('operator'), (req, res) => {
  store.deleteGroup(req.params.name);
  res.json({ success: true });
});

app.put('/api/agents/:id/group', authMiddleware, requireRole('operator'), (req, res) => {
  const agent = store.setAgentGroup(req.params.id, req.body.group);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// ── Bulk actions ──────────────────────────────────────────
// One request fans a single command out to every online agent in a
// target set. The set is either an explicit `agentIds` array OR every
// agent currently assigned to `groupName`. Offline agents are reported
// in the response (`skipped`) so the UI can tell the operator what was
// missed without aborting the whole bulk action.
const BULK_ACTIONS = new Set(['execute', 'reboot', 'shutdown', 'lockscreen', 'alarm']);

app.post('/api/bulk/command', authMiddleware, requireRole('operator'), (req, res) => {
  const { action, groupName, agentIds, command } = req.body || {};
  if (!BULK_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Invalid action', allowed: Array.from(BULK_ACTIONS) });
  }
  if (action === 'execute' && (!command || typeof command !== 'string')) {
    return res.status(400).json({ error: '`command` is required for action=execute' });
  }

  // Resolve target list.
  let targets = [];
  if (Array.isArray(agentIds) && agentIds.length) {
    targets = agentIds
      .map((id) => store.getAgent(id))
      .filter(Boolean);
  } else if (groupName) {
    targets = store.getAgentsByGroup(groupName);
  } else {
    return res.status(400).json({ error: 'Either `groupName` or `agentIds[]` is required' });
  }

  if (!targets.length) {
    return res.status(404).json({ error: 'No matching agents' });
  }

  const dispatched = [];
  const skipped = [];

  for (const agent of targets) {
    const sock = findAgentSocket(agent.id);
    if (!sock) {
      skipped.push({ agentId: agent.id, hostname: agent.hostname, reason: 'offline' });
      continue;
    }
    switch (action) {
      case 'execute':
        sock.emit('command:execute', { command, requestId: `${Date.now()}-${agent.id}` });
        break;
      case 'reboot':
        sock.emit('command:reboot');
        break;
      case 'shutdown':
        sock.emit('command:shutdown');
        break;
      case 'lockscreen':
        sock.emit('command:lockscreen');
        break;
      case 'alarm':
        sock.emit('command:alarm');
        break;
    }
    dispatched.push({ agentId: agent.id, hostname: agent.hostname });
  }

  const scope = groupName ? `group "${groupName}"` : `${targets.length} selected`;
  const detail = action === 'execute' ? `: ${command}` : '';
  store.addEvent(
    `bulk_${action}`,
    `Bulk ${action} to ${scope} — ${dispatched.length} sent, ${skipped.length} skipped${detail}`,
  );

  res.json({
    action,
    target: groupName ? { groupName } : { agentIds: targets.map((a) => a.id) },
    dispatched,
    skipped,
    sent: dispatched.length,
    total: targets.length,
  });
});

// ── Scripts API ───────────────────────────────────────────
app.get('/api/scripts', authMiddleware, (req, res) => {
  res.json(store.getScripts());
});

app.post('/api/scripts', authMiddleware, requireRole('operator'), (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  const script = store.addScript({ name, code });
  store.addEvent('script_created', `Script "${name}" created`);
  res.json(script);
});

app.delete('/api/scripts/:id', authMiddleware, requireRole('operator'), (req, res) => {
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
        // Fan out to user-configured webhooks (Telegram / Discord / Slack / generic).
        // Errors are logged + recorded on the channel; never throws.
        notifier.dispatchAlert(store, alert);
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

  // ─ Receive process list from agent (Task Manager)
  socket.on('processes:list:result', (data) => {
    dashNsp.emit('processes:list:result', { agentId, ...data });
  });

  // ─ Receive kill result from agent
  socket.on('processes:kill:result', (data) => {
    dashNsp.emit('processes:kill:result', { agentId, ...data });
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
// Helper: gate destructive socket events behind a minimum role.
const SOCKET_ROLE_RANK = { viewer: 0, operator: 1, admin: 2 };
function socketHasRole(socket, minRole) {
  const role = socket.user && socket.user.role;
  if (!role) return false;
  return (SOCKET_ROLE_RANK[role] || 0) >= (SOCKET_ROLE_RANK[minRole] || 0);
}
function denyForbidden(socket, action) {
  socket.emit('command:result', {
    error: 'Forbidden',
    action,
    required: 'operator',
    actual: socket.user && socket.user.role,
  });
}

dashNsp.on('connection', (socket) => {
  console.log(`[Dashboard Connected] ${socket.user.username} (${socket.user.role})`);

  // Send current agents list
  socket.emit('agents:list', store.getAllAgents());

  // ─ Request agents list on demand (for SPA navigation)
  socket.on('agents:requestList', () => {
    socket.emit('agents:list', store.getAllAgents());
  });

  // ─ Request command execution on agent
  socket.on('command:execute', ({ agentId, command }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'command:execute');
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
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'command:reboot');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_reboot', `Admin sent reboot to ${agentId}`, agentId);
      agentSocket.emit('command:reboot');
    }
  });

  // ─ Shutdown
  socket.on('command:shutdown', ({ agentId }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'command:shutdown');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_shutdown', `Admin sent shutdown to ${agentId}`, agentId);
      agentSocket.emit('command:shutdown');
    }
  });

  // ─ Lock Screen
  socket.on('command:lockscreen', ({ agentId }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'command:lockscreen');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('command_lock', `Admin locked screen on ${agentId}`, agentId);
      agentSocket.emit('command:lockscreen');
    }
  });

  // ─ Sound Alarm
  socket.on('command:alarm', ({ agentId }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'command:alarm');
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
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'file:download');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('file_download', `Admin downloaded file: ${filePath}`, agentId);
      agentSocket.emit('file:download', { path: filePath });
    }
  });

  socket.on('file:delete', ({ agentId, filePath }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'file:delete');
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
    if (!socketHasRole(socket, 'operator')) {
      socket.emit('file:transfer:status', { transferId, success: false, error: 'Forbidden' });
      return;
    }
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
    if (!socketHasRole(socket, 'operator')) {
      socket.emit('file:transfer:status', { transferId, success: false, error: 'Forbidden' });
      return;
    }
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
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'service:action');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('service_action', `${socket.user.username} ${action} service ${serviceName}`, agentId);
      agentSocket.emit('service:action', { serviceName, action });
    }
  });

  // ─ Process Manager (Task Manager view)
  socket.on('processes:list', ({ agentId, limit, requestId }) => {
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      agentSocket.emit('processes:list', { limit, requestId });
    } else {
      socket.emit('processes:list:result', { agentId, success: false, error: 'Agent not connected', requestId });
    }
  });

  socket.on('processes:kill', ({ agentId, pid, requestId }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'processes:kill');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      const username = (socket.user && socket.user.username) || 'admin';
      store.addEvent('process_kill', `${username} killed PID ${pid}`, agentId);
      agentSocket.emit('processes:kill', { pid, requestId });
    } else {
      socket.emit('processes:kill:result', { agentId, success: false, error: 'Agent not connected', requestId });
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
    if (!socketHasRole(socket, 'operator')) return; // viewer cannot drive remote input
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
    if (!socketHasRole(socket, 'operator')) return;
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
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'file:upload');
    const agentSocket = findAgentSocket(agentId);
    if (agentSocket) {
      store.addEvent('file_upload', `Admin uploaded file: ${fileName} to ${remotePath}`, agentId);
      agentSocket.emit('file:upload', { fileName, fileData, remotePath });
    }
  });

  // ─ File transfer between agents (SFTP-like)
  socket.on('file:transfer', ({ sourceAgentId, destAgentId, filePath, destPath, transferId }) => {
    if (!socketHasRole(socket, 'operator')) return denyForbidden(socket, 'file:transfer');
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

// ── SPA fallback (any non-API route serves the dashboard) ─
// Must be registered AFTER every API route so /api/* keeps priority.
if (HAS_CLIENT_DIST) {
  app.get(/^\/(?!api\/|socket\.io\/|agent\/|dashboard\/|AgentSetup\.exe$).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── Start Server ──────────────────────────────────────────
function listInterfaces() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        out.push({ name, address: a.address });
      }
    }
  }
  return out;
}

const HOST = process.env.HOST || '0.0.0.0';
server.listen(config.PORT, HOST, () => {
  const ifaces = listInterfaces();
  console.log('');
  console.log('============================================================');
  console.log('              PC Control Hub — Server');
  console.log('============================================================');
  console.log(`  Listening on:    ${HOST}:${config.PORT}`);
  console.log(`  Dashboard:       http://localhost:${config.PORT}${HAS_CLIENT_DIST ? '' : '   (client/dist not built — run `npm run client:build`)'}`);
  if (ifaces.length) {
    console.log('  LAN access:');
    for (const iface of ifaces) {
      console.log(`    - http://${iface.address}:${config.PORT}    (${iface.name})`);
    }
    console.log('  Agents should use one of the LAN URLs above as SERVER_URL.');
  }
  console.log('  Agent NS:        /agent      Dashboard NS: /dashboard');
  console.log('============================================================');
  console.log('');
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
