/** /api/groups/* and /api/agents/:id/group — group CRUD and agent→group assignment. */
module.exports = function registerGroups(app, { store, auth }) {
  const { authMiddleware, requireRole } = auth;

  app.get('/api/groups', authMiddleware, (_req, res) => res.json(store.getGroups()));

  app.post('/api/groups', authMiddleware, requireRole('operator'), (req, res) => {
    const { name, color } = req.body;
    const group = store.addGroup(name, color);
    store.addEvent('group_created', `Group "${name}" created`, null, req.user.username);
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
};
