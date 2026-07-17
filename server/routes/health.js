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
    let storeOk = true;
    try {
      store.getAllAgents();
    } catch (err) {
      storeOk = false;
    }
    res.json(storeOk ? { ok: true } : { ok: false });
  });
};
