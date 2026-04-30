/**
 * Authentication: JWT issuance, password hashing, env→persisted-secret resolution.
 *
 * Resolution order for each secret:
 *   1. Environment variable (explicit, never persisted by us)
 *   2. .data/secrets.json (auto-generated on first boot, persisted across restarts)
 *   3. Built-in default (only for username; passwords are randomised on first run)
 *
 * Loud warnings are printed when defaults are in use.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const persistence = require('./persistence');

const DEFAULT_ADMIN_PASSWORD = 'admin123';

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

// ── Admin credentials ─────────────────────────────────────
let adminPasswordHash;
let mustChangePassword = false;

function setAdminPasswordHash(hash, requireChange = false) {
  adminPasswordHash = hash;
  mustChangePassword = requireChange;
  secrets.adminPasswordHash = hash;
  secrets.mustChangePassword = requireChange;
  persistence.saveSecrets(secrets);
}

if (process.env.ADMIN_PASSWORD) {
  // Explicit env override — always trust it.
  adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  mustChangePassword = false;
  // Don't persist env-supplied passwords; they remain authoritative each boot.
} else if (secrets.adminPasswordHash) {
  adminPasswordHash = secrets.adminPasswordHash;
  mustChangePassword = !!secrets.mustChangePassword;
} else {
  // First boot: hash the default and require a change on first login.
  adminPasswordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  mustChangePassword = true;
  secrets.adminPasswordHash = adminPasswordHash;
  secrets.mustChangePassword = true;
  persistence.saveSecrets(secrets);
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
  if (mustChangePassword) {
    lines.push('  [ADMIN_PASSWORD] DEFAULT in use (admin/admin123) — password change will be required on first login');
  } else if (process.env.ADMIN_PASSWORD) {
    lines.push('  [ADMIN_PASSWORD] loaded from env');
  } else {
    lines.push('  [ADMIN_PASSWORD] loaded from .data/secrets.json');
  }
  console.log('\n[Security]');
  for (const line of lines) console.log(line);
  console.log('');
}

// ── Auth API ──────────────────────────────────────────────
function authenticate(username, password) {
  if (username !== config.ADMIN_USERNAME) return null;
  if (!bcrypt.compareSync(password, adminPasswordHash)) return null;
  const token = jwt.sign(
    { username, role: 'admin', mustChangePassword },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  return { token, username, role: 'admin', mustChangePassword };
}

function changeAdminPassword(currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    return { success: false, error: 'Both currentPassword and newPassword are required' };
  }
  if (!bcrypt.compareSync(currentPassword, adminPasswordHash)) {
    return { success: false, error: 'Current password is incorrect' };
  }
  if (newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters' };
  }
  if (newPassword === DEFAULT_ADMIN_PASSWORD) {
    return { success: false, error: 'New password cannot be the default password' };
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  setAdminPasswordHash(hash, false);
  return { success: true };
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
  if (agentKey !== AGENT_SECRET) return next(new Error('Invalid agent key'));
  next();
}

module.exports = {
  authenticate,
  changeAdminPassword,
  verifyToken,
  authMiddleware,
  socketAuthMiddleware,
  agentAuthMiddleware,
  logSecurityWarnings,
  isMustChangePassword: () => mustChangePassword,
  // For tests / introspection only — never expose over the network.
  _internals: { JWT_SECRET, AGENT_SECRET },
};
