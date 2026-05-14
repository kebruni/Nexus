/**
 * Nexus server entry point.
 *
 * All REST routes live under `server/routes/`, Socket.IO handlers
 * under `server/sockets/`, and cross-cutting helpers (fan-out, schedule
 * dispatch, agent socket lookup) under `server/lib/orchestration.js`.
 * This file is wiring only.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const config = require('./config');
const store = require('./store');
const notifier = require('./notifier');
const auth = require('./auth');
const { startScheduler } = require('./scheduler');
const orchestrationFactory = require('./lib/orchestration');

// ── App + HTTP + Socket.IO ───────────────────────────────
const app = express();
// Trust the local reverse proxy (e.g. nginx in front of Nexus) so that
// req.ip returns the real client IP from X-Forwarded-For instead of
// 127.0.0.1. Login lockout is keyed by IP — without this every login
// from behind the proxy looks like the same source.
app.set('trust proxy', 'loopback');
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for screenshots
  pingInterval: 30000,
  pingTimeout: 60000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Static dashboard (production build) ───────────────────
// When the client has been built (`npm --prefix client run build`),
// serve it from the same origin. API routes registered below keep
// priority because they're declared before the SPA fallback.
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const HAS_CLIENT_DIST = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
if (HAS_CLIENT_DIST) app.use(express.static(CLIENT_DIST));

// ── Socket.IO namespaces ─────────────────────────────────
const agentNsp = io.of('/agent');
agentNsp.use(auth.agentAuthMiddleware);
const dashNsp = io.of('/dashboard');
dashNsp.use(auth.socketAuthMiddleware);

// ── Orchestration (fan-out helpers used by routes AND scheduler) ──
const orchestration = orchestrationFactory.create({ store, agentNsp });

// ── REST routes ──────────────────────────────────────────
require('./routes')(app, { store, notifier, auth, orchestration });

// ── Socket.IO handlers ───────────────────────────────────
require('./sockets/agent')({ agentNsp, dashNsp, store, notifier });
require('./sockets/dashboard')({ dashNsp, store, orchestration });

// ── SPA fallback (any non-API route serves the dashboard) ─
// Must be registered AFTER every API route so /api/* keeps priority.
if (HAS_CLIENT_DIST) {
  app.get(/^\/(?!api\/|socket\.io\/|agent\/|AgentSetup\.exe$).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── Start server ─────────────────────────────────────────
function listInterfaces() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
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
  auth.logSecurityWarnings();
});

// ── Cron scheduler ───────────────────────────────────────
const scheduler = startScheduler({
  getSchedules: () => store.getSchedules(),
  dispatchFn: (s) => orchestration.dispatchSchedule(s),
});

// ── Graceful shutdown ────────────────────────────────────
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Server] Received ${signal}, flushing store and exiting...`);
  try { scheduler.stop(); } catch { /* best effort */ }
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
