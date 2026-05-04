/**
 * Cross-cutting helpers that need both the agent namespace (to reach
 * agent sockets) and the store (to record events and look up targets).
 *
 * Kept as a factory so routes and sockets can share exactly one
 * `findAgentSocket` / `fanOutBulkAction` / `dispatchSchedule` closure.
 */

const BULK_ACTIONS = new Set(['execute', 'reboot', 'shutdown', 'lockscreen', 'alarm']);

function create({ store, agentNsp }) {
  /** Look up an agent socket by the auth `agentId`. */
  function findAgentSocket(agentId) {
    for (const [, socket] of agentNsp.sockets) {
      if (socket.handshake.auth.agentId === agentId) return socket;
    }
    return null;
  }

  /**
   * Fan a single action out to every matching agent. Reused by the
   * `/api/bulk/command` REST endpoint and by the cron scheduler.
   *
   * @param {object} opts
   * @param {string}   opts.action     one of BULK_ACTIONS
   * @param {string=}  opts.groupName  target a whole group
   * @param {string[]=} opts.agentIds  or an explicit id list
   * @param {string=}  opts.command    required when action=execute
   * @param {string=}  opts.actor      username recorded on the event
   * @param {string=}  opts.source     'manual' | 'scheduled' (event prefix)
   */
  function fanOutBulkAction({ action, groupName, agentIds, command, actor, source = 'manual' }) {
    if (!BULK_ACTIONS.has(action)) {
      return { ok: false, status: 400, error: 'Invalid action', allowed: Array.from(BULK_ACTIONS) };
    }
    if (action === 'execute' && (!command || typeof command !== 'string')) {
      return { ok: false, status: 400, error: '`command` is required for action=execute' };
    }

    let targets = [];
    if (Array.isArray(agentIds) && agentIds.length) {
      targets = agentIds.map((id) => store.getAgent(id)).filter(Boolean);
    } else if (groupName) {
      targets = store.getAgentsByGroup(groupName);
    } else {
      return { ok: false, status: 400, error: 'Either `groupName` or `agentIds[]` is required' };
    }

    if (!targets.length) return { ok: false, status: 404, error: 'No matching agents' };

    const dispatched = [];
    const skipped = [];

    for (const agent of targets) {
      const sock = findAgentSocket(agent.id);
      if (!sock) {
        skipped.push({ agentId: agent.id, hostname: agent.hostname, reason: 'offline' });
        continue;
      }
      switch (action) {
        case 'execute':
          sock.emit('command:execute', { command, requestId: `${Date.now()}-${agent.id}` });
          break;
        case 'reboot': sock.emit('command:reboot'); break;
        case 'shutdown': sock.emit('command:shutdown'); break;
        case 'lockscreen': sock.emit('command:lockscreen'); break;
        case 'alarm': sock.emit('command:alarm'); break;
      }
      dispatched.push({ agentId: agent.id, hostname: agent.hostname });
    }

    const scope = groupName ? `group "${groupName}"` : `${targets.length} selected`;
    const detail = action === 'execute' ? `: ${command}` : '';
    const eventType = source === 'scheduled' ? `scheduled_${action}` : `bulk_${action}`;
    store.addEvent(
      eventType,
      `${source === 'scheduled' ? 'Scheduled' : 'Bulk'} ${action} to ${scope} — ${dispatched.length} sent, ${skipped.length} skipped${detail}`,
      null,
      actor || null,
    );

    return { ok: true, action, dispatched, skipped, sent: dispatched.length, total: targets.length };
  }

  /** Run a single schedule — wrapped fan-out plus a recorded run entry. */
  function dispatchSchedule(schedule) {
    const target = schedule.target || {};
    const result = fanOutBulkAction({
      action: schedule.action,
      groupName: target.kind === 'group' ? target.value : undefined,
      agentIds: target.kind === 'agentIds' ? target.value : undefined,
      command: schedule.command || undefined,
      actor: `schedule:${schedule.name}`,
      source: 'scheduled',
    });
    const summary = result.ok
      ? { sent: result.sent, skipped: result.skipped.length, error: null }
      : { sent: 0, skipped: 0, error: result.error };
    store.recordScheduleRun(schedule.id, summary);
    return summary;
  }

  return { findAgentSocket, fanOutBulkAction, dispatchSchedule, BULK_ACTIONS };
}

module.exports = { create, BULK_ACTIONS };
