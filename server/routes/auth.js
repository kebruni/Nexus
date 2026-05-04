/**
 * /api/auth/* — login, 2FA enrolment, change-password.
 *
 * Login is rate-limited in-memory (5 tries / 15 min per IP). If 2FA is
 * enabled for the account, `/login` returns a `ticket` + `totpRequired`
 * flag and the client must finish via `/login/totp`.
 */
module.exports = function registerAuth(app, { store, auth }) {
  const {
    authenticate, verifyTotpTicket, startTotpEnroll, confirmTotpEnroll,
    disableTotp, getTotpStatus, regenerateRecoveryCodes, changeAdminPassword,
    authMiddleware,
  } = auth;

  const loginAttempts = new Map();

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (loginAttempts.has(ip)) {
      const attempts = loginAttempts.get(ip);
      const recent = attempts.filter((t) => now - t < 15 * 60 * 1000);
      if (recent.length >= 5) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
      }
      recent.push(now);
      loginAttempts.set(ip, recent);
    } else {
      loginAttempts.set(ip, [now]);
    }

    const { username, password } = req.body;
    const result = authenticate(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid credentials' });

    loginAttempts.delete(ip);
    if (result.totpRequired) {
      store.addEvent('login_totp_pending', `${username} entered correct password — awaiting 2FA code`, null, username);
      return res.json({ totpRequired: true, ticket: result.ticket, username: result.username });
    }
    store.addEvent('admin_login', `Admin ${username} logged in`, null, username);
    res.json(result);
  });

  app.post('/api/auth/login/totp', (req, res) => {
    const { ticket, code } = req.body || {};
    if (!ticket || !code) return res.status(400).json({ error: 'ticket and code are required' });
    const result = verifyTotpTicket(ticket, code);
    if (!result.success) return res.status(401).json({ error: result.error });
    store.addEvent('admin_login', `Admin ${result.username} logged in (2FA via ${result.method})`, null, result.username);
    res.json(result);
  });

  app.get('/api/auth/verify', authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user, mustChangePassword: !!req.user.mustChangePassword });
  });

  app.post('/api/auth/change-password', authMiddleware, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const result = changeAdminPassword(currentPassword, newPassword, req.user.username);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('admin_password_changed', `Admin ${req.user.username} changed their password`, null, req.user.username);
    res.json({ success: true });
  });

  // ── 2FA (TOTP) self-service ──────────────────────────────
  app.get('/api/auth/2fa/status', authMiddleware, (req, res) => {
    res.json(getTotpStatus(req.user.username));
  });

  app.post('/api/auth/2fa/enroll', authMiddleware, (req, res) => {
    const result = startTotpEnroll(req.user.username, 'Nexus');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/auth/2fa/verify', authMiddleware, (req, res) => {
    const result = confirmTotpEnroll(req.user.username, (req.body || {}).code);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('2fa_enabled', `User ${req.user.username} enabled 2FA`, null, req.user.username);
    res.json(result);
  });

  app.post('/api/auth/2fa/disable', authMiddleware, (req, res) => {
    const result = disableTotp(req.user.username, (req.body || {}).currentPassword);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('2fa_disabled', `User ${req.user.username} disabled 2FA`, null, req.user.username);
    res.json({ success: true });
  });

  app.post('/api/auth/2fa/recovery-codes', authMiddleware, (req, res) => {
    const result = regenerateRecoveryCodes(req.user.username, (req.body || {}).currentPassword);
    if (!result.success) return res.status(400).json({ error: result.error });
    store.addEvent('2fa_recovery_regenerated', `User ${req.user.username} regenerated recovery codes`, null, req.user.username);
    res.json(result);
  });
};
