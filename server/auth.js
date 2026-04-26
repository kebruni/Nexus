const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');

// Hash the default password on startup
const adminPasswordHash = bcrypt.hashSync(config.DEFAULT_ADMIN_PASSWORD, 10);

/**
 * Authenticate admin user
 */
function authenticate(username, password) {
  if (username !== config.ADMIN_USERNAME) {
    return null;
  }
  if (!bcrypt.compareSync(password, adminPasswordHash)) {
    return null;
  }
  const token = jwt.sign(
    { username, role: 'admin' },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );
  return { token, username, role: 'admin' };
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Express middleware for JWT auth
 */
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
  req.user = decoded;
  next();
}

/**
 * Socket.IO middleware for JWT auth (dashboard clients)
 */
function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Invalid token'));
  }
  socket.user = decoded;
  next();
}

/**
 * Socket.IO middleware for agent auth
 */
function agentAuthMiddleware(socket, next) {
  const agentKey = socket.handshake.auth.agentKey;
  if (agentKey !== config.AGENT_SECRET) {
    return next(new Error('Invalid agent key'));
  }
  next();
}

module.exports = {
  authenticate,
  verifyToken,
  authMiddleware,
  socketAuthMiddleware,
  agentAuthMiddleware,
};
