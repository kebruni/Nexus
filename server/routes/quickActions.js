/** /api/quick-actions/* — admin-managed library of one-click commands.
 *
 *  Distinct from /api/scripts (which is the long-form user script
 *  library). Quick actions are short OS-specific commands shown as
 *  buttons on the agent detail page.
 *
 *  - GET available to any authenticated user.
 *  - Mutations require operator+ (admin can also restrict via UI).
 */
const VALID_OS = ['windows', 'linux', 'macos', 'all'];

function detectAgentOs(agent) {
  const raw = String(agent?.platform || '').toLowerCase();
  if (raw.includes('win')) return 'windows';
  if (raw.includes('darwin') || raw.includes('mac')) return 'macos';
  if (raw.includes('linux')) return 'linux';
  return null;
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'invalid body';
  if (!body.name || typeof body.name !== 'string' || body.name.length > 80) {
    return 'name required (≤80 chars)';
  }
  if (!body.command || typeof body.command !== 'string' || body.command.length > 4000) {
    return 'command required (≤4000 chars)';
  }
  if (body.os && !VALID_OS.includes(body.os)) {
    return `os must be one of ${VALID_OS.join(', ')}`;
  }
  if (body.description && typeof body.description !== 'string') return 'description must be a string';
  if (body.icon && typeof body.icon !== 'string') return 'icon must be a string';
  return null;
}

module.exports = function registerQuickActions(app, { store, auth, orchestration }) {
  const { authMiddleware, requireRole } = auth;

  app.get('/api/quick-actions', authMiddleware, (_req, res) => {
    res.json({ actions: store.getQuickActions(), validOs: VALID_OS });
  });

  app.post('/api/quick-actions', authMiddleware, requireRole('operator'), (req, res) => {
    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    const created = store.addQuickAction(req.body, req.user.username);
    store.addEvent(
      'quick_action_created',
      `Quick action "${created.name}" created by ${req.user.username}`,
      null,
      req.user.username,
    );
    res.status(201).json(created);
  });

  app.put('/api/quick-actions/:id', authMiddleware, requireRole('operator'), (req, res) => {
    const existing = store.getQuickAction(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const err = validatePayload({ ...existing, ...req.body });
    if (err) return res.status(400).json({ error: err });
    const updated = store.updateQuickAction(req.params.id, req.body);
    store.addEvent(
      'quick_action_updated',
      `Quick action "${updated.name}" updated by ${req.user.username}`,
      null,
      req.user.username,
    );
    res.json(updated);
  });

  app.delete('/api/quick-actions/:id', authMiddleware, requireRole('operator'), (req, res) => {
    const existing = store.getQuickAction(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    store.deleteQuickAction(req.params.id);
    store.addEvent(
      'quick_action_deleted',
      `Quick action "${existing.name}" deleted by ${req.user.username}`,
      null,
      req.user.username,
    );
    res.json({ success: true });
  });

  // Run a quick-action on a specific agent. Reuses the bulk fan-out
  // helper (single-agent target) so the dispatch path matches what
  // /api/bulk/command and the cron scheduler use — same offline-skip
  // handling, same event tagging.
  app.post('/api/quick-actions/:id/run/:agentId', authMiddleware, requireRole('operator'), (req, res) => {
    const action = store.getQuickAction(req.params.id);
    if (!action) return res.status(404).json({ error: 'quick action not found' });
    const agent = store.getAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'agent not found' });

    const agentOs = detectAgentOs(agent);
    if (action.os !== 'all' && agentOs && action.os !== agentOs) {
      return res.status(400).json({
        error: `quick action OS mismatch: action=${action.os}, agent=${agentOs}`,
      });
    }

    const result = orchestration.fanOutBulkAction({
      action: 'execute',
      agentIds: [req.params.agentId],
      command: action.command,
      actor: req.user.username,
      source: 'manual',
    });
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    store.addEvent(
      'quick_action_ran',
      `Quick action "${action.name}" ran on agent by ${req.user.username}`,
      req.params.agentId,
      req.user.username,
    );
    res.json({ ok: true, dispatched: result.sent, skipped: result.skipped });
  });
};
