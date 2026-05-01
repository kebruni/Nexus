/**
 * Runtime config layer for the agent.
 *
 * Resolution order (highest priority wins):
 *   1. Process env var (SERVER_URL, AGENT_KEY)
 *   2. CLI flag (--server=https://..., --agent-key=...)
 *   3. User-editable config.json under userData (filled by the installer
 *      first-run wizard or by the user manually)
 *   4. Built-in default from config.js
 *
 * This way an installed Windows app can be repointed at a different server
 * without recompiling — the user just edits
 * `%APPDATA%\PC Control Hub Agent\config.json`.
 */

const fs = require('fs');
const defaults = require('./config');
const { runtimePath } = require('./paths');
const { loadInstallerDefaults } = require('./installerDefaults');

const CONFIG_FILE = runtimePath('config.json');
const INSTALLER_DEFAULTS = loadInstallerDefaults();

function readPersistedConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Config] Failed to read', CONFIG_FILE, '-', err.message);
    }
  }
  return {};
}

function writePersistedConfig(updates) {
  const merged = { ...readPersistedConfig(), ...updates };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error('[Config] Failed to write', CONFIG_FILE, '-', err.message);
  }
  return merged;
}

function readCliFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function resolveConfig() {
  const persisted = readPersistedConfig();

  return {
    ...defaults,
    SERVER_URL:
      process.env.SERVER_URL ||
      readCliFlag('server') ||
      persisted.serverUrl ||
      INSTALLER_DEFAULTS.serverUrl ||
      defaults.SERVER_URL,
    AGENT_KEY:
      process.env.AGENT_KEY ||
      readCliFlag('agent-key') ||
      persisted.agentKey ||
      INSTALLER_DEFAULTS.agentKey ||
      defaults.AGENT_KEY,
    CONFIG_FILE,
  };
}

module.exports = {
  CONFIG_FILE,
  resolveConfig,
  readPersistedConfig,
  writePersistedConfig,
};
