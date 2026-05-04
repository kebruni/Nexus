/** /api/users/* — user CRUD. Admin-only. */
module.exports = function registerUsers(app, { store, auth }) {
  const { authMiddleware, requireRole, listUsers, createUser, deleteUser, updateUserRole, resetUserPassword, ROLES } = auth;

  app.get('/api/users', authMiddleware, requireRole('admin'), (_req, res) => {
    res.json({ users: listUsers(), roles: ROLES });
  });

  app.post('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
    const { username, password, role } = req.body || {};
    const result = createUser({ username, password, role });
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('user_created', `User "${username}" (${role}) created by ${req.user.username}`, null, req.user.username);
    res.status(201).json(result.user);
  });

  app.delete('/api/users/:username', authMiddleware, requireRole('admin'), (req, res) => {
    const target = req.params.username;
    if (target === req.user.username) return res.status(400).json({ error: 'Cannot delete yourself' });
    const result = deleteUser(target);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('user_deleted', `User "${target}" deleted by ${req.user.username}`, null, req.user.username);
    res.json({ success: true });
  });

  app.put('/api/users/:username/role', authMiddleware, requireRole('admin'), (req, res) => {
    const target = req.params.username;
    const { role } = req.body || {};
    if (target === req.user.username && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote yourself' });
    }
    const result = updateUserRole(target, role);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('user_role_changed', `User "${target}" role -> ${role} by ${req.user.username}`, null, req.user.username);
    res.json(result.user);
  });

  app.put('/api/users/:username/password', authMiddleware, requireRole('admin'), (req, res) => {
    const target = req.params.username;
    const { newPassword } = req.body || {};
    const result = resetUserPassword(target, newPassword);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('user_password_reset', `Password reset for "${target}" by ${req.user.username}`, null, req.user.username);
    res.json({ success: true });
  });
};
