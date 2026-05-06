/**
 * /api/agent-tokens — admin-issued per-agent auth tokens.
 *
 * Replaces the shared AGENT_SECRET with one revocable token per agent.
 * The plain token is only ever returned ONCE — at creation time. Thereafter
 * only the SHA-256 hash is stored on disk.
 *
 * Wire format: nxa_<id>_<secret> — see auth.js for verification logic.
 */
module.exports = function registerAgentTokens(app, { store, auth }) {
  const { authMiddleware, requireRole, issueAgentToken, revokeAgentToken, listAgentTokens } = auth;

  app.get('/api/agent-tokens', authMiddleware, requireRole('admin'), (_req, res) => {
    res.json({ tokens: listAgentTokens() });
  });

  app.post('/api/agent-tokens', authMiddleware, requireRole('admin'), (req, res) => {
    const label = (req.body && typeof req.body.label === 'string' ? req.body.label : '').trim();
    if (!label) return res.status(400).json({ error: 'label is required' });
    const created = issueAgentToken(label, req.user.username);
    store.addEvent(
      'agent_token_issued',
      `Agent token "${label}" issued by ${req.user.username}`,
      null,
      req.user.username,
    );
    // plainToken is the ONLY time it's ever returned by the API.
    res.status(201).json({ id: created.id, label, plainToken: created.plainToken });
  });

  app.delete('/api/agent-tokens/:id', authMiddleware, requireRole('admin'), (req, res) => {
    const ok = revokeAgentToken(req.params.id);
    if (!ok) return res.status(404).json({ error: 'token not found or already revoked' });
    store.addEvent(
      'agent_token_revoked',
      `Agent token ${req.params.id} revoked by ${req.user.username}`,
      null,
      req.user.username,
    );
    res.json({ success: true });
  });
};
