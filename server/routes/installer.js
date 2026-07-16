/**
 * /api/agent/installer/{info,download} — expose the latest NSIS installer
 * produced by `npm --prefix agent run build` (or the CI workflow).
 * Legacy `/AgentSetup.exe` URL is kept for older dashboard tiles.
 */
const path = require('path');
const fs = require('fs');

function findArtifact() {
  const distDir = path.join(__dirname, '..', '..', 'agent', 'dist-gui');
  try {
    const entries = fs.readdirSync(distDir);
    const candidates = entries
      .filter((name) => /^Nexus-Agent-.*\.exe$/.test(name))
      .map((name) => {
        const full = path.join(distDir, name);
        return { name, full, mtime: fs.statSync(full).mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return candidates[0] || null;
  } catch (_) {
    return null;
  }
}

module.exports = function registerInstaller(app, { auth, store }) {
  const { authMiddleware } = auth;

  app.get('/api/agent/installer/info', authMiddleware, (_req, res) => {
    const artifact = findArtifact();
    if (!artifact) {
      return res.status(404).json({
        available: false,
        hint: 'Run "npm --prefix agent run build" or download from CI artifacts',
      });
    }
    const stats = fs.statSync(artifact.full);
    const m = artifact.name.match(/Nexus-Agent-(.+)\.exe$/);
    res.json({
      available: true,
      fileName: artifact.name,
      version: m ? m[1] : null,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      downloadUrl: '/api/agent/installer/download',
    });
  });

  app.get('/api/agent/installer/download', authMiddleware, (req, res) => {
    const artifact = findArtifact();
    if (!artifact) {
      return res.status(404).send('Installer not built. Run `npm --prefix agent run build` first.');
    }
    const downloadName = artifact.name.includes('Setup') ? 'Nexus-Agent-Setup.exe' : artifact.name;
    if (store) store.addEvent('agent_installer_downloaded', `Agent installer downloaded by ${req.user.username}`, null, req.user.username);
    res.download(artifact.full, downloadName);
  });

  // Legacy URL kept for older dashboard tile links.
  app.get('/AgentSetup.exe', authMiddleware, (_req, res) => res.redirect(302, '/api/agent/installer/download'));
};
