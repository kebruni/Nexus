/**
 * SQLite database for Nexus.
 *
 * Replaces the previous JSON-file persistence layer (`.data/store.json`).
 * Uses `better-sqlite3` (synchronous API → matches the existing store
 * method signatures, no async refactor needed downstream).
 *
 * Schema is created idempotently on every boot. If a legacy
 * `.data/store.json` is found and the DB is empty, its contents are
 * imported once and the file is renamed `store.json.migrated`.
 *
 * Secrets (JWT secret, password hashes, TOTP seeds) intentionally stay
 * in `.data/secrets.json` — the DB is for app data, not credentials.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '.data');
const DB_FILE = path.join(DATA_DIR, 'nexus.db');
const LEGACY_STORE = path.join(DATA_DIR, 'store.json');

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

ensureDir();

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    message     TEXT NOT NULL,
    agent_id    TEXT,
    actor       TEXT,
    timestamp   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_type     ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_agent    ON events(agent_id);
  CREATE INDEX IF NOT EXISTS idx_events_actor    ON events(actor);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL,
    sender       TEXT NOT NULL,
    sender_name  TEXT,
    text         TEXT NOT NULL,
    timestamp    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_agent_ts ON chat_messages(agent_id, timestamp);

  CREATE TABLE IF NOT EXISTS alert_rules (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    metric     TEXT NOT NULL,
    operator   TEXT NOT NULL,
    threshold  REAL NOT NULL,
    duration   INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    agent_id   TEXT
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT,
    rule_name       TEXT,
    agent_id        TEXT,
    agent_hostname  TEXT,
    metric          TEXT,
    current_value   REAL,
    threshold       REAL,
    message         TEXT,
    severity        TEXT,
    timestamp       TEXT NOT NULL,
    acknowledged    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_ts     ON alerts(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_alerts_acked  ON alerts(acknowledged);

  CREATE TABLE IF NOT EXISTS groups (
    name       TEXT PRIMARY KEY,
    color      TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    code       TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    type               TEXT NOT NULL,
    enabled            INTEGER NOT NULL DEFAULT 1,
    config_json        TEXT,
    filters_json       TEXT,
    created_at         TEXT,
    last_delivery_json TEXT
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id               TEXT PRIMARY KEY,
    name             TEXT,
    cron             TEXT,
    action           TEXT,
    command          TEXT,
    target_json      TEXT,
    enabled          INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT,
    created_by       TEXT,
    last_run_at      TEXT,
    last_result_json TEXT
  );

  CREATE TABLE IF NOT EXISTS quick_actions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    command     TEXT NOT NULL,
    os          TEXT NOT NULL DEFAULT 'all',
    icon        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    created_by  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_qa_sort ON quick_actions(sort_order, created_at);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth_key    TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TEXT NOT NULL,
    last_used   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ── One-time migration from legacy .data/store.json ──────
function migrateFromLegacyJson() {
  const meta = db.prepare('SELECT value FROM meta WHERE key = ?').get('migrated_from_json');
  if (meta) return; // already migrated
  if (!fs.existsSync(LEGACY_STORE)) {
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('migrated_from_json', 'no-legacy-file');
    return;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LEGACY_STORE, 'utf8'));
  } catch (err) {
    console.error('[DB] Legacy store.json is corrupt, skipping migration:', err.message);
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('migrated_from_json', 'corrupt-skipped');
    return;
  }

  console.log('[DB] Found legacy .data/store.json — importing into SQLite…');

  const tx = db.transaction(() => {
    if (Array.isArray(raw.eventLog)) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO events(id, type, message, agent_id, actor, timestamp) VALUES (?,?,?,?,?,?)'
      );
      for (const e of raw.eventLog) {
        stmt.run(e.id, e.type, e.message, e.agentId || null, e.actor || null, e.timestamp);
      }
    }
    if (Array.isArray(raw.alertRules)) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO alert_rules(id, name, metric, operator, threshold, duration, enabled, agent_id) VALUES (?,?,?,?,?,?,?,?)'
      );
      for (const r of raw.alertRules) {
        stmt.run(
          r.id, r.name, r.metric, r.operator || 'gt', r.threshold,
          r.duration || 0, r.enabled !== false ? 1 : 0, r.agentId || null
        );
      }
    }
    if (Array.isArray(raw.alerts)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO alerts(id, rule_id, rule_name, agent_id, agent_hostname, metric,
           current_value, threshold, message, severity, timestamp, acknowledged)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      );
      for (const a of raw.alerts) {
        stmt.run(
          a.id, a.ruleId || null, a.ruleName || null, a.agentId || null,
          a.agentHostname || null, a.metric || null, a.currentValue || 0,
          a.threshold || 0, a.message || '', a.severity || 'warning',
          a.timestamp, a.acknowledged ? 1 : 0
        );
      }
    }
    if (Array.isArray(raw.scripts)) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO scripts(id, name, code, created_at) VALUES (?,?,?,?)'
      );
      for (const s of raw.scripts) {
        stmt.run(s.id, s.name, s.code, s.createdAt || new Date().toISOString());
      }
    }
    if (Array.isArray(raw.webhooks)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO webhooks(id, name, type, enabled, config_json, filters_json,
           created_at, last_delivery_json) VALUES (?,?,?,?,?,?,?,?)`
      );
      for (const h of raw.webhooks) {
        stmt.run(
          h.id, h.name, h.type, h.enabled !== false ? 1 : 0,
          JSON.stringify(h.config || {}), JSON.stringify(h.filters || {}),
          h.createdAt || new Date().toISOString(),
          h.lastDelivery ? JSON.stringify(h.lastDelivery) : null
        );
      }
    }
    if (Array.isArray(raw.schedules)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO schedules(id, name, cron, action, command, target_json,
           enabled, created_at, created_by, last_run_at, last_result_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      );
      for (const s of raw.schedules) {
        stmt.run(
          s.id, s.name, s.cron, s.action, s.command || null,
          JSON.stringify(s.target || {}), s.enabled !== false ? 1 : 0,
          s.createdAt || new Date().toISOString(), s.createdBy || null,
          s.lastRunAt || null,
          s.lastResult ? JSON.stringify(s.lastResult) : null
        );
      }
    }
    if (raw.chatMessages && typeof raw.chatMessages === 'object') {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO chat_messages(id, agent_id, sender, sender_name, text, timestamp) VALUES (?,?,?,?,?,?)'
      );
      for (const [agentId, msgs] of Object.entries(raw.chatMessages)) {
        if (!Array.isArray(msgs)) continue;
        for (const m of msgs) {
          stmt.run(m.id, agentId, m.sender, m.senderName || null, m.text, m.timestamp);
        }
      }
    }
    if (raw.groups && typeof raw.groups === 'object') {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO groups(name, color, created_at) VALUES (?,?,?)'
      );
      for (const [name, g] of Object.entries(raw.groups)) {
        stmt.run(name, g.color || '#3b82f6', g.createdAt || new Date().toISOString());
      }
    }
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run(
      'migrated_from_json', new Date().toISOString()
    );
  });

  try {
    tx();
    const rotated = `${LEGACY_STORE}.migrated`;
    try {
      fs.renameSync(LEGACY_STORE, rotated);
      console.log(`[DB] Imported ${LEGACY_STORE} → SQLite. Old file kept at ${rotated}`);
    } catch (err) {
      console.warn('[DB] Migration succeeded but could not rename legacy file:', err.message);
    }
  } catch (err) {
    console.error('[DB] Legacy migration FAILED:', err.message);
    throw err;
  }
}

migrateFromLegacyJson();

// ── Default quick-actions seed (idempotent) ──────────────
// Seeded once on first boot so admins have something useful to click
// from day one. The `seeded_quick_actions` meta flag prevents reseeding
// if the user later deletes them — they stay deleted.
function seedDefaultQuickActions() {
  const flag = db.prepare('SELECT value FROM meta WHERE key = ?').get('seeded_quick_actions');
  if (flag) return;
  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO quick_actions(id, name, description, command, os, icon, sort_order, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  const defaults = [
    { name: 'Restart Explorer',     desc: 'Kill and relaunch explorer.exe (fixes stuck taskbar / desktop)', cmd: 'taskkill /F /IM explorer.exe & start explorer.exe', os: 'windows', icon: 'RefreshCw' },
    { name: 'Flush DNS cache',      desc: 'Clear cached DNS records',                                       cmd: 'ipconfig /flushdns',                                  os: 'windows', icon: 'Database' },
    { name: 'Renew IP address',     desc: 'Release and renew DHCP lease',                                   cmd: 'ipconfig /release && ipconfig /renew',                os: 'windows', icon: 'Wifi' },
    { name: 'Reset Winsock',        desc: 'Reset network stack (requires reboot to take effect)',           cmd: 'netsh winsock reset',                                 os: 'windows', icon: 'Network' },
    { name: 'Clear temp files',     desc: 'Delete %TEMP% directory contents',                               cmd: 'del /q /f /s %TEMP%\\*',                              os: 'windows', icon: 'Trash2' },
    { name: 'List active users',    desc: 'Show users currently signed in',                                 cmd: 'query user',                                          os: 'windows', icon: 'Users' },
    { name: 'Update group policy',  desc: 'Force gpupdate /force',                                          cmd: 'gpupdate /force',                                     os: 'windows', icon: 'ShieldCheck' },
    { name: 'Disk free space',      desc: 'Show free space per drive',                                      cmd: 'wmic logicaldisk get caption,freespace,size',          os: 'windows', icon: 'HardDrive' },
  ];
  const tx = db.transaction(() => {
    defaults.forEach((d, i) => {
      const id = `seed-${i}-${Math.random().toString(36).slice(2, 8)}`;
      insert.run(id, d.name, d.desc, d.cmd, d.os, d.icon, i * 10, now, null);
    });
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('seeded_quick_actions', now);
  });
  tx();
  console.log(`[DB] Seeded ${defaults.length} default quick-actions`);
}
seedDefaultQuickActions();

console.log(`[DB] SQLite ready at ${DB_FILE}`);

module.exports = db;
