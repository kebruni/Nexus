#!/usr/bin/env node
/**
 * Bake-time installer defaults generator.
 *
 * Runs automatically before `electron-builder` (via the `prebuild` npm
 * lifecycle hook in agent/package.json). Produces
 * `agent/installerDefaults.json`, which electron-builder copies into the
 * packaged app — that file then provides default `serverUrl` / `agentKey`
 * to `resolveConfig()` at runtime.
 *
 * Goal: zero manual steps. The operator should never have to log into the
 * dashboard, click "issue agent token", copy-paste it into GitHub Actions
 * secrets, etc. Building the installer should just work.
 *
 * Resolution order for the JWT signing secret:
 *   1. `NEXUS_JWT_SECRET` env var (kept for parity with older local
 *      builds; CI no longer supplies it).
 *   2. `<repoRoot>/.data/secrets.json::jwtSecret` (auto-discovered when
 *      the build is run on the same machine as the server — the common
 *      LAN deployment per docs/SETUP.md).
 *
 * When a signing secret is found, we mint a long-lived JWT with the
 * payload `{ type: 'agent', agentId, label, iat }` and embed it as
 * `agentKey` in installerDefaults.json. The server's `verifyAgentToken`
 * verifies it cryptographically — no per-agent record needs to exist
 * on disk for the token to authenticate.
 *
 * When NO signing secret is available (the default in CI now), the
 * installer is built WITHOUT a baked agent JWT. End-users obtain a
 * paired bundle (.exe + install.cmd with a freshly-signed agent JWT)
 * from the dashboard's Download Agent button, which hits
 * `/api/agent/installer/bundle`. JWT_SECRET stays on the host.
 *
 * Resolution order for the default server URL:
 *   1. `NEXUS_DEFAULT_SERVER_URL` env var (set this in CI or before a
 *      manual build to override on a per-build basis).
 *   2. `DEFAULT_SERVER_URL` constant below — the project's canonical
 *      production deployment. Anyone forking the repo for their own LAN
 *      should change this one line.
 *
 * The resolved URL is always written to installerDefaults.json so a
 * freshly-installed agent connects to the right hub without the operator
 * ever opening the "[edit]" dialog.
 *
 * If neither a JWT secret nor a server URL is available, we still emit
 * `installerDefaults.json` (containing `{}`) so the build proceeds and
 * the resulting installer prompts the user for both values on first run.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// jsonwebtoken is a transitive dep via the server workspace; require it
// lazily so a `node --check` of this file passes even before deps install.
function requireJwt() {
  try {
    return require('jsonwebtoken');
  } catch (err) {
    console.error(
      '[bake-installer-defaults] `jsonwebtoken` is not installed. ' +
      'Run `npm install` in agent/ first. ' + err.message,
    );
    process.exit(1);
  }
}

const AGENT_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(AGENT_DIR, '..');
const SECRETS_FILE = path.join(REPO_ROOT, '.data', 'secrets.json');
const OUTPUT_FILE = path.join(AGENT_DIR, 'installerDefaults.json');

// Production hub for this project. If you fork Nexus for your own LAN,
// change this single line (or override per-build via NEXUS_DEFAULT_SERVER_URL).
const DEFAULT_SERVER_URL = 'https://nexus.kebruni.me';

function readJwtSecret() {
  const fromEnv = process.env.NEXUS_JWT_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) {
    return { value: fromEnv.trim(), source: 'env (NEXUS_JWT_SECRET)' };
  }
  try {
    const raw = fs.readFileSync(SECRETS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.jwtSecret === 'string' && parsed.jwtSecret.length >= 16) {
      return { value: parsed.jwtSecret, source: SECRETS_FILE };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[bake-installer-defaults] Could not read ${SECRETS_FILE}: ${err.message}`);
    }
  }
  return null;
}

function buildAgentJwt(jwtSecret) {
  const jwt = requireJwt();
  const agentId = `build-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const payload = {
    type: 'agent',
    agentId,
    label: 'Auto-baked at build time',
    builtAt: new Date().toISOString(),
  };
  // 10y lifetime — effectively "until JWT_SECRET rotates". Token revocation
  // happens by rotating JWT_SECRET on the server (which invalidates every
  // previously-baked installer); for that reason we discourage rotating
  // JWT_SECRET unless you intend to invalidate all field-deployed agents.
  return jwt.sign(payload, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '3650d',
  });
}

function main() {
  const payload = {};

  const envServerUrl = (process.env.NEXUS_DEFAULT_SERVER_URL || '').trim();
  const serverUrl = envServerUrl || DEFAULT_SERVER_URL;
  payload.serverUrl = serverUrl;
  const serverUrlSource = envServerUrl ? 'env (NEXUS_DEFAULT_SERVER_URL)' : 'DEFAULT_SERVER_URL constant';
  console.log(`[bake-installer-defaults] Default serverUrl = ${serverUrl} (from ${serverUrlSource})`);

  const jwtSecretInfo = readJwtSecret();
  if (jwtSecretInfo) {
    payload.agentKey = buildAgentJwt(jwtSecretInfo.value);
    console.log(`[bake-installer-defaults] Minted agent JWT using JWT_SECRET from ${jwtSecretInfo.source}`);
  } else {
    console.log(
      '[bake-installer-defaults] No JWT_SECRET available — installer will ship without a pre-baked agent token. ' +
      'This is the expected default for CI builds: end-users pair via the dashboard\'s ' +
      '"Download Agent" button, which serves a bundle (exe + install.cmd) with a host-signed JWT.',
    );
  }

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf-8' });

  const hasKey = Boolean(payload.agentKey);
  console.log(
    `[bake-installer-defaults] Wrote ${path.relative(REPO_ROOT, OUTPUT_FILE)} ` +
    `(serverUrl: ${payload.serverUrl}, agentKey: ${hasKey ? 'set' : 'not set'})`,
  );
}

main();
