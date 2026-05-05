/**
 * /api/health — unauthenticated uptime probe.
 * Returns non-sensitive summary counts so an external monitor can
 * drive a status page without needing a token.
 */
const path = require('path');

module.exports = function registerHealth(app, { store }) {
  const startedAt = new Date().toISOString();
  let version = 'dev';
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    if (pkg && pkg.version) version = pkg.version;
  } catch (_) { /* ignore */ }

  app.get('/api/health', (_req, res) => {
    let agentTotal = 0;
    let agentOnline = 0;
    let storeOk = true;
    try {
      const all = store.getAllAgents();
      agentTotal = all.length;
      agentOnline = all.filter((a) => a.status === 'online').length;
    } catch (err) {
      storeOk = false;
    }
    const memInfo = process.memoryUsage();
    res.json({
      status: storeOk ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      startedAt,
      version,
      nodeVersion: process.version,
      agents: { total: agentTotal, online: agentOnline },
      memoryMB: {
        rss: Math.round(memInfo.rss / 1024 / 1024),
        heapUsed: Math.round(memInfo.heapUsed / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  });
};
