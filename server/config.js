module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'pc-control-hub-secret-2024',
  AGENT_SECRET: process.env.AGENT_SECRET || 'agent-connection-key',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD_HASH: null, // Will be set on first run
  DEFAULT_ADMIN_PASSWORD: 'admin123',
  METRICS_HISTORY_LIMIT: 200,
  METRICS_INTERVAL: 3000,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
};
