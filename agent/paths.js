/**
 * Agent runtime paths.
 *
 * When the agent is packaged into a Windows installer, `__dirname` lives
 * inside `app.asar` under `Program Files`, which is read-only. All writable
 * runtime data (agent ID, runtime config overrides, future cache files) must
 * therefore live under Electron's `userData` directory (e.g.
 * `%APPDATA%\PC Control Hub Agent\`).
 *
 * This module abstracts that so the rest of the agent code can call
 * `runtimePath(name)` without caring whether it's running packaged, in `dev`,
 * or as the legacy headless console build.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let cachedRoot = null;

function getRuntimeRoot() {
  if (cachedRoot) return cachedRoot;

  // Inside an Electron main process, `electron.app` exists and exposes the
  // OS-appropriate userData path. Outside Electron (headless `index.js`,
  // tests, scripts) we fall back to a stable per-user directory.
  try {
    // Lazy require so this file can be loaded by the headless build too.
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      cachedRoot = app.getPath('userData');
      return cachedRoot;
    }
  } catch (_) {
    // not running under Electron
  }

  const fallback =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'PC Control Hub Agent')
      : path.join(os.homedir(), '.pc-control-agent');
  cachedRoot = fallback;
  return cachedRoot;
}

function runtimePath(...segments) {
  const root = getRuntimeRoot();
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('[Paths] Failed to create runtime dir:', err.message);
    }
  }
  return path.join(root, ...segments);
}

module.exports = { getRuntimeRoot, runtimePath };
