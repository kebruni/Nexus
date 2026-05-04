/** /api/alerts/*, /api/alert-rules/* — triggered alerts & their rules. */
module.exports = function registerAlerts(app, { store, auth }) {
  const { authMiddleware, requireRole } = auth;

  app.get('/api/alerts', authMiddleware, (_req, res) => res.json(store.getAlerts()));
  app.get('/api/alerts/unread', authMiddleware, (_req, res) => res.json(store.getUnacknowledgedAlerts()));

  app.post('/api/alerts/:id/acknowledge', authMiddleware, requireRole('operator'), (req, res) => {
    const alert = store.acknowledgeAlert(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  });

  app.post('/api/alerts/acknowledge-all', authMiddleware, requireRole('operator'), (_req, res) => {
    res.json({ acknowledged: store.acknowledgeAllAlerts() });
  });

  app.get('/api/alert-rules', authMiddleware, (_req, res) => res.json(store.getAlertRules()));

  app.post('/api/alert-rules', authMiddleware, requireRole('operator'), (req, res) => {
    const rule = store.addAlertRule(req.body);
    store.addEvent('alert_rule_created', `Alert rule "${rule.name}" created`, null, req.user.username);
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
};
