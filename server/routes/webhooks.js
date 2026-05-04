/** /api/webhooks/* — alert delivery channels (Telegram/Discord/Slack/generic). Admin-only. */
const WEBHOOK_TYPES = ['telegram', 'discord', 'slack', 'generic'];

function validatePayload(body) {
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

module.exports = function registerWebhooks(app, { store, notifier, auth }) {
  const { authMiddleware, requireRole } = auth;

  app.get('/api/webhooks', authMiddleware, requireRole('admin'), (_req, res) => {
    res.json({ webhooks: store.getWebhooks(), types: WEBHOOK_TYPES });
  });

  app.post('/api/webhooks', authMiddleware, requireRole('admin'), (req, res) => {
    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    const hook = store.addWebhook(req.body);
    store.addEvent('webhook_created', `Webhook "${hook.name}" (${hook.type}) created by ${req.user.username}`, null, req.user.username);
    res.status(201).json(hook);
  });

  app.put('/api/webhooks/:id', authMiddleware, requireRole('admin'), (req, res) => {
    const hook = store.getWebhook(req.params.id);
    if (!hook) return res.status(404).json({ error: 'not found' });
    const updated = store.updateWebhook(req.params.id, req.body || {});
    store.addEvent('webhook_updated', `Webhook "${updated.name}" updated by ${req.user.username}`, null, req.user.username);
    res.json(updated);
  });

  app.delete('/api/webhooks/:id', authMiddleware, requireRole('admin'), (req, res) => {
    const hook = store.getWebhook(req.params.id);
    if (!hook) return res.status(404).json({ error: 'not found' });
    store.deleteWebhook(req.params.id);
    store.addEvent('webhook_deleted', `Webhook "${hook.name}" deleted by ${req.user.username}`, null, req.user.username);
    res.json({ success: true });
  });

  app.post('/api/webhooks/:id/test', authMiddleware, requireRole('admin'), async (req, res) => {
    const hook = store.getWebhook(req.params.id);
    if (!hook) return res.status(404).json({ error: 'not found' });
    const sample = notifier.buildTestAlert();
    const result = await notifier.sendOne(hook, sample);
    store.setWebhookLastDelivery(hook.id, result);
    store.addEvent(
      'webhook_tested',
      `Webhook "${hook.name}" tested by ${req.user.username}: ${result.ok ? 'ok' : result.error}`,
      null,
      req.user.username,
    );
    res.json(result);
  });
};
