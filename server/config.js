const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  JWT_SECRET: process.env.JWT_SECRET || (isProd ? (() => { throw new Error('JWT_SECRET env var is required in production'); })() : 'dev-only-secret-change-me'),
  AGENT_SECRET: process.env.AGENT_SECRET || (isProd ? (() => { throw new Error('AGENT_SECRET env var is required in production'); })() : 'dev-only-agent-key'),
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD_HASH: null, // Will be set on first run
  DEFAULT_ADMIN_PASSWORD: 'admin123',
  METRICS_HISTORY_LIMIT: 200,
  METRICS_INTERVAL: 3000,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
};
