module.exports = {
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',
  AGENT_KEY: process.env.AGENT_KEY || 'agent-connection-key',
  METRICS_INTERVAL: 10000, // Send metrics every 10 seconds
  SCREEN_QUALITY: 50, // JPEG quality (1-100)
  SCREEN_FPS: 2, // Screenshots per second
};
