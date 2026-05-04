/** /api/scripts/* — saved command snippets. */
module.exports = function registerScripts(app, { store, auth }) {
  const { authMiddleware, requireRole } = auth;

  app.get('/api/scripts', authMiddleware, (_req, res) => res.json(store.getScripts()));

  app.post('/api/scripts', authMiddleware, requireRole('operator'), (req, res) => {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
    const script = store.addScript({ name, code });
    store.addEvent('script_created', `Script "${name}" created`, null, req.user.username);
    res.json(script);
  });

  app.delete('/api/scripts/:id', authMiddleware, requireRole('operator'), (req, res) => {
    store.deleteScript(req.params.id);
    res.json({ success: true });
  });
};
