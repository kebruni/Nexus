/**
 * Tiny atomic JSON persistence layer.
 *
 * Used to keep the in-memory store (events, chat, alert rules, alerts, groups,
 * scripts, admin password hash, JWT secret) alive across server restarts.
 *
 * Writes are debounced and atomic (write to .tmp, then rename) to avoid
 * corrupting the file if the process is killed mid-write.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '.data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('[Persistence] Failed to create .data dir:', err.message);
    }
  }
}

function readJsonSafe(file) {
  try {
    const buf = fs.readFileSync(file, 'utf8');
    return JSON.parse(buf);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[Persistence] Failed to read ${file}:`, err.message);
    }
    return null;
  }
}

function writeJsonAtomic(file, data) {
  ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, json, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function loadStore() {
  return readJsonSafe(STORE_FILE) || {};
}

function loadSecrets() {
  return readJsonSafe(SECRETS_FILE) || {};
}

function saveSecrets(secrets) {
  writeJsonAtomic(SECRETS_FILE, secrets);
}

let saveTimer = null;
let pendingData = null;

/**
 * Schedule a debounced save (default 1s). Multiple calls within the window are
 * coalesced into a single write.
 */
function scheduleStoreSave(getSnapshot, delayMs = 1000) {
  pendingData = getSnapshot;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const snapshot = pendingData();
      pendingData = null;
      writeJsonAtomic(STORE_FILE, snapshot);
    } catch (err) {
      console.error('[Persistence] Save failed:', err.message);
    }
  }, delayMs);
}

/**
 * Synchronous flush — used on graceful shutdown to make sure the most recent
 * mutation lands on disk before the process exits.
 */
function flushSync(getSnapshot) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    writeJsonAtomic(STORE_FILE, getSnapshot());
  } catch (err) {
    console.error('[Persistence] Flush failed:', err.message);
  }
}

module.exports = {
  DATA_DIR,
  STORE_FILE,
  SECRETS_FILE,
  loadStore,
  loadSecrets,
  saveSecrets,
  scheduleStoreSave,
  flushSync,
};
