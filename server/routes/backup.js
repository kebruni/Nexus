/**
 * /api/backup/{export,inspect,restore} — admin-only.
 * Backs up the persisted store (events, alerts, scripts, webhooks,
 * schedules, chat, groups) as a gzip'd JSON blob, optionally encrypted
 * with AES-256-GCM (scrypt-derived key). Secrets (JWT secret, bcrypt
 * password hashes, TOTP seeds) are DELIBERATELY excluded — a stolen
 * backup file cannot impersonate any user.
 */
const backup = require('../backup');

module.exports = function registerBackup(app, { store, auth }) {
  const { authMiddleware, requireRole } = auth;

  app.post('/api/backup/export', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const password = typeof req.body?.password === 'string' && req.body.password.length > 0
        ? req.body.password : null;
      const blob = await backup.createBackup(store._snapshot(), {}, password);
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const suffix = password ? '-encrypted' : '';
      const filename = `nexus-backup-${stamp}${suffix}.json.gz`;
      store.addEvent(
        'backup_created',
        `Backup exported (${(blob.length / 1024).toFixed(1)} KB${password ? ', encrypted' : ''})`,
        null,
        req.user.username,
      );
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(blob.length));
      res.end(blob);
    } catch (e) {
      console.error('[Backup] export failed:', e);
      res.status(500).json({ error: e.message || 'Backup export failed' });
    }
  });

  app.post('/api/backup/inspect', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const { blob, password } = req.body || {};
      if (typeof blob !== 'string' || !blob.length) {
        return res.status(400).json({ error: 'blob (base64) is required' });
      }
      const buf = Buffer.from(blob, 'base64');
      const { snapshot, meta } = await backup.readBackup(buf, password || null);
      res.json({ meta, summary: backup.summarizeSnapshot(snapshot) });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Failed to read backup' });
    }
  });

  app.post('/api/backup/restore', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const { blob, password } = req.body || {};
      if (typeof blob !== 'string' || !blob.length) {
        return res.status(400).json({ error: 'blob (base64) is required' });
      }
      const buf = Buffer.from(blob, 'base64');
      const { snapshot, meta } = await backup.readBackup(buf, password || null);
      const summary = backup.summarizeSnapshot(snapshot);
      store.restoreSnapshot(snapshot);
      store.addEvent(
        'backup_restored',
        `Backup from ${meta.createdAt} restored ` +
          `(${summary.events} events, ${summary.scripts} scripts, ${summary.webhooks} webhooks)`,
        null,
        req.user.username,
      );
      res.json({ success: true, meta, summary });
    } catch (e) {
      console.error('[Backup] restore failed:', e);
      res.status(400).json({ error: e.message || 'Backup restore failed' });
    }
  });
};
