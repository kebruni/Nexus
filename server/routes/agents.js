/** /api/agents/*, /api/events, /api/chat/:agentId — plain read endpoints. */
module.exports = function registerAgents(app, { store, auth }) {
  const { authMiddleware } = auth;

  app.get('/api/agents', authMiddleware, (_req, res) => {
    res.json(store.getAllAgents());
  });

  app.get('/api/agents/:id', authMiddleware, (req, res) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  });

  app.get('/api/agents/:id/metrics', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 60;
    res.json(store.getMetricsHistory(req.params.id, limit));
  });

  app.get('/api/events', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const agentId = req.query.agentId || null;
    res.json(store.getEvents(limit, agentId));
  });

  app.get('/api/chat/:agentId', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(store.getChatMessages(req.params.agentId, limit));
  });
};
