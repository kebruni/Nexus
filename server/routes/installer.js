/**
 * /api/agent/installer/{info,download,bundle} — expose the latest NSIS
 * installer produced by `npm --prefix agent run build` (or the CI workflow)
 * and ship a host-signed agent JWT alongside it.
 *
 * Endpoints:
 *
 *   GET  /api/agent/installer/info       (anonymous)
 *     Reports the latest available .exe (name, size, mtime).
 *
 *   GET  /api/agent/installer/download   (anonymous)
 *     Streams the raw .exe artifact. The .exe shipped by CI no longer has
 *     an `agentKey` baked in (JWT_SECRET stays on the host), so this is
 *     mostly useful for debugging or manual pairing.
 *
 *   GET  /api/agent/installer/bundle     (auth: admin)
 *     Streams a ZIP that contains:
 *       - Nexus-Agent-Setup-<v>.exe    (same as /download)
 *       - install.cmd                  (writes the freshly-minted agent
 *                                       JWT into %APPDATA%\Nexus Agent\config.json
 *                                       and runs the installer)
 *       - README.txt                   (human instructions, ru+en)
 *     The agent JWT is signed on-the-fly by the server using the local
 *     JWT_SECRET (read from .data/secrets.json on first boot), so the
 *     secret never leaves this host.
 *
 *   GET  /AgentSetup.exe                 (anonymous, legacy)
 *     Redirects to /api/agent/installer/download.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const jwt = require('jsonwebtoken');
const config = require('../config');

function findArtifact() {
  const distDir = path.join(__dirname, '..', '..', 'agent', 'dist-gui');
  try {
    const entries = fs.readdirSync(distDir);
    const candidates = entries
      .filter((name) => /^Nexus-Agent-Setup-.*\.exe$/.test(name))
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

function mintAgentJwt({ issuedBy }) {
  const agentId = `bundle-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const payload = {
    type: 'agent',
    agentId,
    label: `Bundle download by ${issuedBy || 'unknown'}`,
    builtAt: new Date().toISOString(),
  };
  // 10y lifetime — effectively "until JWT_SECRET rotates". Matches the
  // expectations of bake-installer-defaults.js / verifyAgentToken in auth.js.
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '3650d',
  });
}

function defaultServerUrl(req) {
  // Prefer an explicit env var (operator-controlled), otherwise reconstruct
  // from the incoming request. The reconstructed URL is what end-users would
  // actually type into a browser to reach this dashboard, which is the same
  // host the agent should connect to.
  const fromEnv = (process.env.NEXUS_DEFAULT_SERVER_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

function escapeForBatchEcho(value) {
  // Escapes characters that have special meaning to cmd.exe so that an
  // `echo` line outputs them verbatim. Quotes are literal in batch echo
  // (no escaping needed). Percent must be doubled so the value isn't
  // accidentally treated as a variable expansion (e.g. %APPDATA%).
  return String(value)
    .replace(/\^/g, '^^')
    .replace(/&/g, '^&')
    .replace(/\|/g, '^|')
    .replace(/</g, '^<')
    .replace(/>/g, '^>')
    .replace(/%/g, '%%');
}

function buildInstallCmd({ serverUrl, agentKey }) {
  // The agent reads %APPDATA%\Nexus Agent\config.json on every boot
  // (see agent/runtimeConfig.js + agent/paths.js). Writing it BEFORE
  // launching the installer guarantees that the first agent run already
  // has both the server URL and the agent JWT.
  //
  // Minified JSON is emitted on a single line to avoid any ambiguity
  // about how cmd's `echo` handles leading whitespace.
  const json = `{"serverUrl":"${escapeForBatchEcho(serverUrl)}","agentKey":"${escapeForBatchEcho(agentKey)}"}`;
  const lines = [
    '@echo off',
    'setlocal enableextensions',
    '',
    'echo ====================================================',
    'echo  Nexus Agent -- paired install',
    'echo ====================================================',
    'echo.',
    'set "NEXUS_CONFIG_DIR=%APPDATA%\\Nexus Agent"',
    'if not exist "%NEXUS_CONFIG_DIR%" mkdir "%NEXUS_CONFIG_DIR%"',
    '',
    'echo Writing config to "%NEXUS_CONFIG_DIR%\\config.json" ...',
    `>"%NEXUS_CONFIG_DIR%\\config.json" echo ${json}`,
    '',
    'echo Running installer ...',
    'start "" /WAIT "%~dp0Nexus-Agent-Setup.exe"',
    '',
    'echo.',
    'echo Done. The agent will start automatically and pair with the server.',
    'echo If the agent UI shows the wrong server URL, open it once and click [edit].',
    'pause',
    'endlocal',
    '',
  ];
  // Windows expects CRLF line endings in .cmd files.
  return lines.join('\r\n');
}

function buildReadme({ serverUrl }) {
  return [
    'Nexus Agent — paired install bundle',
    '====================================',
    '',
    `Server: ${serverUrl}`,
    `Issued: ${new Date().toISOString()}`,
    '',
    'EN -----------------------------------------------------------------',
    '1. Extract this ZIP to any folder on the target Windows machine.',
    '2. Double-click install.cmd. It will:',
    '   - write %APPDATA%\\Nexus Agent\\config.json with the agent JWT,',
    '   - run Nexus-Agent-Setup.exe through the standard installer wizard.',
    '3. After the installer finishes, the agent auto-launches and appears',
    '   on the Devices page of the dashboard as Online.',
    '',
    'RU -----------------------------------------------------------------',
    '1. Распакуй этот ZIP в любую папку на целевой Windows-машине.',
    '2. Запусти install.cmd двойным кликом. Скрипт:',
    '   - запишет %APPDATA%\\Nexus Agent\\config.json со свежим agent JWT,',
    '   - запустит обычный мастер установки Nexus-Agent-Setup.exe.',
    '3. После установки агент автоматически стартует и появится на странице',
    '   Devices дашборда со статусом Online.',
    '',
    'SECURITY -----------------------------------------------------------',
    'The agent JWT inside install.cmd is signed by the server and is',
    'equivalent to a long-lived password for this device. Treat the .cmd',
    'file like a credential — do not share it publicly. To revoke, rotate',
    'JWT_SECRET on the server (this invalidates every previously issued',
    'JWT-flavoured agent token, so use sparingly).',
    '',
  ].join('\r\n');
}

module.exports = function registerInstaller(app, deps = {}) {
  const auth = deps.auth;

  app.get('/api/agent/installer/info', (_req, res) => {
    const artifact = findArtifact();
    if (!artifact) {
      return res.status(404).json({
        available: false,
        hint: 'Run "npm --prefix agent run build" or download from CI artifacts',
      });
    }
    const stats = fs.statSync(artifact.full);
    const m = artifact.name.match(/Nexus-Agent-Setup-(.+)\.exe$/);
    res.json({
      available: true,
      fileName: artifact.name,
      version: m ? m[1] : null,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      downloadUrl: '/api/agent/installer/download',
      bundleUrl: '/api/agent/installer/bundle',
    });
  });

  app.get('/api/agent/installer/download', (_req, res) => {
    const artifact = findArtifact();
    if (!artifact) {
      return res.status(404).send('Installer not built. Run `npm --prefix agent run build` first.');
    }
    res.download(artifact.full, 'Nexus-Agent-Setup.exe');
  });

  // Auth-gated: only admins can mint a fresh agent JWT.
  // Order of middlewares matters: authMiddleware → requireRole → handler.
  const bundleHandler = (req, res) => {
    const artifact = findArtifact();
    if (!artifact) {
      return res.status(404).json({
        error: 'Installer not built. Run `npm --prefix agent run build` first.',
      });
    }

    const serverUrl = defaultServerUrl(req);
    const issuedBy = (req.user && req.user.username) || 'admin';
    const agentKey = mintAgentJwt({ issuedBy });

    // Stream a ZIP to the client. archiver pipes through res directly so
    // we don't buffer the whole .exe (~80MB) in memory.
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Nexus-Agent-Bundle.zip"',
    );

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') console.error('[installer/bundle] archiver warning:', err);
    });
    archive.on('error', (err) => {
      console.error('[installer/bundle] archiver error:', err);
      try { res.status(500).end(); } catch (_) { /* response already streaming */ }
    });

    archive.pipe(res);
    archive.file(artifact.full, { name: 'Nexus-Agent-Setup.exe' });
    archive.append(buildInstallCmd({ serverUrl, agentKey }), { name: 'install.cmd' });
    archive.append(buildReadme({ serverUrl }), { name: 'README.txt' });
    archive.finalize();
  };

  if (auth && auth.authMiddleware && auth.requireRole) {
    app.get(
      '/api/agent/installer/bundle',
      auth.authMiddleware,
      auth.requireRole('admin'),
      bundleHandler,
    );
  } else {
    // Defensive fallback — auth deps should always be present in production,
    // but unit-test harnesses might wire installer.js standalone.
    app.get('/api/agent/installer/bundle', bundleHandler);
  }

  // Legacy URL kept for older dashboard tile links.
  app.get('/AgentSetup.exe', (_req, res) => res.redirect(302, '/api/agent/installer/download'));
};
