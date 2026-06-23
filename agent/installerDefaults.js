/**
 * Build-time installer defaults.
 *
 * If a sibling `installerDefaults.json` exists (placed there by the CI
 * build pipeline before electron-builder runs), the values in it become
 * the default `serverUrl` / `agentKey` used by `resolveConfig()` when
 * the user has not yet customised anything.
 *
 * The file is intentionally NOT committed to git — see
 * `.github/workflows/build-agent-installer.yml` for the writer.
 *
 * Layout of installerDefaults.json:
 *   {
 *     "serverUrl": "https://nexus.example.com",
 *     "agentKey": "<baked agent JWT>"
 *   }
 */

const fs = require('fs');
const path = require('path');

function loadInstallerDefaults() {
  const candidates = [
    path.join(__dirname, 'installerDefaults.json'),
    // electron asar layout — same file but resolved through __dirname above.
  ];
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[InstallerDefaults] Failed to read', file, '-', err.message);
      }
    }
  }
  return {};
}

module.exports = {
  loadInstallerDefaults,
};
