/**
 * Agent Socket.IO namespace (`/agent`).
 *
 * Every connected agent identifies itself via handshake.auth and gets
 * its events routed back out to the dashboard namespace. This module
 * is purely a relay — no business logic lives here.
 */
module.exports = function registerAgentSockets({ agentNsp, dashNsp, store, notifier }) {
  agentNsp.on('connection', (socket) => {
    const agentInfo = socket.handshake.auth;
    const agentId = agentInfo.agentId || socket.id;

    console.log(`[Agent Connected] ${agentInfo.hostname} (${agentId})`);

    const agent = store.registerAgent(agentId, agentInfo);
    dashNsp.emit('agent:connected', agent);
    dashNsp.emit('agents:list', store.getAllAgents());

    const pingInterval = setInterval(() => {
      socket.emit('ping:latency', { timestamp: Date.now() });
    }, 10000);

    socket.on('metrics', (metrics) => {
      store.updateMetrics(agentId, metrics);
      dashNsp.emit('agent:metrics', { agentId, metrics, timestamp: new Date().toISOString() });

      const newAlerts = store.checkAlerts(agentId, metrics);
      for (const alert of newAlerts) {
        store.addEvent('alert_triggered', alert.message, agentId);
        dashNsp.emit('alert:new', alert);
        notifier.dispatchAlert(store, alert);
      }
    });

    socket.on('command:result', (data) => {
      store.addEvent('command_result', `Command result from ${agent.hostname}: ${data.command}`, agentId);
      dashNsp.emit('command:result', { agentId, ...data });
    });

    // ─ Pure relay: agent → dashboard ────────────────────────
    const relays = [
      'file:list:result',
      'file:content:result',
      'services:list:result',
      'service:action:result',
      'processes:list:result',
      'processes:kill:result',
      'screen:frame',
      'clipboard:data',
      'screen:cursor',
      'file:transfer:progress',
      'file:transfer:complete',
      'file:upload:data',
    ];
    for (const evt of relays) {
      socket.on(evt, (data) => dashNsp.emit(evt, { agentId, ...data }));
    }

    socket.on('screen:monitors', (data) => {
      dashNsp.emit('screen:monitors', { agentId, monitors: data.monitors });
    });

    socket.on('chat:message', (data) => {
      const msg = store.addChatMessage(agentId, 'agent', data.senderName || agentInfo.hostname, data.text);
      dashNsp.emit('chat:message', msg);
    });

    socket.on('pong:latency', (data) => {
      const latency = Date.now() - data.timestamp;
      store.updateLatency(agentId, latency);
      dashNsp.emit('agent:latency', { agentId, latency });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Agent Disconnected] ${agentInfo.hostname} (${agentId}) — ${reason}`);
      clearInterval(pingInterval);
      store.removeAgent(agentId);
      dashNsp.emit('agent:disconnected', { agentId });
      dashNsp.emit('agents:list', store.getAllAgents());
    });
  });
};
