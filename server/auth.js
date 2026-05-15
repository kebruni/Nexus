/**
 * Authentication & RBAC.
 *
 * - JWT issuance and verification (HS256, 24h).
 * - Multi-user store persisted in .data/secrets.json under `users`.
 *   Each entry: { username, passwordHash, role, mustChangePassword,
 *   createdAt }. Roles: 'viewer' | 'operator' | 'admin'.
 * - First-boot migration: if no users exist yet, seed an `admin` user
 *   from either ADMIN_PASSWORD env var, or the legacy
 *   `secrets.adminPasswordHash` field, or the default 'admin123'
 *   (with mustChangePassword=true).
 *
 * Resolution order for shared secrets (JWT_SECRET / AGENT_SECRET):
 *   env > .data/secrets.json > generated-and-persisted.
 *
 * Loud warnings are printed when defaults are still in use.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const persistence = require('./persistence');
const totp = require('./totp');

const DEFAULT_ADMIN_PASSWORD = 'admin123';
const ROLES = ['viewer', 'operator', 'admin'];
const ROLE_RANK = { viewer: 0, operator: 1, admin: 2 };

let secrets = persistence.loadSecrets() || {};

function isWeakSecret(value) {
  return !value || value === 'pc-control-hub-secret-2024' || value === 'agent-connection-key' || value.length < 16;
}

function ensureSecret(envName, persistKey, generator) {
  const fromEnv = process.env[envName];
  if (fromEnv && !isWeakSecret(fromEnv)) return { value: fromEnv, source: 'env' };
  if (secrets[persistKey] && !isWeakSecret(secrets[persistKey])) {
    return { value: secrets[persistKey], source: 'persisted' };
  }
  const generated = generator();
  secrets[persistKey] = generated;
  persistence.saveSecrets(secrets);
  return { value: generated, source: 'generated' };
}

const jwtSecretInfo = ensureSecret('JWT_SECRET', 'jwtSecret', () => crypto.randomBytes(48).toString('hex'));
const agentSecretInfo = ensureSecret('AGENT_SECRET', 'agentSecret', () => crypto.randomBytes(24).toString('hex'));

const JWT_SECRET = jwtSecretInfo.value;
const AGENT_SECRET = agentSecretInfo.value;
config.JWT_SECRET = JWT_SECRET;
config.AGENT_SECRET = AGENT_SECRET;

// ── Per-agent tokens ──────────────────────────────────────
// Two flavours of agent token are accepted by `verifyAgentToken`:
//
//  1. "nxa_<id>_<secret>" — admin-issued per-agent tokens. Stored hashed in
//     secrets.agentTokens, listable / revocable via the admin UI.
//     secrets.agentTokens shape:
//       { [tokenId]: { hash, label, createdBy, createdAt, lastUsedAt, revokedAt } }
//
//  2. JWT signed with JWT_SECRET, claim `{ type: 'agent', agentId, label }`.
//     Used by the build pipeline (`agent/scripts/bake-installer-defaults.js`)
//     to mint zero-config tokens that the `.exe` installer ships with.
//     Verification is pure crypto — nothing has to be registered on disk,
//     which means CI can produce fully-working installers without first
//     calling an API on the server.
//
// Both replace the legacy shared AGENT_SECRET, which is still accepted in
// `agentAuthMiddleware` for backwards compat.
if (!secrets.agentTokens || typeof secrets.agentTokens !== 'object') {
  secrets.agentTokens = {};
  persistence.saveSecrets(secrets);
}

function _hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function issueAgentToken(label, createdBy) {
  const id = crypto.randomBytes(6).toString('hex');                 // 12 chars
  const secret = crypto.randomBytes(24).toString('base64url');      // ~32 chars
  const plainToken = `nxa_${id}_${secret}`;
  secrets.agentTokens[id] = {
    hash: _hashToken(plainToken),
    label: String(label || '').slice(0, 80) || 'Untitled',
    createdBy: String(createdBy || 'system').slice(0, 80),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  persistence.saveSecrets(secrets);
  return { id, plainToken };
}

function verifyAgentToken(plainToken) {
  if (!plainToken || typeof plainToken !== 'string') return null;

  // Admin-issued per-agent tokens — "nxa_<id>_<secret>".
  if (plainToken.startsWith('nxa_')) {
    const parts = plainToken.split('_');
    if (parts.length < 3) return null;
    const id = parts[1];
    const entry = secrets.agentTokens[id];
    if (!entry) return null;
    if (entry.revokedAt) return null;
    const want = _hashToken(plainToken);
    // Constant-time comparison to avoid timing leaks.
    const a = Buffer.from(want, 'hex');
    const b = Buffer.from(entry.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { id, label: entry.label, kind: 'nxa' };
  }

  // Build-pipeline JWTs — signed with JWT_SECRET by
  // agent/scripts/bake-installer-defaults.js. Looks like "eyJ...".
  if (plainToken.split('.').length === 3) {
    try {
      const decoded = jwt.verify(plainToken, JWT_SECRET, { algorithms: ['HS256'] });
      if (decoded && decoded.type === 'agent') {
        return {
          id: String(decoded.agentId || `jwt-${decoded.iat || 'unknown'}`),
          label: String(decoded.label || 'JWT-baked agent'),
          kind: 'jwt',
        };
      }
    } catch (_) {
      // fall through to null
    }
  }

  return null;
}

function touchAgentToken(id) {
  const entry = secrets.agentTokens[id];
  if (!entry) return;
  entry.lastUsedAt = new Date().toISOString();
  persistence.saveSecrets(secrets);
}

function revokeAgentToken(id) {
  const entry = secrets.agentTokens[id];
  if (!entry || entry.revokedAt) return false;
  entry.revokedAt = new Date().toISOString();
  persistence.saveSecrets(secrets);
  return true;
}

function listAgentTokens() {
  return Object.entries(secrets.agentTokens).map(([id, t]) => ({
    id,
    label: t.label,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    lastUsedAt: t.lastUsedAt,
    revokedAt: t.revokedAt || null,
  }));
}

// ── User store ────────────────────────────────────────────
// secrets.users: { [username]: { passwordHash, role, mustChangePassword, createdAt } }

function persistUsers() {
  persistence.saveSecrets(secrets);
}

function loadOrSeedUsers() {
  if (secrets.users && typeof secrets.users === 'object' && Object.keys(secrets.users).length > 0) {
    return; // already initialised
  }

  const username = process.env.ADMIN_USERNAME || config.ADMIN_USERNAME || 'admin';
  let passwordHash;
  let mustChange;

  if (process.env.ADMIN_PASSWORD) {
    passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    mustChange = false;
  } else if (secrets.adminPasswordHash) {
    // Legacy single-admin layout — migrate to the users map.
    passwordHash = secrets.adminPasswordHash;
    mustChange = !!secrets.mustChangePassword;
  } else {
    passwordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
    mustChange = true;
  }

  secrets.users = {
    [username]: {
      passwordHash,
      role: 'admin',
      mustChangePassword: mustChange,
      createdAt: new Date().toISOString(),
    },
  };

  // Drop the legacy fields so we don't keep two sources of truth.
  delete secrets.adminPasswordHash;
  delete secrets.mustChangePassword;

  persistUsers();
}

loadOrSeedUsers();

function getUser(username) {
  if (!username) return null;
  return (secrets.users && secrets.users[username]) || null;
}

function listUsers() {
  return Object.entries(secrets.users || {}).map(([username, u]) => ({
    username,
    role: u.role,
    mustChangePassword: !!u.mustChangePassword,
    createdAt: u.createdAt || null,
    totpEnabled: !!u.totpEnabled,
  }));
}

/**
 * Server-side password policy. Returns null if the password is acceptable,
 * an error string otherwise.
 *
 * Rules:
 *   - At least 10 characters.
 *   - At most 256 characters (sanity cap).
 *   - At least 3 of the 4 character classes: lowercase, uppercase, digit, symbol.
 *   - Not the default admin password.
 *   - Not equal to the username (case-insensitive).
 */
function validatePassword(password, username) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 10) return 'Password must be at least 10 characters';
  if (password.length > 256) return 'Password is too long (max 256 chars)';
  if (password === DEFAULT_ADMIN_PASSWORD) return 'Password cannot be the default password';
  if (username && password.toLowerCase() === String(username).toLowerCase()) {
    return 'Password cannot equal the username';
  }
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  if (classes < 3) {
    return 'Password must include at least 3 of: lowercase, uppercase, digit, symbol';
  }
  return null;
}

function createUser({ username, password, role }) {
  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9._-]{2,32}$/.test(username)) {
    return { success: false, error: 'Invalid username (2-32 chars, alphanumerics / . _ -)' };
  }
  const pwdErr = validatePassword(password, username);
  if (pwdErr) {
    return { success: false, error: pwdErr };
  }
  if (!ROLES.includes(role)) {
    return { success: false, error: `Role must be one of ${ROLES.join(', ')}` };
  }
  if (getUser(username)) {
    return { success: false, error: 'User already exists' };
  }
  secrets.users[username] = {
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
  persistUsers();
  return {
    success: true,
    user: { username, role, mustChangePassword: false, createdAt: secrets.users[username].createdAt },
  };
}

function deleteUser(username) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (user.role === 'admin') {
    const otherAdmins = Object.entries(secrets.users || {})
      .filter(([u, info]) => u !== username && info.role === 'admin');
    if (otherAdmins.length === 0) {
      return { success: false, error: 'Cannot delete the last admin user' };
    }
  }
  delete secrets.users[username];
  persistUsers();
  return { success: true };
}

function updateUserRole(username, newRole) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (!ROLES.includes(newRole)) {
    return { success: false, error: `Role must be one of ${ROLES.join(', ')}` };
  }
  if (user.role === 'admin' && newRole !== 'admin') {
    const otherAdmins = Object.entries(secrets.users || {})
      .filter(([u, info]) => u !== username && info.role === 'admin');
    if (otherAdmins.length === 0) {
      return { success: false, error: 'Cannot demote the last admin user' };
    }
  }
  user.role = newRole;
  persistUsers();
  return { success: true, user: { username, role: newRole } };
}

function resetUserPassword(username, newPassword) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  const pwdErr = validatePassword(newPassword, username);
  if (pwdErr) return { success: false, error: pwdErr };
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.mustChangePassword = true; // force re-change on next login
  persistUsers();
  return { success: true };
}

function changeOwnPassword(username, currentPassword, newPassword) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (!currentPassword || !newPassword) {
    return { success: false, error: 'Both currentPassword and newPassword are required' };
  }
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return { success: false, error: 'Current password is incorrect' };
  }
  const pwdErr = validatePassword(newPassword, username);
  if (pwdErr) return { success: false, error: pwdErr };
  if (newPassword === currentPassword) {
    return { success: false, error: 'New password must differ from the current one' };
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.mustChangePassword = false;
  persistUsers();
  return { success: true };
}

// Back-compat shim used by /api/auth/change-password — operates on the
// caller's own account.
function changeAdminPassword(currentPassword, newPassword, username) {
  return changeOwnPassword(username || 'admin', currentPassword, newPassword);
}

// ── Boot-time security report ─────────────────────────────
function logSecurityWarnings() {
  const lines = [];
  if (jwtSecretInfo.source === 'generated') {
    lines.push('  [JWT_SECRET]    auto-generated and persisted to .data/secrets.json');
  } else if (jwtSecretInfo.source === 'persisted') {
    lines.push('  [JWT_SECRET]    loaded from .data/secrets.json');
  } else {
    lines.push('  [JWT_SECRET]    loaded from env');
  }
  if (agentSecretInfo.source === 'generated') {
    lines.push('  [AGENT_SECRET]  auto-generated and persisted to .data/secrets.json');
  } else if (agentSecretInfo.source === 'persisted') {
    lines.push('  [AGENT_SECRET]  loaded from .data/secrets.json');
  } else {
    lines.push('  [AGENT_SECRET]  loaded from env');
  }
  const users = Object.values(secrets.users || {});
  const anyMustChange = users.some((u) => u.mustChangePassword);
  if (anyMustChange) {
    lines.push('  [USERS] Default admin password in use — password change will be required on first login');
  } else if (process.env.ADMIN_PASSWORD) {
    lines.push('  [USERS] admin loaded from env');
  } else {
    lines.push(`  [USERS] ${users.length} user(s) loaded from .data/secrets.json`);
  }
  console.log('\n[Security]');
  for (const line of lines) console.log(line);
  console.log('');
}

// ── Auth API ──────────────────────────────────────────────

function issueSessionToken(username, user) {
  return jwt.sign(
    {
      username,
      role: user.role,
      mustChangePassword: !!user.mustChangePassword,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function issueTotpTicket(username) {
  // Short-lived intermediate token issued after a successful password check
  // when the account has 2FA enabled. Holder must exchange it for a full
  // session token by submitting a valid TOTP / recovery code.
  return jwt.sign({ username, pendingTotp: true }, JWT_SECRET, { expiresIn: '5m' });
}

function authenticate(username, password) {
  const user = getUser(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.passwordHash)) return null;

  if (user.totpEnabled) {
    return {
      totpRequired: true,
      ticket: issueTotpTicket(username),
      username,
    };
  }

  return {
    token: issueSessionToken(username, user),
    username,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
  };
}

function consumeRecoveryCode(user, code) {
  if (!Array.isArray(user.recoveryCodeHashes)) return false;
  const hash = totp.hashRecoveryCode(code);
  const idx = user.recoveryCodeHashes.indexOf(hash);
  if (idx === -1) return false;
  user.recoveryCodeHashes.splice(idx, 1);
  persistUsers();
  return true;
}

function verifyTotpTicket(ticket, code) {
  let decoded;
  try {
    decoded = jwt.verify(ticket, JWT_SECRET);
  } catch {
    return { success: false, error: 'Ticket expired or invalid' };
  }
  if (!decoded.pendingTotp || !decoded.username) {
    return { success: false, error: 'Invalid ticket' };
  }
  const user = getUser(decoded.username);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return { success: false, error: 'Account not configured for 2FA' };
  }
  const cleaned = (code || '').toString().trim();
  let used = '';
  if (/^\d{6}$/.test(cleaned)) {
    if (!totp.verifyTotp(user.totpSecret, cleaned)) {
      return { success: false, error: 'Invalid 2FA code' };
    }
    used = 'totp';
  } else if (cleaned) {
    if (!consumeRecoveryCode(user, cleaned)) {
      return { success: false, error: 'Invalid 2FA code' };
    }
    used = 'recovery';
  } else {
    return { success: false, error: 'Code required' };
  }
  return {
    success: true,
    method: used,
    token: issueSessionToken(decoded.username, user),
    username: decoded.username,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
    recoveryCodesRemaining: (user.recoveryCodeHashes || []).length,
  };
}

// ── 2FA enrollment ────────────────────────────────────────

function startTotpEnroll(username, issuer = 'Nexus') {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (user.totpEnabled) return { success: false, error: '2FA already enabled — disable it first' };
  const secret = totp.generateSecret();
  user.pendingTotpSecret = secret;
  persistUsers();
  return {
    success: true,
    secret,
    otpauthUrl: totp.buildOtpAuthUrl({ secret, issuer, label: username }),
  };
}

function confirmTotpEnroll(username, code) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (user.totpEnabled) return { success: false, error: '2FA already enabled' };
  if (!user.pendingTotpSecret) return { success: false, error: 'No pending enrollment — start enrollment first' };
  if (!totp.verifyTotp(user.pendingTotpSecret, (code || '').replace(/\s+/g, ''))) {
    return { success: false, error: 'Code did not match — try again' };
  }
  const recoveryPlain = totp.generateRecoveryCodes(8);
  user.totpSecret = user.pendingTotpSecret;
  user.totpEnabled = true;
  user.totpEnabledAt = new Date().toISOString();
  user.recoveryCodeHashes = recoveryPlain.map(totp.hashRecoveryCode);
  delete user.pendingTotpSecret;
  persistUsers();
  return { success: true, recoveryCodes: recoveryPlain };
}

function disableTotp(username, currentPassword) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (!user.totpEnabled) return { success: false, error: '2FA is not enabled' };
  if (!currentPassword || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return { success: false, error: 'Password verification failed' };
  }
  delete user.totpSecret;
  delete user.pendingTotpSecret;
  delete user.recoveryCodeHashes;
  delete user.totpEnabled;
  delete user.totpEnabledAt;
  persistUsers();
  return { success: true };
}

function getTotpStatus(username) {
  const user = getUser(username);
  if (!user) return { enabled: false };
  return {
    enabled: !!user.totpEnabled,
    enabledAt: user.totpEnabledAt || null,
    recoveryCodesRemaining: Array.isArray(user.recoveryCodeHashes) ? user.recoveryCodeHashes.length : 0,
    pending: !!user.pendingTotpSecret,
  };
}

function regenerateRecoveryCodes(username, currentPassword) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'User not found' };
  if (!user.totpEnabled) return { success: false, error: '2FA is not enabled' };
  if (!currentPassword || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return { success: false, error: 'Password verification failed' };
  }
  const recoveryPlain = totp.generateRecoveryCodes(8);
  user.recoveryCodeHashes = recoveryPlain.map(totp.hashRecoveryCode);
  persistUsers();
  return { success: true, recoveryCodes: recoveryPlain };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Endpoints that remain reachable while a session still carries the
// `mustChangePassword` claim. Everything else is locked until the password
// is changed and the client re-authenticates.
const PASSWORD_CHANGE_WHITELIST = new Set([
  '/api/auth/change-password',
  '/api/auth/verify',
  '/api/auth/logout',
]);

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (decoded.mustChangePassword && !PASSWORD_CHANGE_WHITELIST.has(req.path)) {
    return res.status(403).json({
      error: 'Password change required',
      mustChangePassword: true,
    });
  }
  req.user = decoded;
  next();
}

/**
 * Express middleware factory: requires the caller's role to be at
 * least `minRole` (per ROLE_RANK). Use after `authMiddleware`.
 *
 *   app.post('/api/destructive', authMiddleware, requireRole('operator'), handler)
 */
function requireRole(minRole) {
  if (!ROLES.includes(minRole)) {
    throw new Error(`requireRole: unknown role ${minRole}`);
  }
  return (req, res, next) => {
    const role = req.user && req.user.role;
    if (!role || ROLE_RANK[role] === undefined) {
      return res.status(403).json({ error: 'Forbidden: missing role' });
    }
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: 'Forbidden',
        required: minRole,
        actual: role,
      });
    }
    next();
  };
}

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  const decoded = verifyToken(token);
  if (!decoded) return next(new Error('Invalid token'));
  if (decoded.mustChangePassword) {
    return next(new Error('Password change required'));
  }
  socket.user = decoded;
  next();
}

function agentAuthMiddleware(socket, next) {
  const agentKey = socket.handshake.auth.agentKey;
  if (!agentKey) return next(new Error('Authentication required'));

  // Try the per-agent / build-JWT paths first. Both go through
  // `verifyAgentToken`, which understands the wire format.
  if (typeof agentKey === 'string' &&
      (agentKey.startsWith('nxa_') || agentKey.split('.').length === 3)) {
    const verified = verifyAgentToken(agentKey);
    if (verified) {
      socket.agentToken = verified;
      // Only "nxa_*" tokens have a persisted record we can timestamp;
      // JWT-baked tokens are stateless so there is nothing to touch.
      if (verified.kind === 'nxa') touchAgentToken(verified.id);
      return next();
    }
    return next(new Error('Invalid or revoked agent token'));
  }

  // Legacy shared AGENT_SECRET (backwards compat for agents that haven't
  // been re-issued a per-agent token yet). Constant-time compare.
  const a = Buffer.from(String(agentKey));
  const b = Buffer.from(String(AGENT_SECRET));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new Error('Invalid agent key'));
  }
  socket.agentToken = { id: 'legacy', label: 'shared AGENT_SECRET' };
  next();
}

module.exports = {
  ROLES,
  ROLE_RANK,
  authenticate,
  verifyTotpTicket,
  startTotpEnroll,
  confirmTotpEnroll,
  disableTotp,
  getTotpStatus,
  regenerateRecoveryCodes,
  changeAdminPassword,
  changeOwnPassword,
  resetUserPassword,
  createUser,
  deleteUser,
  updateUserRole,
  listUsers,
  getUser,
  verifyToken,
  authMiddleware,
  requireRole,
  socketAuthMiddleware,
  agentAuthMiddleware,
  logSecurityWarnings,
  // Per-agent tokens
  issueAgentToken,
  verifyAgentToken,
  touchAgentToken,
  revokeAgentToken,
  listAgentTokens,
  // Password policy (for tests)
  validatePassword,
  // For tests / introspection only — never expose over the network.
  _internals: { JWT_SECRET, AGENT_SECRET },
};
