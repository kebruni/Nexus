/**
 * PC Control Hub — In-Memory Data Store
 * Stores agents, metrics history, event logs, chat, alerts, groups.
 * Can be swapped for Redis in production.
 */

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

    this.HISTORY_LIMIT = 200;

    // Garbage collection for dead agents (run every hour)
    setInterval(() => this.cleanupDeadAgents(), 60 * 60 * 1000);
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
  }

  getMetricsHistory(agentId, limit = 60) {
    const history = this.metricsHistory.get(agentId) || [];
    return history.slice(-limit);
  }

  // ── Event Log ───────────────────────────────────────────

  addEvent(type, message, agentId = null) {
    const event = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      type,
      message,
      agentId,
      timestamp: new Date().toISOString(),
    };
    this.eventLog.unshift(event);

    // Keep last 1000 events
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(0, 1000);
    }
    return event;
  }

  getEvents(limit = 50, agentId = null) {
    let events = this.eventLog;
    if (agentId) {
      events = events.filter((e) => e.agentId === agentId);
    }
    return events.slice(0, limit);
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
    return alertRule;
  }

  updateAlertRule(ruleId, updates) {
    const rule = this.alertRules.find((r) => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
    }
    return rule;
  }

  deleteAlertRule(ruleId) {
    this.alertRules = this.alertRules.filter((r) => r.id !== ruleId);
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
    if (alert) alert.acknowledged = true;
    return alert;
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
    return group;
  }

  deleteGroup(name) {
    this.groups.delete(name);
    // Remove group from agents
    for (const [, agent] of this.agents) {
      if (agent.group === name) agent.group = null;
    }
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
    return script;
  }

  deleteScript(id) {
    this.scripts = this.scripts.filter((s) => s.id !== id);
  }

  getScripts() {
    return this.scripts;
  }
}

module.exports = new Store();
