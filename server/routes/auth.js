/**
 * /api/auth/* — login, 2FA enrolment, change-password.
 *
 * Login lockout is dual-axis (per-IP and per-username), persisted across
 * restarts in SQLite via store.recordLoginFailure / getLoginLockout. If
 * 2FA is enabled for the account, `/login` returns a `ticket` +
 * `totpRequired` flag and the client must finish via `/login/totp`.
 */
module.exports = function registerAuth(app, { store, auth }) {
  const {
    authenticate, verifyTotpTicket, startTotpEnroll, confirmTotpEnroll,
    disableTotp, getTotpStatus, regenerateRecoveryCodes, changeAdminPassword,
    authMiddleware,
  } = auth;

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const { username, password } = req.body || {};

    // Pre-check: is this IP or username currently locked?
    const lock = store.getLoginLockout(ip, username);
    if (lock.ipLockedUntil) {
      const wait = Math.ceil((lock.ipLockedUntil - Date.now()) / 1000);
      return res.status(429).json({ error: `Too many login attempts from this IP. Try again in ${wait}s.` });
    }
    if (lock.userLockedUntil) {
      const wait = Math.ceil((lock.userLockedUntil - Date.now()) / 1000);
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${wait}s.` });
    }

    const result = authenticate(username, password);
    if (!result) {
      const after = store.recordLoginFailure(ip, username);
      if (after.userLockedUntil) {
        store.addEvent('admin_lockout', `Account ${username} locked after ${after.userAttempts} failed attempts`, null, username);
      }
      if (after.ipLockedUntil) {
        store.addEvent('admin_lockout_ip', `IP ${ip} locked after ${after.ipAttempts} failed attempts`, null, null);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    store.clearLoginFailures(ip, username);
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
