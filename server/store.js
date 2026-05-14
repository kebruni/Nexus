/**
 * PC Control Hub — data store, backed by SQLite.
 *
 * Public API matches the previous in-memory/JSON-file implementation
 * byte-for-byte: every callsite keeps working without changes.
 *
 * What's persistent (lives in `.data/nexus.db`):
 *   - eventLog, alertRules, alerts, groups, scripts, webhooks,
 *     schedules, chatMessages.
 *
 * What stays in memory (intentional — runtime-only):
 *   - agents          (tied to live socket connections)
 *   - latencies       (refreshed on every ping)
 *   - alertTimers     (stateful "rule firing for N seconds" tracker)
 */

const db = require('./db');

// ── Prepared statements ─────────────────────────────────
// (better-sqlite3 caches these — they compile once)

const SQL = {
  // events
  insertEvent: db.prepare(
    'INSERT INTO events(id, type, message, agent_id, actor, timestamp) VALUES (?,?,?,?,?,?)'
  ),
  countEvents: db.prepare('SELECT COUNT(*) AS c FROM events'),
  trimEvents: db.prepare(
    `DELETE FROM events WHERE id NOT IN
       (SELECT id FROM events ORDER BY timestamp DESC, id DESC LIMIT ?)`
  ),
  selectEventsByAgent: db.prepare(
    'SELECT * FROM events WHERE agent_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?'
  ),
  selectEventsAll: db.prepare('SELECT * FROM events ORDER BY timestamp DESC, id DESC LIMIT ?'),
  selectAllEventsForAdvanced: db.prepare('SELECT * FROM events ORDER BY timestamp DESC, id DESC'),

  // chat
  insertChat: db.prepare(
    'INSERT INTO chat_messages(id, agent_id, sender, sender_name, text, timestamp) VALUES (?,?,?,?,?,?)'
  ),
  selectChat: db.prepare(
    `SELECT id, agent_id AS agentId, sender, sender_name AS senderName, text, timestamp
       FROM chat_messages WHERE agent_id = ? ORDER BY timestamp ASC, id ASC LIMIT ?`
  ),
  trimChat: db.prepare(
    `DELETE FROM chat_messages WHERE agent_id = ? AND id NOT IN
       (SELECT id FROM chat_messages WHERE agent_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?)`
  ),
  deleteChatByAgent: db.prepare('DELETE FROM chat_messages WHERE agent_id = ?'),
  selectAllChatGrouped: db.prepare(
    `SELECT id, agent_id, sender, sender_name, text, timestamp
       FROM chat_messages ORDER BY agent_id, timestamp ASC, id ASC`
  ),

  // alert rules
  insertRule: db.prepare(
    'INSERT INTO alert_rules(id, name, metric, operator, threshold, duration, enabled, agent_id) VALUES (?,?,?,?,?,?,?,?)'
  ),
  updateRule: db.prepare(
    `UPDATE alert_rules SET name=?, metric=?, operator=?, threshold=?, duration=?, enabled=?, agent_id=? WHERE id=?`
  ),
  deleteRule: db.prepare('DELETE FROM alert_rules WHERE id = ?'),
  selectRule: db.prepare('SELECT * FROM alert_rules WHERE id = ?'),
  selectAllRules: db.prepare('SELECT * FROM alert_rules ORDER BY id ASC'),

  // alerts
  insertAlert: db.prepare(
    `INSERT INTO alerts(id, rule_id, rule_name, agent_id, agent_hostname, metric,
       current_value, threshold, message, severity, timestamp, acknowledged)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ),
  countAlerts: db.prepare('SELECT COUNT(*) AS c FROM alerts'),
  trimAlerts: db.prepare(
    `DELETE FROM alerts WHERE id NOT IN
       (SELECT id FROM alerts ORDER BY timestamp DESC, id DESC LIMIT ?)`
  ),
  ackAlert: db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?'),
  ackAll: db.prepare('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0'),
  selectAlerts: db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC, id DESC LIMIT ?'),
  selectAllAlerts: db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC, id DESC'),
  selectUnacked: db.prepare('SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY timestamp DESC, id DESC'),
  findOpenAlertForRule: db.prepare(
    'SELECT * FROM alerts WHERE rule_id = ? AND agent_id = ? AND acknowledged = 0 LIMIT 1'
  ),

  // groups
  upsertGroup: db.prepare(
    'INSERT INTO groups(name, color, created_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET color=excluded.color'
  ),
  deleteGroup: db.prepare('DELETE FROM groups WHERE name = ?'),
  selectAllGroups: db.prepare('SELECT name, color, created_at FROM groups ORDER BY name ASC'),
  selectGroup: db.prepare('SELECT name, color, created_at FROM groups WHERE name = ?'),

  // scripts
  insertScript: db.prepare('INSERT INTO scripts(id, name, code, created_at) VALUES (?,?,?,?)'),
  deleteScript: db.prepare('DELETE FROM scripts WHERE id = ?'),
  selectAllScripts: db.prepare('SELECT id, name, code, created_at AS createdAt FROM scripts ORDER BY created_at DESC'),

  // webhooks
  insertWebhook: db.prepare(
    `INSERT INTO webhooks(id, name, type, enabled, config_json, filters_json, created_at, last_delivery_json)
     VALUES (?,?,?,?,?,?,?,?)`
  ),
  updateWebhook: db.prepare(
    `UPDATE webhooks SET name=?, enabled=?, config_json=?, filters_json=? WHERE id=?`
  ),
  setWebhookDelivery: db.prepare('UPDATE webhooks SET last_delivery_json=? WHERE id=?'),
  deleteWebhook: db.prepare('DELETE FROM webhooks WHERE id = ?'),
  selectAllWebhooks: db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC'),
  selectWebhook: db.prepare('SELECT * FROM webhooks WHERE id = ?'),

  // schedules
  insertSchedule: db.prepare(
    `INSERT INTO schedules(id, name, cron, action, command, target_json, enabled,
       created_at, created_by, last_run_at, last_result_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ),
  updateSchedule: db.prepare(
    `UPDATE schedules SET name=?, cron=?, action=?, command=?, target_json=?, enabled=? WHERE id=?`
  ),
  deleteSchedule: db.prepare('DELETE FROM schedules WHERE id = ?'),
  selectAllSchedules: db.prepare('SELECT * FROM schedules ORDER BY created_at DESC'),
  selectSchedule: db.prepare('SELECT * FROM schedules WHERE id = ?'),
  recordRun: db.prepare('UPDATE schedules SET last_run_at=?, last_result_json=? WHERE id=?'),

  // metrics history
  insertMetric: db.prepare(
    'INSERT INTO metrics_history(agent_id, data_json, timestamp) VALUES (?,?,?)'
  ),
  selectMetrics: db.prepare(
    'SELECT data_json, timestamp FROM metrics_history WHERE agent_id = ? ORDER BY timestamp ASC LIMIT ?'
  ),
  countMetrics: db.prepare(
    'SELECT COUNT(*) AS c FROM metrics_history WHERE agent_id = ?'
  ),
  trimMetrics: db.prepare(
    `DELETE FROM metrics_history WHERE agent_id = ? AND id NOT IN
       (SELECT id FROM metrics_history WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?)`
  ),
  deleteMetricsByAgent: db.prepare(
    'DELETE FROM metrics_history WHERE agent_id = ?'
  ),
  wipeMetrics: db.prepare('DELETE FROM metrics_history'),

  // wipe (used by restoreSnapshot)
  wipeEvents: db.prepare('DELETE FROM events'),
  wipeChat: db.prepare('DELETE FROM chat_messages'),
  wipeRules: db.prepare('DELETE FROM alert_rules'),
  wipeAlerts: db.prepare('DELETE FROM alerts'),
  wipeGroups: db.prepare('DELETE FROM groups'),
  wipeScripts: db.prepare('DELETE FROM scripts'),
  wipeWebhooks: db.prepare('DELETE FROM webhooks'),
  wipeSchedules: db.prepare('DELETE FROM schedules'),

  // quick actions
  insertQuickAction: db.prepare(
    `INSERT INTO quick_actions(id, name, description, command, os, icon, sort_order, created_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ),
  updateQuickAction: db.prepare(
    `UPDATE quick_actions SET name=?, description=?, command=?, os=?, icon=?, sort_order=? WHERE id=?`
  ),
  deleteQuickAction: db.prepare('DELETE FROM quick_actions WHERE id = ?'),
  selectQuickAction: db.prepare('SELECT * FROM quick_actions WHERE id = ?'),
  selectAllQuickActions: db.prepare(
    'SELECT * FROM quick_actions ORDER BY sort_order ASC, created_at ASC'
  ),

  // push subscriptions
  insertPushSub: db.prepare(
    `INSERT OR REPLACE INTO push_subscriptions(id, user_id, endpoint, p256dh, auth_key, user_agent, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ),
  deletePushSubByEndpoint: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  deletePushSubByEndpointForUser: db.prepare(
    'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'
  ),
  deletePushSubsByUser: db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?'),
  selectPushSubsByUser: db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?'),
  selectAllPushSubs: db.prepare('SELECT * FROM push_subscriptions'),
  countPushSubsByUser: db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?'),
  touchPushSub: db.prepare('UPDATE push_subscriptions SET last_used = ? WHERE endpoint = ?'),

  // login security
  insertLoginFailure: db.prepare('INSERT INTO login_failures(scope, key, ts) VALUES (?, ?, ?)'),
  countLoginFailures: db.prepare(
    'SELECT COUNT(*) AS c FROM login_failures WHERE scope = ? AND key = ? AND ts >= ?'
  ),
  pruneLoginFailures: db.prepare(
    'DELETE FROM login_failures WHERE scope = ? AND key = ? AND ts < ?'
  ),
  deleteLoginFailures: db.prepare('DELETE FROM login_failures WHERE scope = ? AND key = ?'),
  upsertLockout: db.prepare(
    `INSERT INTO login_lockouts(scope, key, locked_until) VALUES (?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET locked_until = excluded.locked_until`
  ),
  selectLockout: db.prepare(
    'SELECT locked_until AS lockedUntil FROM login_lockouts WHERE scope = ? AND key = ?'
  ),
  deleteLockout: db.prepare('DELETE FROM login_lockouts WHERE scope = ? AND key = ?'),
};

// ── Row → object helpers ────────────────────────────────

function rowToEvent(r) {
  return {
    id: r.id,
    type: r.type,
    message: r.message,
    agentId: r.agent_id,
    actor: r.actor,
    timestamp: r.timestamp,
  };
}
function rowToRule(r) {
  return {
    id: r.id,
    name: r.name,
    metric: r.metric,
    operator: r.operator,
    threshold: r.threshold,
    duration: r.duration,
    enabled: !!r.enabled,
    agentId: r.agent_id,
  };
}
function rowToAlert(r) {
  return {
    id: r.id,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    agentId: r.agent_id,
    agentHostname: r.agent_hostname,
    metric: r.metric,
    currentValue: r.current_value,
    threshold: r.threshold,
    message: r.message,
    severity: r.severity,
    timestamp: r.timestamp,
    acknowledged: !!r.acknowledged,
  };
}
function rowToGroup(r) {
  return { name: r.name, color: r.color, createdAt: r.created_at };
}
function rowToWebhook(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: !!r.enabled,
    config: parseJsonSafe(r.config_json, {}),
    filters: parseJsonSafe(r.filters_json, {}),
    createdAt: r.created_at,
    lastDelivery: parseJsonSafe(r.last_delivery_json, null),
  };
}
function rowToSchedule(r) {
  return {
    id: r.id,
    name: r.name,
    cron: r.cron,
    action: r.action,
    command: r.command,
    target: parseJsonSafe(r.target_json, {}),
    enabled: !!r.enabled,
    createdAt: r.created_at,
    createdBy: r.created_by,
    lastRunAt: r.last_run_at,
    lastResult: parseJsonSafe(r.last_result_json, null),
  };
}
function rowToQuickAction(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    command: r.command,
    os: r.os,
    icon: r.icon,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}
function rowToPushSub(r) {
  return {
    id: r.id,
    userId: r.user_id,
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth_key },
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastUsed: r.last_used,
  };
}
function parseJsonSafe(s, fallback) {
  if (s == null || s === '') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

// ── Constants ──────────────────────────────────────────
const EVENT_LIMIT = 1000;
const ALERT_LIMIT = 500;
const CHAT_LIMIT_PER_AGENT = 500;

class Store {
  constructor() {
    /** @type {Map<string, object>} agentId -> agent info & latest metrics */
    this.agents = new Map();
    /** @type {Map<string, number>} ruleId:agentId -> first-trigger ms */
    this.alertTimers = new Map();
    /** @type {Map<string, number>} agentId -> latency ms */
    this.latencies = new Map();

    this.HISTORY_LIMIT = 200;

    // GC offline agents older than 24h, hourly. .unref() so the timer
    // never blocks process exit (matters for CI smoke checks and short-
    // lived scripts that just `require('./store')`).
    const gcTimer = setInterval(() => this.cleanupDeadAgents(), 60 * 60 * 1000);
    if (typeof gcTimer.unref === 'function') gcTimer.unref();

    const counts = SQL.countEvents.get();
    const alertCounts = SQL.countAlerts.get();
    const groupCount = SQL.selectAllGroups.all().length;
    const scriptCount = SQL.selectAllScripts.all().length;
    console.log(
      `[Store] SQLite loaded: ${counts.c} events, ${alertCounts.c} alerts, ` +
      `${groupCount} groups, ${scriptCount} scripts`
    );
  }

  // ── Persistence helpers (compat) ─────────────────────
  // _persist() is a no-op now: every mutation writes directly to SQLite
  // inside this method. flushSync() does nothing meaningful but is kept
  // for shutdown-handler compat.

  flushSync() { /* SQLite WAL flushes synchronously per write */ }

  /**
   * Snapshot of every persisted table, in the same shape backup.js
   * already understands (matches the old in-memory format).
   */
  _snapshot() {
    const rules = SQL.selectAllRules.all().map(rowToRule);
    const alerts = SQL.selectAllAlerts.all().map(rowToAlert);
    const events = SQL.selectAllEventsForAdvanced.all().map(rowToEvent);
    const scripts = SQL.selectAllScripts.all();
    const webhooks = SQL.selectAllWebhooks.all().map(rowToWebhook);
    const schedules = SQL.selectAllSchedules.all().map(rowToSchedule);

    const chatMessages = {};
    for (const r of SQL.selectAllChatGrouped.all()) {
      const aid = r.agent_id;
      if (!chatMessages[aid]) chatMessages[aid] = [];
      chatMessages[aid].push({
        id: r.id,
        agentId: aid,
        sender: r.sender,
        senderName: r.sender_name,
        text: r.text,
        timestamp: r.timestamp,
      });
    }

    const groups = {};
    for (const g of SQL.selectAllGroups.all()) {
      groups[g.name] = rowToGroup(g);
    }

    return {
      eventLog: events,
      alertRules: rules,
      alerts,
      scripts,
      webhooks,
      schedules,
      chatMessages,
      groups,
    };
  }

  /**
   * Replace the contents of every persisted table with the given
   * snapshot (used by /api/backup/restore). Atomic.
   */
  restoreSnapshot(snap) {
    if (!snap || typeof snap !== 'object') {
      throw new Error('Invalid snapshot');
    }
    const tx = db.transaction(() => {
      SQL.wipeEvents.run();
      SQL.wipeChat.run();
      SQL.wipeRules.run();
      SQL.wipeAlerts.run();
      SQL.wipeGroups.run();
      SQL.wipeScripts.run();
      SQL.wipeWebhooks.run();
      SQL.wipeSchedules.run();
      SQL.wipeMetrics.run();

      if (Array.isArray(snap.eventLog)) {
        for (const e of snap.eventLog) {
          SQL.insertEvent.run(e.id, e.type, e.message, e.agentId || null, e.actor || null, e.timestamp);
        }
      }
      if (Array.isArray(snap.alertRules)) {
        for (const r of snap.alertRules) {
          SQL.insertRule.run(
            r.id, r.name, r.metric, r.operator || 'gt', r.threshold,
            r.duration || 0, r.enabled !== false ? 1 : 0, r.agentId || null
          );
        }
      }
      if (Array.isArray(snap.alerts)) {
        for (const a of snap.alerts) {
          SQL.insertAlert.run(
            a.id, a.ruleId || null, a.ruleName || null, a.agentId || null,
            a.agentHostname || null, a.metric || null, a.currentValue || 0,
            a.threshold || 0, a.message || '', a.severity || 'warning',
            a.timestamp, a.acknowledged ? 1 : 0
          );
        }
      }
      if (Array.isArray(snap.scripts)) {
        for (const s of snap.scripts) {
          SQL.insertScript.run(s.id, s.name, s.code, s.createdAt || new Date().toISOString());
        }
      }
      if (Array.isArray(snap.webhooks)) {
        for (const h of snap.webhooks) {
          SQL.insertWebhook.run(
            h.id, h.name, h.type, h.enabled !== false ? 1 : 0,
            JSON.stringify(h.config || {}), JSON.stringify(h.filters || {}),
            h.createdAt || new Date().toISOString(),
            h.lastDelivery ? JSON.stringify(h.lastDelivery) : null
          );
        }
      }
      if (Array.isArray(snap.schedules)) {
        for (const s of snap.schedules) {
          SQL.insertSchedule.run(
            s.id, s.name, s.cron, s.action, s.command || null,
            JSON.stringify(s.target || {}), s.enabled !== false ? 1 : 0,
            s.createdAt || new Date().toISOString(), s.createdBy || null,
            s.lastRunAt || null,
            s.lastResult ? JSON.stringify(s.lastResult) : null
          );
        }
      }
      if (snap.chatMessages && typeof snap.chatMessages === 'object') {
        for (const [agentId, msgs] of Object.entries(snap.chatMessages)) {
          if (!Array.isArray(msgs)) continue;
          for (const m of msgs) {
            SQL.insertChat.run(m.id, agentId, m.sender, m.senderName || null, m.text, m.timestamp);
          }
        }
      }
      if (snap.groups && typeof snap.groups === 'object') {
        for (const [name, g] of Object.entries(snap.groups)) {
          SQL.upsertGroup.run(name, g.color || '#3b82f6', g.createdAt || new Date().toISOString());
        }
      }
    });
    tx();
  }

  // ── Garbage Collection ──────────────────────────────────

  cleanupDeadAgents() {
    const now = new Date();
    const DEAD_THRESHOLD = 24 * 60 * 60 * 1000;
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.status === 'offline' && agent.disconnectedAt) {
        const t = new Date(agent.disconnectedAt);
        if (now - t > DEAD_THRESHOLD) {
          this.agents.delete(agentId);
          this.latencies.delete(agentId);
          SQL.deleteChatByAgent.run(agentId);
          SQL.deleteMetricsByAgent.run(agentId);
          console.log(`[Store] Garbage collected dead agent: ${agentId}`);
        }
      }
    }
  }

  // ── Agents (in-memory) ──────────────────────────────────

  registerAgent(agentId, info) {
    for (const [existingId, existingAgent] of this.agents.entries()) {
      if (existingId !== agentId && existingAgent.hostname === info.hostname) {
        this.agents.delete(existingId);
        this.latencies.delete(existingId);
        SQL.deleteChatByAgent.run(existingId);
        SQL.deleteMetricsByAgent.run(existingId);
      }
    }

    const agent = {
      id: agentId,
      hostname: info.hostname,
      platform: info.platform,
      arch: info.arch,
      osVersion: info.osVersion,
      cpuModel: info.cpuModel,
      cpuCores: info.cpuCores,
      totalMemory: info.totalMemory,
      gpuModel: info.gpuModel || 'N/A',
      username: info.username,
      ip: info.ip,
      status: 'online',
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      metrics: null,
      group: info.group || null,
      tags: info.tags || [],
      latency: 0,
    };
    this.agents.set(agentId, agent);
    this.addEvent('agent_connected', `Agent ${info.hostname} (${agentId}) connected`, agentId);
    return agent;
  }

  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'offline';
      agent.disconnectedAt = new Date().toISOString();
      this.addEvent('agent_disconnected', `Agent ${agent.hostname} disconnected`, agentId);
    }
  }

  getAgent(agentId) { return this.agents.get(agentId) || null; }
  getAllAgents() { return Array.from(this.agents.values()); }
  getOnlineAgents() { return this.getAllAgents().filter((a) => a.status === 'online'); }

  // ── Metrics (SQLite) ───────────────────────────────────

  updateMetrics(agentId, metrics) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.metrics = metrics;
      agent.lastSeen = new Date().toISOString();
      agent.status = 'online';
    }
    const ts = new Date().toISOString();
    SQL.insertMetric.run(agentId, JSON.stringify(metrics), ts);
    // Trim opportunistically (~10% of writes) to keep row count bounded
    if (Math.random() < 0.1) {
      SQL.trimMetrics.run(agentId, agentId, this.HISTORY_LIMIT);
    }
  }

  getMetricsHistory(agentId, limit = 60) {
    const rows = SQL.selectMetrics.all(agentId, 100000);
    const recent = rows.slice(-limit);
    return recent.map((r) => {
      const data = parseJsonSafe(r.data_json, {});
      return { ...data, timestamp: r.timestamp };
    });
  }

  // ── Events (SQLite) ─────────────────────────────────────

  addEvent(type, message, agentId = null, actor = null) {
    const event = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      type,
      message,
      agentId,
      actor: actor || null,
      timestamp: new Date().toISOString(),
    };
    SQL.insertEvent.run(event.id, type, message, agentId, actor || null, event.timestamp);
    if (Math.random() < 0.05) {
      // Trim opportunistically (~5% of writes) to avoid running on every insert
      SQL.trimEvents.run(EVENT_LIMIT);
    }
    return event;
  }

  getEvents(limit = 50, agentId = null) {
    const rows = agentId
      ? SQL.selectEventsByAgent.all(agentId, limit)
      : SQL.selectEventsAll.all(limit);
    return rows.map(rowToEvent);
  }

  /**
   * Filter, paginate and summarize the event log for the audit page.
   * SQLite-backed: cheap WHERE for type/agentId/actor/range, in-memory
   * filter for free-text `q` (search across multiple columns).
   *
   * @param {object} opts
   * @returns {{ items: object[], total: number, types: string[], actors: string[] }}
   */
  getEventsAdvanced(opts = {}) {
    const { type, agentId, actor, q, from, to } = opts;
    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 1000);
    const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);

    const where = [];
    const args = [];
    if (Array.isArray(type) && type.length) {
      where.push(`type IN (${type.map(() => '?').join(',')})`);
      args.push(...type);
    } else if (type) {
      where.push('type = ?');
      args.push(type);
    }
    if (agentId) { where.push('agent_id = ?'); args.push(agentId); }
    if (actor)   { where.push('actor = ?');    args.push(actor); }
    if (from)    { where.push('timestamp >= ?'); args.push(from); }
    if (to)      { where.push('timestamp <= ?'); args.push(to); }

    let needle = null;
    if (q) {
      needle = String(q).toLowerCase();
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    let total;
    let rows;
    if (needle) {
      // Free-text path: pull pre-filtered rows, then JS filter, then page.
      const pre = db.prepare(
        `SELECT * FROM events ${whereSql} ORDER BY timestamp DESC, id DESC`
      ).all(...args);
      const matches = pre.filter((r) => {
        const hay =
          (r.message || '').toLowerCase() + ' ' +
          (r.type || '').toLowerCase() + ' ' +
          (r.actor || '').toLowerCase() + ' ' +
          (r.agent_id || '').toLowerCase();
        return hay.includes(needle);
      });
      total = matches.length;
      rows = matches.slice(offset, offset + limit);
    } else {
      total = db.prepare(`SELECT COUNT(*) AS c FROM events ${whereSql}`).get(...args).c;
      rows = db.prepare(
        `SELECT * FROM events ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`
      ).all(...args, limit, offset);
    }

    const types = db.prepare('SELECT DISTINCT type FROM events ORDER BY type').all().map((r) => r.type);
    const actors = db.prepare("SELECT DISTINCT actor FROM events WHERE actor IS NOT NULL AND actor <> '' ORDER BY actor").all().map((r) => r.actor);

    return {
      items: rows.map(rowToEvent),
      total,
      types,
      actors,
    };
  }

  // ── Chat (SQLite) ───────────────────────────────────────

  addChatMessage(agentId, sender, senderName, text) {
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      sender,
      senderName,
      text,
      timestamp: new Date().toISOString(),
      agentId,
    };
    SQL.insertChat.run(msg.id, agentId, sender, senderName, text, msg.timestamp);
    SQL.trimChat.run(agentId, agentId, CHAT_LIMIT_PER_AGENT);
    return msg;
  }

  getChatMessages(agentId, limit = 100) {
    // selectChat sorts ASC; we want the LAST `limit` of the ordered list.
    const rows = SQL.selectChat.all(agentId, 100000);
    return rows.slice(-limit).map((r) => ({
      id: r.id,
      agentId: r.agentId,
      sender: r.sender,
      senderName: r.senderName,
      text: r.text,
      timestamp: r.timestamp,
    }));
  }

  // ── Alert Rules (SQLite) ────────────────────────────────

  addAlertRule(rule) {
    const r = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: rule.name,
      metric: rule.metric,
      operator: rule.operator || 'gt',
      threshold: rule.threshold,
      duration: rule.duration || 0,
      enabled: rule.enabled !== false,
      agentId: rule.agentId || null,
    };
    SQL.insertRule.run(
      r.id, r.name, r.metric, r.operator, r.threshold, r.duration,
      r.enabled ? 1 : 0, r.agentId
    );
    return r;
  }

  updateAlertRule(ruleId, updates) {
    const cur = SQL.selectRule.get(ruleId);
    if (!cur) return null;
    const next = { ...rowToRule(cur), ...updates };
    SQL.updateRule.run(
      next.name, next.metric, next.operator, next.threshold, next.duration,
      next.enabled ? 1 : 0, next.agentId || null, ruleId
    );
    return next;
  }

  deleteAlertRule(ruleId) {
    SQL.deleteRule.run(ruleId);
  }

  getAlertRules() {
    return SQL.selectAllRules.all().map(rowToRule);
  }

  // ── Triggered Alerts (SQLite) ───────────────────────────

  checkAlerts(agentId, metrics) {
    const agent = this.agents.get(agentId);
    if (!agent) return [];

    const newAlerts = [];
    const rules = SQL.selectAllRules.all();
    for (const ruleRow of rules) {
      const rule = rowToRule(ruleRow);
      if (!rule.enabled) continue;
      if (rule.agentId && rule.agentId !== agentId) continue;

      let currentValue = 0;
      if (rule.metric === 'cpu') currentValue = metrics.cpu.load;
      else if (rule.metric === 'ram') currentValue = metrics.memory.usedPercent;
      else if (rule.metric === 'disk') currentValue = metrics.disk.usedPercent;

      const triggered =
        rule.operator === 'gt' ? currentValue > rule.threshold : currentValue < rule.threshold;

      const timerKey = `${rule.id}:${agentId}`;
      if (triggered) {
        if (!this.alertTimers.has(timerKey)) {
          this.alertTimers.set(timerKey, Date.now());
        }
        const elapsed = (Date.now() - this.alertTimers.get(timerKey)) / 1000;
        if (elapsed >= rule.duration) {
          const existing = SQL.findOpenAlertForRule.get(rule.id, agentId);
          if (!existing) {
            const severity = currentValue > 90 ? 'critical' : 'warning';
            const alert = {
              id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
              ruleId: rule.id,
              ruleName: rule.name,
              agentId,
              agentHostname: agent.hostname,
              metric: rule.metric,
              currentValue: Math.round(currentValue * 10) / 10,
              threshold: rule.threshold,
              message: `${rule.metric.toUpperCase()} ${currentValue.toFixed(1)}% ${rule.operator === 'gt' ? '>' : '<'} ${rule.threshold}% on ${agent.hostname}`,
              severity,
              timestamp: new Date().toISOString(),
              acknowledged: false,
            };
            SQL.insertAlert.run(
              alert.id, alert.ruleId, alert.ruleName, alert.agentId, alert.agentHostname,
              alert.metric, alert.currentValue, alert.threshold, alert.message, alert.severity,
              alert.timestamp, 0
            );
            SQL.trimAlerts.run(ALERT_LIMIT);
            newAlerts.push(alert);
          }
        }
      } else {
        this.alertTimers.delete(timerKey);
      }
    }
    return newAlerts;
  }

  acknowledgeAlert(alertId) {
    SQL.ackAlert.run(alertId);
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    return row ? rowToAlert(row) : null;
  }

  acknowledgeAllAlerts() {
    return SQL.ackAll.run().changes;
  }

  getAlerts(limit = 100) {
    return SQL.selectAlerts.all(limit).map(rowToAlert);
  }

  getUnacknowledgedAlerts() {
    return SQL.selectUnacked.all().map(rowToAlert);
  }

  // ── Groups (SQLite) ─────────────────────────────────────

  addGroup(name, color = '#3b82f6') {
    // Upsert: on conflict only `color` is updated, `created_at` is
    // preserved. Re-read so the returned object reflects what's
    // actually in the DB (callers that rely on `createdAt` would
    // otherwise get a stale-looking new timestamp on color edits).
    SQL.upsertGroup.run(name, color, new Date().toISOString());
    const row = SQL.selectGroup.get(name);
    return row ? rowToGroup(row) : { name, color, createdAt: null };
  }

  deleteGroup(name) {
    SQL.deleteGroup.run(name);
    for (const [, agent] of this.agents) {
      if (agent.group === name) agent.group = null;
    }
  }

  getGroups() {
    return SQL.selectAllGroups.all().map(rowToGroup);
  }

  setAgentGroup(agentId, groupName) {
    const agent = this.agents.get(agentId);
    if (agent) agent.group = groupName;
    return agent;
  }

  getAgentsByGroup(groupName) {
    if (!groupName) return [];
    return this.getAllAgents().filter((a) => a.group === groupName);
  }

  // ── Latency (in-memory) ─────────────────────────────────

  updateLatency(agentId, latencyMs) {
    this.latencies.set(agentId, latencyMs);
    const agent = this.agents.get(agentId);
    if (agent) agent.latency = latencyMs;
  }

  getLatency(agentId) {
    return this.latencies.get(agentId) || 0;
  }

  // ── Scripts (SQLite) ────────────────────────────────────

  addScript(data) {
    const script = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: data.name,
      code: data.code,
      createdAt: new Date().toISOString(),
    };
    SQL.insertScript.run(script.id, script.name, script.code, script.createdAt);
    return script;
  }

  deleteScript(id) {
    SQL.deleteScript.run(id);
  }

  getScripts() {
    return SQL.selectAllScripts.all();
  }

  // ── Webhooks (SQLite) ───────────────────────────────────

  addWebhook(data) {
    const hook = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: data.name,
      type: data.type,
      enabled: data.enabled !== false,
      config: data.config || {},
      filters: data.filters || {},
      createdAt: new Date().toISOString(),
      lastDelivery: null,
    };
    SQL.insertWebhook.run(
      hook.id, hook.name, hook.type, hook.enabled ? 1 : 0,
      JSON.stringify(hook.config), JSON.stringify(hook.filters),
      hook.createdAt, null
    );
    return hook;
  }

  updateWebhook(id, updates) {
    const cur = SQL.selectWebhook.get(id);
    if (!cur) return null;
    const hook = rowToWebhook(cur);
    if (typeof updates.name === 'string') hook.name = updates.name;
    if (typeof updates.enabled === 'boolean') hook.enabled = updates.enabled;
    if (updates.config && typeof updates.config === 'object') {
      hook.config = { ...hook.config, ...updates.config };
    }
    if (updates.filters && typeof updates.filters === 'object') {
      hook.filters = { ...hook.filters, ...updates.filters };
    }
    SQL.updateWebhook.run(
      hook.name, hook.enabled ? 1 : 0,
      JSON.stringify(hook.config), JSON.stringify(hook.filters), id
    );
    return hook;
  }

  setWebhookLastDelivery(id, info) {
    const payload = JSON.stringify({ ...info, at: new Date().toISOString() });
    SQL.setWebhookDelivery.run(payload, id);
  }

  deleteWebhook(id) {
    SQL.deleteWebhook.run(id);
  }

  getWebhooks() {
    return SQL.selectAllWebhooks.all().map(rowToWebhook);
  }

  getWebhook(id) {
    const row = SQL.selectWebhook.get(id);
    return row ? rowToWebhook(row) : null;
  }

  // ── Schedules (SQLite) ──────────────────────────────────

  getSchedules() {
    return SQL.selectAllSchedules.all().map(rowToSchedule);
  }

  getSchedule(id) {
    const row = SQL.selectSchedule.get(id);
    return row ? rowToSchedule(row) : null;
  }

  addSchedule(data) {
    const sched = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: data.name,
      cron: data.cron,
      action: data.action,
      command: data.command || null,
      target: data.target,
      enabled: data.enabled !== false,
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy || null,
      lastRunAt: null,
      lastResult: null,
    };
    SQL.insertSchedule.run(
      sched.id, sched.name, sched.cron, sched.action, sched.command,
      JSON.stringify(sched.target || {}), sched.enabled ? 1 : 0,
      sched.createdAt, sched.createdBy, null, null
    );
    return sched;
  }

  updateSchedule(id, updates) {
    const cur = SQL.selectSchedule.get(id);
    if (!cur) return null;
    const sched = rowToSchedule(cur);
    const ALLOWED = ['name', 'cron', 'action', 'command', 'target', 'enabled'];
    for (const k of ALLOWED) {
      if (k in updates) sched[k] = updates[k];
    }
    SQL.updateSchedule.run(
      sched.name, sched.cron, sched.action, sched.command,
      JSON.stringify(sched.target || {}), sched.enabled ? 1 : 0, id
    );
    return sched;
  }

  deleteSchedule(id) {
    SQL.deleteSchedule.run(id);
  }

  recordScheduleRun(id, result) {
    SQL.recordRun.run(new Date().toISOString(), JSON.stringify(result || {}), id);
  }

  // ── Quick actions ──────────────────────────────────────
  // Saved one-click commands shown on the agent detail page.
  // Distinct from the user-script library (long, multi-line scripts):
  // these are short, OS-targeted, and have an icon for the button row.

  getQuickActions() {
    return SQL.selectAllQuickActions.all().map(rowToQuickAction);
  }

  getQuickAction(id) {
    const row = SQL.selectQuickAction.get(id);
    return row ? rowToQuickAction(row) : null;
  }

  addQuickAction(data, createdBy) {
    const id = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    SQL.insertQuickAction.run(
      id,
      data.name,
      data.description || null,
      data.command,
      data.os || 'all',
      data.icon || null,
      Number.isFinite(data.sortOrder) ? data.sortOrder : 100,
      now,
      createdBy || null,
    );
    return this.getQuickAction(id);
  }

  updateQuickAction(id, data) {
    const existing = this.getQuickAction(id);
    if (!existing) return null;
    SQL.updateQuickAction.run(
      data.name ?? existing.name,
      data.description ?? existing.description,
      data.command ?? existing.command,
      data.os ?? existing.os,
      data.icon ?? existing.icon,
      Number.isFinite(data.sortOrder) ? data.sortOrder : existing.sortOrder,
      id,
    );
    return this.getQuickAction(id);
  }

  deleteQuickAction(id) {
    return SQL.deleteQuickAction.run(id).changes;
  }

  // ── Push subscriptions ─────────────────────────────────
  // Stored per-user. A single user can have multiple subscriptions
  // (different browsers / devices). Endpoint is unique across all
  // users — the same browser will replace its row via INSERT OR
  // REPLACE rather than accumulate dupes.

  addPushSubscription(userId, sub, userAgent) {
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      throw new Error('subscription must have endpoint and keys.p256dh / keys.auth');
    }
    const id = `${userId}:${Buffer.from(sub.endpoint).toString('base64').slice(-24)}`;
    SQL.insertPushSub.run(
      id, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth,
      userAgent || null, new Date().toISOString()
    );
    return id;
  }

  removePushSubscriptionByEndpoint(endpoint) {
    return SQL.deletePushSubByEndpoint.run(endpoint).changes;
  }

  // User-scoped variant. Routes that delete in response to a user
  // request use this so a logged-in user can never remove someone
  // else's subscription, even if they know the endpoint URL.
  removePushSubscriptionByEndpointForUser(endpoint, userId) {
    return SQL.deletePushSubByEndpointForUser.run(endpoint, userId).changes;
  }

  removeAllPushSubscriptionsForUser(userId) {
    return SQL.deletePushSubsByUser.run(userId).changes;
  }

  getPushSubscriptionsForUser(userId) {
    return SQL.selectPushSubsByUser.all(userId).map(rowToPushSub);
  }

  getAllPushSubscriptions() {
    return SQL.selectAllPushSubs.all().map(rowToPushSub);
  }

  countPushSubscriptionsForUser(userId) {
    return SQL.countPushSubsByUser.get(userId).c;
  }

  touchPushSubscription(endpoint) {
    SQL.touchPushSub.run(new Date().toISOString(), endpoint);
  }

  // ── Login security ────────────────────────────────────
  // Two-dimensional lockout (per-IP and per-username) so an attacker
  // can't flood one user account from a botnet (per-user fires) and a
  // single bad actor can't sweep many usernames from one IP (per-IP
  // fires). State is persisted across restarts in SQLite.

  /**
   * Record a failed login attempt for the given (ip, username) pair.
   * Returns the post-record state so callers can decide whether to
   * surface "you've been locked out" in events.
   */
  recordLoginFailure(ip, username) {
    const now = Date.now();
    const ipKey = String(ip || 'unknown');

    // per-IP: 5 fails in 15 min → 15 min lock
    const ipWindow = 15 * 60 * 1000;
    const ipMax = 5;
    const ipLockMs = 15 * 60 * 1000;

    // per-username: 10 fails in 30 min → 30 min lock
    const userWindow = 30 * 60 * 1000;
    const userMax = 10;
    const userLockMs = 30 * 60 * 1000;

    SQL.insertLoginFailure.run('ip', ipKey, now);
    SQL.pruneLoginFailures.run('ip', ipKey, now - ipWindow);
    const ipAttempts = SQL.countLoginFailures.get('ip', ipKey, now - ipWindow).c;

    let ipLockedUntil = null;
    const existingIpLock = SQL.selectLockout.get('ip', ipKey);
    if (existingIpLock && existingIpLock.lockedUntil > now) {
      ipLockedUntil = existingIpLock.lockedUntil;
    }
    if (ipAttempts >= ipMax) {
      ipLockedUntil = now + ipLockMs;
      SQL.upsertLockout.run('ip', ipKey, ipLockedUntil);
    }

    let userLockedUntil = null;
    let userAttempts = 0;
    if (username && typeof username === 'string') {
      const userKey = username.toLowerCase().trim();
      SQL.insertLoginFailure.run('user', userKey, now);
      SQL.pruneLoginFailures.run('user', userKey, now - userWindow);
      userAttempts = SQL.countLoginFailures.get('user', userKey, now - userWindow).c;

      const existingUserLock = SQL.selectLockout.get('user', userKey);
      if (existingUserLock && existingUserLock.lockedUntil > now) {
        userLockedUntil = existingUserLock.lockedUntil;
      }
      if (userAttempts >= userMax) {
        userLockedUntil = now + userLockMs;
        SQL.upsertLockout.run('user', userKey, userLockedUntil);
      }
    }

    return { ipAttempts, userAttempts, ipLockedUntil, userLockedUntil };
  }

  /**
   * Clear failure counters after a successful login. Existing lockouts
   * stay intact — a successful login during a "locked" window is still
   * possible if the auth itself succeeds, but we want repeated quick
   * logins-then-failures not to bypass the lockout window.
   */
  clearLoginFailures(ip, username) {
    if (ip) SQL.deleteLoginFailures.run('ip', String(ip));
    if (username) SQL.deleteLoginFailures.run('user', String(username).toLowerCase().trim());
  }

  /** Returns the current lockout state for the given (ip, username) pair. */
  getLoginLockout(ip, username) {
    const now = Date.now();
    const ipKey = String(ip || 'unknown');
    let ipLockedUntil = null;
    const ipLock = SQL.selectLockout.get('ip', ipKey);
    if (ipLock && ipLock.lockedUntil > now) ipLockedUntil = ipLock.lockedUntil;

    let userLockedUntil = null;
    if (username && typeof username === 'string') {
      const userKey = username.toLowerCase().trim();
      const userLock = SQL.selectLockout.get('user', userKey);
      if (userLock && userLock.lockedUntil > now) userLockedUntil = userLock.lockedUntil;
    }
    return { ipLockedUntil, userLockedUntil };
  }

  /** Manually clear lockout for a username (admin override). */
  clearLockout(username) {
    if (!username) return false;
    const userKey = String(username).toLowerCase().trim();
    if (!userKey) return false;
    SQL.deleteLockout.run('user', userKey);
    SQL.deleteLoginFailures.run('user', userKey);
    return true;
  }
}

module.exports = new Store();
