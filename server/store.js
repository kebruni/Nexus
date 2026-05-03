/**
 * PC Control Hub — In-Memory Data Store with JSON-file persistence.
 *
 * Hot read/write path stays in memory. Mutations schedule a debounced atomic
 * snapshot to .data/store.json so eventLog, chat, alert rules, alerts, groups
 * and scripts survive a server restart.
 */

const persistence = require('./persistence');

class Store {
  constructor() {
    /** @type {Map<string, object>} agentId -> agent info & latest metrics */
    this.agents = new Map();

    /** @type {Map<string, Array>} agentId -> metrics history array */
    this.metricsHistory = new Map();

    /** @type {Array<object>} System event log */
    this.eventLog = [];

    /** @type {Map<string, Array>} agentId -> chat messages */
    this.chatMessages = new Map();

    /** @type {Array<object>} Alert rules */
    this.alertRules = [];

    /** @type {Array<object>} Triggered alerts */
    this.alerts = [];

    /** @type {Map<string, number>} ruleId:agentId -> timestamp first triggered */
    this.alertTimers = new Map();

    /** @type {Map<string, object>} groupName -> group info */
    this.groups = new Map();

    /** @type {Map<string, number>} agentId -> latency ms */
    this.latencies = new Map();

    /** @type {Array<object>} Saved scripts */
    this.scripts = [];

    /** @type {Array<object>} Webhook delivery channels for alerts */
    this.webhooks = [];

    /** @type {Array<object>} Cron-style schedules */
    this.schedules = [];

    this.HISTORY_LIMIT = 200;

    this._loadFromDisk();

    // Garbage collection for dead agents (run every hour)
    setInterval(() => this.cleanupDeadAgents(), 60 * 60 * 1000);
  }

  // ── Persistence ─────────────────────────────────────────

  _loadFromDisk() {
    const data = persistence.loadStore();
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.eventLog)) this.eventLog = data.eventLog;
    if (Array.isArray(data.alertRules)) this.alertRules = data.alertRules;
    if (Array.isArray(data.alerts)) this.alerts = data.alerts;
    if (Array.isArray(data.scripts)) this.scripts = data.scripts;
    if (Array.isArray(data.webhooks)) this.webhooks = data.webhooks;
    if (Array.isArray(data.schedules)) this.schedules = data.schedules;

    if (data.chatMessages && typeof data.chatMessages === 'object') {
      for (const [agentId, msgs] of Object.entries(data.chatMessages)) {
        if (Array.isArray(msgs)) this.chatMessages.set(agentId, msgs);
      }
    }

    if (data.groups && typeof data.groups === 'object') {
      for (const [name, group] of Object.entries(data.groups)) {
        this.groups.set(name, group);
      }
    }

    console.log(
      `[Store] Loaded persisted data: ${this.eventLog.length} events, ` +
        `${this.alertRules.length} alert rules, ${this.alerts.length} alerts, ` +
        `${this.scripts.length} scripts, ${this.groups.size} groups`
    );
  }

  _snapshot() {
    return {
      eventLog: this.eventLog,
      alertRules: this.alertRules,
      alerts: this.alerts,
      scripts: this.scripts,
      webhooks: this.webhooks,
      schedules: this.schedules,
      chatMessages: Object.fromEntries(this.chatMessages),
      groups: Object.fromEntries(this.groups),
    };
  }

  _persist() {
    persistence.scheduleStoreSave(() => this._snapshot());
  }

  flushSync() {
    persistence.flushSync(() => this._snapshot());
  }

  // ── Garbage Collection ──────────────────────────────────

  cleanupDeadAgents() {
    const now = new Date();
    const DEAD_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.status === 'offline' && agent.disconnectedAt) {
        const disconnectedTime = new Date(agent.disconnectedAt);
        if (now - disconnectedTime > DEAD_THRESHOLD) {
          this.agents.delete(agentId);
          this.metricsHistory.delete(agentId);
          this.chatMessages.delete(agentId);
          this.latencies.delete(agentId);
          console.log(`[Store] Garbage collected dead agent: ${agentId}`);
        }
      }
    }
  }

  // ── Agents ──────────────────────────────────────────────

  registerAgent(agentId, info) {
    // Remove any previous entries with the same hostname to prevent duplicates
    for (const [existingId, existingAgent] of this.agents.entries()) {
      if (existingId !== agentId && existingAgent.hostname === info.hostname) {
        this.agents.delete(existingId);
        this.metricsHistory.delete(existingId);
        this.chatMessages.delete(existingId);
        this.latencies.delete(existingId);
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

  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getOnlineAgents() {
    return this.getAllAgents().filter((a) => a.status === 'online');
  }

  // ── Metrics ─────────────────────────────────────────────

  updateMetrics(agentId, metrics) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.metrics = metrics;
      agent.lastSeen = new Date().toISOString();
      agent.status = 'online';
    }

    // Save to history
    if (!this.metricsHistory.has(agentId)) {
      this.metricsHistory.set(agentId, []);
    }
    const history = this.metricsHistory.get(agentId);
    history.push({ ...metrics, timestamp: new Date().toISOString() });

    // Trim history
    if (history.length > this.HISTORY_LIMIT) {
      history.splice(0, history.length - this.HISTORY_LIMIT);
    }
    // Metrics history is intentionally NOT persisted — it's high-volume and
    // not useful after a restart.
  }

  getMetricsHistory(agentId, limit = 60) {
    const history = this.metricsHistory.get(agentId) || [];
    return history.slice(-limit);
  }

  // ── Event Log ───────────────────────────────────────────

  addEvent(type, message, agentId = null, actor = null) {
    const event = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      type,
      message,
      agentId,
      actor: actor || null,
      timestamp: new Date().toISOString(),
    };
    this.eventLog.unshift(event);

    // Keep last 1000 events
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(0, 1000);
    }
    this._persist();
    return event;
  }

  getEvents(limit = 50, agentId = null) {
    let events = this.eventLog;
    if (agentId) {
      events = events.filter((e) => e.agentId === agentId);
    }
    return events.slice(0, limit);
  }

  /**
   * Filter, paginate and summarize the event log for the audit page.
   * All filters are AND'ed. Empty/undefined fields are ignored.
   *
   * @param {object} opts
   * @param {string|string[]} [opts.type]      single type or array of types
   * @param {string} [opts.agentId]
   * @param {string} [opts.actor]
   * @param {string} [opts.q]                 substring (case-insensitive) over message+type+actor+agentId
   * @param {string} [opts.from]              ISO timestamp lower bound (inclusive)
   * @param {string} [opts.to]                ISO timestamp upper bound (inclusive)
   * @param {number} [opts.limit=100]
   * @param {number} [opts.offset=0]
   * @returns {{ items: object[], total: number, types: string[], actors: string[] }}
   */
  getEventsAdvanced(opts = {}) {
    const { type, agentId, actor, q, from, to } = opts;
    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 1000);
    const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);

    const types = new Set();
    const actors = new Set();
    for (const ev of this.eventLog) {
      types.add(ev.type);
      if (ev.actor) actors.add(ev.actor);
    }

    const typeFilter = Array.isArray(type)
      ? new Set(type.filter(Boolean))
      : type
        ? new Set([type])
        : null;

    const fromMs = from ? Date.parse(from) : null;
    const toMs = to ? Date.parse(to) : null;
    const needle = q ? String(q).toLowerCase() : null;

    const matches = (ev) => {
      if (typeFilter && !typeFilter.has(ev.type)) return false;
      if (agentId && ev.agentId !== agentId) return false;
      if (actor && ev.actor !== actor) return false;
      if (fromMs != null) {
        const ts = Date.parse(ev.timestamp);
        if (Number.isFinite(ts) && ts < fromMs) return false;
      }
      if (toMs != null) {
        const ts = Date.parse(ev.timestamp);
        if (Number.isFinite(ts) && ts > toMs) return false;
      }
      if (needle) {
        const hay =
          (ev.message || '').toLowerCase() +
          ' ' +
          (ev.type || '').toLowerCase() +
          ' ' +
          (ev.actor || '').toLowerCase() +
          ' ' +
          (ev.agentId || '').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    };

    const filtered = this.eventLog.filter(matches);
    const items = filtered.slice(offset, offset + limit);

    return {
      items,
      total: filtered.length,
      types: Array.from(types).sort(),
      actors: Array.from(actors).sort(),
    };
  }

  // ── Chat ────────────────────────────────────────────────

  addChatMessage(agentId, sender, senderName, text) {
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      sender,
      senderName,
      text,
      timestamp: new Date().toISOString(),
      agentId,
    };
    if (!this.chatMessages.has(agentId)) {
      this.chatMessages.set(agentId, []);
    }
    const msgs = this.chatMessages.get(agentId);
    msgs.push(msg);
    if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
    this._persist();
    return msg;
  }

  getChatMessages(agentId, limit = 100) {
    const msgs = this.chatMessages.get(agentId) || [];
    return msgs.slice(-limit);
  }

  // ── Alert Rules ─────────────────────────────────────────

  addAlertRule(rule) {
    const alertRule = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: rule.name,
      metric: rule.metric,
      operator: rule.operator || 'gt',
      threshold: rule.threshold,
      duration: rule.duration || 0,
      enabled: rule.enabled !== false,
      agentId: rule.agentId || null,
    };
    this.alertRules.push(alertRule);
    this._persist();
    return alertRule;
  }

  updateAlertRule(ruleId, updates) {
    const rule = this.alertRules.find((r) => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this._persist();
    }
    return rule;
  }

  deleteAlertRule(ruleId) {
    const before = this.alertRules.length;
    this.alertRules = this.alertRules.filter((r) => r.id !== ruleId);
    if (this.alertRules.length !== before) this._persist();
  }

  getAlertRules() {
    return this.alertRules;
  }

  // ── Triggered Alerts ────────────────────────────────────

  checkAlerts(agentId, metrics) {
    const agent = this.agents.get(agentId);
    if (!agent) return [];

    const newAlerts = [];
    for (const rule of this.alertRules) {
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
          // Check if same alert already exists unacknowledged
          const existing = this.alerts.find(
            (a) => a.ruleId === rule.id && a.agentId === agentId && !a.acknowledged
          );
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
            this.alerts.unshift(alert);
            if (this.alerts.length > 500) this.alerts = this.alerts.slice(0, 500);
            newAlerts.push(alert);
            this._persist();
          }
        }
      } else {
        this.alertTimers.delete(timerKey);
      }
    }
    return newAlerts;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this._persist();
    }
    return alert;
  }

  acknowledgeAllAlerts() {
    let count = 0;
    for (const a of this.alerts) {
      if (!a.acknowledged) {
        a.acknowledged = true;
        count += 1;
      }
    }
    if (count > 0) this._persist();
    return count;
  }

  getAlerts(limit = 100) {
    return this.alerts.slice(0, limit);
  }

  getUnacknowledgedAlerts() {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  // ── Groups ──────────────────────────────────────────────

  addGroup(name, color = '#3b82f6') {
    const group = { name, color, createdAt: new Date().toISOString() };
    this.groups.set(name, group);
    this._persist();
    return group;
  }

  deleteGroup(name) {
    this.groups.delete(name);
    // Remove group from agents
    for (const [, agent] of this.agents) {
      if (agent.group === name) agent.group = null;
    }
    this._persist();
  }

  getGroups() {
    return Array.from(this.groups.values());
  }

  setAgentGroup(agentId, groupName) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.group = groupName;
    }
    return agent;
  }

  /**
   * Returns all agents (online or offline) that belong to `groupName`.
   * Used by bulk-action endpoints to fan a single command out to a group.
   */
  getAgentsByGroup(groupName) {
    if (!groupName) return [];
    return this.getAllAgents().filter((a) => a.group === groupName);
  }

  // ── Latency ─────────────────────────────────────────────

  updateLatency(agentId, latencyMs) {
    this.latencies.set(agentId, latencyMs);
    const agent = this.agents.get(agentId);
    if (agent) agent.latency = latencyMs;
  }

  getLatency(agentId) {
    return this.latencies.get(agentId) || 0;
  }

  // ── Scripts ─────────────────────────────────────────────

  addScript(data) {
    const script = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: data.name,
      code: data.code,
      createdAt: new Date().toISOString(),
    };
    this.scripts.push(script);
    this._persist();
    return script;
  }

  deleteScript(id) {
    const before = this.scripts.length;
    this.scripts = this.scripts.filter((s) => s.id !== id);
    if (this.scripts.length !== before) this._persist();
  }

  getScripts() {
    return this.scripts;
  }

  // ── Webhooks ────────────────────────────────────────────

  addWebhook(data) {
    const hook = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: data.name,
      type: data.type, // 'telegram' | 'discord' | 'slack' | 'generic'
      enabled: data.enabled !== false,
      config: data.config || {},
      filters: data.filters || {},
      createdAt: new Date().toISOString(),
      lastDelivery: null,
    };
    this.webhooks.push(hook);
    this._persist();
    return hook;
  }

  updateWebhook(id, updates) {
    const hook = this.webhooks.find((h) => h.id === id);
    if (!hook) return null;
    if (typeof updates.name === 'string') hook.name = updates.name;
    if (typeof updates.enabled === 'boolean') hook.enabled = updates.enabled;
    if (updates.config && typeof updates.config === 'object') hook.config = { ...hook.config, ...updates.config };
    if (updates.filters && typeof updates.filters === 'object') hook.filters = { ...hook.filters, ...updates.filters };
    this._persist();
    return hook;
  }

  setWebhookLastDelivery(id, info) {
    const hook = this.webhooks.find((h) => h.id === id);
    if (!hook) return;
    hook.lastDelivery = { ...info, at: new Date().toISOString() };
    this._persist();
  }

  deleteWebhook(id) {
    const before = this.webhooks.length;
    this.webhooks = this.webhooks.filter((h) => h.id !== id);
    if (this.webhooks.length !== before) this._persist();
  }

  getWebhooks() {
    return this.webhooks;
  }

  getWebhook(id) {
    return this.webhooks.find((h) => h.id === id) || null;
  }

  // ── Schedules ──────────────────────────────────────────
  // Cron-style scheduled bulk actions. Persisted in the store snapshot
  // and consulted once per minute by the scheduler runner in
  // `server/scheduler.js`. Shape:
  //   { id, name, cron, action, command?, target:{kind,value},
  //     enabled, createdAt, createdBy, lastRunAt?, lastResult? }

  getSchedules() {
    return this.schedules;
  }

  getSchedule(id) {
    return this.schedules.find((s) => s.id === id) || null;
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
    this.schedules.push(sched);
    this._persist();
    return sched;
  }

  updateSchedule(id, updates) {
    const sched = this.schedules.find((s) => s.id === id);
    if (!sched) return null;
    const ALLOWED = ['name', 'cron', 'action', 'command', 'target', 'enabled'];
    for (const k of ALLOWED) {
      if (k in updates) sched[k] = updates[k];
    }
    this._persist();
    return sched;
  }

  deleteSchedule(id) {
    const before = this.schedules.length;
    this.schedules = this.schedules.filter((s) => s.id !== id);
    if (this.schedules.length !== before) this._persist();
  }

  /**
   * Mark a schedule as just-run with its outcome. The runner calls this
   * on every tick (regardless of dispatch success) so the UI can show
   * "last run 3m ago — 5 sent, 2 skipped".
   */
  recordScheduleRun(id, result) {
    const sched = this.schedules.find((s) => s.id === id);
    if (!sched) return;
    sched.lastRunAt = new Date().toISOString();
    sched.lastResult = result;
    this._persist();
  }
}

module.exports = new Store();
