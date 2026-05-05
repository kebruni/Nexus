/**
 * Dashboard Socket.IO namespace (`/dashboard`).
 *
 * Every event is gated by a role check — viewers can observe but not
 * drive remote input or destructive operations. The actual relay into
 * the agent namespace goes through `findAgentSocket()` which the
 * orchestration module hands us.
 */
const path = require('path');
const dgram = require('dgram');
const localFs = require('../lib/localFs');

const ROLE_RANK = { viewer: 0, operator: 1, admin: 2 };
function hasRole(socket, minRole) {
  const role = socket.user && socket.user.role;
  if (!role) return false;
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}
function deny(socket, action) {
  socket.emit('command:result', {
    error: 'Forbidden',
    action,
    required: 'operator',
    actual: socket.user && socket.user.role,
  });
}

module.exports = function registerDashboardSockets({ dashNsp, store, orchestration }) {
  const { findAgentSocket } = orchestration;

  dashNsp.on('connection', (socket) => {
    console.log(`[Dashboard Connected] ${socket.user.username} (${socket.user.role})`);

    socket.emit('agents:list', store.getAllAgents());
    socket.on('agents:requestList', () => socket.emit('agents:list', store.getAllAgents()));

    // ── Single-agent commands (simple relay + event log) ────
    const singleAgentCommands = [
      { evt: 'command:execute', role: 'operator', eventType: 'command_sent',
        msg: (agentId, { command }, u) => `Admin sent command to ${agentId}: ${command}`,
        forward: (agentSocket, { command }) => agentSocket.emit('command:execute', { command, requestId: Date.now().toString() }) },
      { evt: 'command:reboot', role: 'operator', eventType: 'command_reboot',
        msg: (agentId) => `Admin sent reboot to ${agentId}`,
        forward: (agentSocket) => agentSocket.emit('command:reboot') },
      { evt: 'command:shutdown', role: 'operator', eventType: 'command_shutdown',
        msg: (agentId) => `Admin sent shutdown to ${agentId}`,
        forward: (agentSocket) => agentSocket.emit('command:shutdown') },
      { evt: 'command:lockscreen', role: 'operator', eventType: 'command_lock',
        msg: (agentId) => `Admin locked screen on ${agentId}`,
        forward: (agentSocket) => agentSocket.emit('command:lockscreen') },
      { evt: 'command:alarm', role: 'operator', eventType: 'command_alarm',
        msg: (agentId) => `Admin triggered alarm on ${agentId}`,
        forward: (agentSocket) => agentSocket.emit('command:alarm') },
    ];
    for (const cmd of singleAgentCommands) {
      socket.on(cmd.evt, (payload) => {
        const { agentId } = payload || {};
        if (!hasRole(socket, cmd.role)) return deny(socket, cmd.evt);
        const agentSocket = findAgentSocket(agentId);
        if (!agentSocket) {
          if (cmd.evt === 'command:execute') {
            socket.emit('command:result', { agentId, error: 'Agent not connected', command: payload.command });
          }
          return;
        }
        store.addEvent(cmd.eventType, cmd.msg(agentId, payload, socket.user.username), agentId, socket.user.username);
        cmd.forward(agentSocket, payload);
      });
    }

    // ── File operations ─────────────────────────────────────
    socket.on('file:list', ({ agentId, dirPath }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('file:list', { path: dirPath });
      else socket.emit('file:list:result', { agentId, error: 'Agent not connected' });
    });

    socket.on('file:download', ({ agentId, filePath }) => {
      if (!hasRole(socket, 'operator')) return deny(socket, 'file:download');
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) {
        store.addEvent('file_download', `Admin downloaded file: ${filePath}`, agentId, socket.user.username);
        agentSocket.emit('file:download', { path: filePath });
      }
    });

    socket.on('file:delete', ({ agentId, filePath }) => {
      if (!hasRole(socket, 'operator')) return deny(socket, 'file:delete');
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) {
        store.addEvent('file_delete', `Admin deleted file: ${filePath}`, agentId, socket.user.username);
        agentSocket.emit('file:delete', { path: filePath });
      }
    });

    // ── Local (server) file operations ──────────────────────
    socket.on('local:file:list', ({ dirPath }) => {
      socket.emit('local:file:list:result', localFs.listDirectory(dirPath));
    });

    socket.on('local:file:read', ({ filePath }) => {
      socket.emit('local:file:read:result', localFs.readFile(filePath));
    });

    // ─ Transfer: server → agent
    socket.on('local:transfer:to-agent', ({ filePath, destAgentId, destPath, transferId }) => {
      if (!hasRole(socket, 'operator')) {
        socket.emit('file:transfer:status', { transferId, success: false, error: 'Forbidden' });
        return;
      }
      const dstSocket = findAgentSocket(destAgentId);
      if (!dstSocket) {
        socket.emit('file:transfer:status', { transferId, success: false, error: 'Agent not connected' });
        return;
      }
      const fileName = path.basename(filePath);
      store.addEvent('file_transfer', `Local transfer "${fileName}" to ${destAgentId}`, destAgentId, socket.user.username);

      socket.emit('file:transfer:status', { transferId, status: 'reading', fileName });
      const readResult = localFs.readFile(filePath);
      if (!readResult.success) {
        socket.emit('file:transfer:status', { transferId, success: false, error: readResult.error || 'Failed to read local file' });
        return;
      }
      socket.emit('file:transfer:status', { transferId, status: 'writing', fileName, size: readResult.size });
      dstSocket.emit('file:upload', { fileName: readResult.name, fileData: readResult.content, remotePath: destPath });
      dstSocket.once('file:transfer:complete', (result) => {
        socket.emit('file:transfer:status', {
          transferId, success: result.success, fileName: readResult.name,
          size: readResult.size, destPath: result.path, error: result.error,
        });
      });
    });

    // ─ Transfer: agent → server
    socket.on('local:transfer:from-agent', ({ sourceAgentId, filePath, destPath, transferId }) => {
      if (!hasRole(socket, 'operator')) {
        socket.emit('file:transfer:status', { transferId, success: false, error: 'Forbidden' });
        return;
      }
      const srcSocket = findAgentSocket(sourceAgentId);
      if (!srcSocket) {
        socket.emit('file:transfer:status', { transferId, success: false, error: 'Agent not connected' });
        return;
      }
      const fileName = filePath.split(/[/\\]/).pop();
      store.addEvent('file_transfer', `Transfer "${fileName}" from ${sourceAgentId} to server`, sourceAgentId, socket.user.username);

      socket.emit('file:transfer:status', { transferId, status: 'reading', fileName });
      srcSocket.emit('file:download', { path: filePath });
      srcSocket.once('file:content:result', (data) => {
        if (!data.success) {
          socket.emit('file:transfer:status', { transferId, success: false, error: data.error || 'Failed to read from agent' });
          return;
        }
        socket.emit('file:transfer:status', { transferId, status: 'writing', fileName: data.name, size: data.size });
        const writeResult = localFs.writeFile(data.name, data.content, destPath);
        socket.emit('file:transfer:status', {
          transferId, success: writeResult.success, fileName: data.name,
          size: data.size, destPath: writeResult.path, error: writeResult.error,
        });
        if (writeResult.success) {
          socket.emit('local:file:list:result', localFs.listDirectory(destPath));
        }
      });
    });

    // ── Services ────────────────────────────────────────────
    socket.on('services:list', ({ agentId }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('services:list');
    });

    socket.on('service:action', ({ agentId, serviceName, action }) => {
      if (!hasRole(socket, 'operator')) return deny(socket, 'service:action');
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) {
        store.addEvent('service_action', `${socket.user.username} ${action} service ${serviceName}`, agentId, socket.user.username);
        agentSocket.emit('service:action', { serviceName, action });
      }
    });

    // ── Processes (Task Manager view) ───────────────────────
    socket.on('processes:list', ({ agentId, limit, requestId }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('processes:list', { limit, requestId });
      else socket.emit('processes:list:result', { agentId, success: false, error: 'Agent not connected', requestId });
    });

    socket.on('processes:kill', ({ agentId, pid, requestId }) => {
      if (!hasRole(socket, 'operator')) return deny(socket, 'processes:kill');
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) {
        const username = (socket.user && socket.user.username) || 'admin';
        store.addEvent('process_kill', `${username} killed PID ${pid}`, agentId, username);
        agentSocket.emit('processes:kill', { pid, requestId });
      } else {
        socket.emit('processes:kill:result', { agentId, success: false, error: 'Agent not connected', requestId });
      }
    });

    // ── Screen streaming ────────────────────────────────────
    socket.on('screen:stop', ({ agentId }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('screen:stop');
    });

    socket.on('screen:mouse', ({ agentId, x, y, type, button, wheel }) => {
      if (!hasRole(socket, 'operator')) return;
      const agentSocket = findAgentSocket(agentId);
      if (!agentSocket) {
        console.log(`[INPUT] Mouse dropped: agent ${agentId} not connected`);
        return;
      }
      console.log(type === 'wheel'
        ? `[INPUT] Forward wheel to ${agentId}: ${wheel > 0 ? 'up' : 'down'} @ ${x},${y}`
        : `[INPUT] Forward mouse to ${agentId}: ${type || 'click'} ${button || 'left'} @ ${x},${y}`);
      agentSocket.emit('screen:mouse', { x, y, type, button, wheel });
    });

    socket.on('screen:keyboard', ({ agentId, key, type }) => {
      if (!hasRole(socket, 'operator')) return;
      const agentSocket = findAgentSocket(agentId);
      if (!agentSocket) {
        console.log(`[INPUT] Keyboard dropped: agent ${agentId} not connected`);
        return;
      }
      console.log(`[INPUT] Forward keyboard to ${agentId}: ${type || 'press'} key=${key}`);
      agentSocket.emit('screen:keyboard', { key, type });
    });

    socket.on('screen:getMonitors', ({ agentId }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('screen:getMonitors');
    });

    socket.on('screen:start', ({ agentId, quality, fps, monitor }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) {
        store.addEvent('screen_start', 'Admin started screen viewing', agentId, socket.user.username);
        agentSocket.emit('screen:start', { quality: quality || 50, fps: fps || 2, monitor: monitor || 0 });
      }
    });

    // ── Chat ─────────────────────────────────────────────────
    socket.on('chat:send', ({ agentId, text }) => {
      const msg = store.addChatMessage(agentId, 'admin', socket.user.username, text);
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('chat:message', { text, senderName: socket.user.username });
      dashNsp.emit('chat:message', msg);
    });

    // ── Clipboard ───────────────────────────────────────────
    socket.on('clipboard:send', ({ agentId, text }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('clipboard:set', { text });
    });
    socket.on('clipboard:request', ({ agentId }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('clipboard:get');
    });

    // ── File upload to agent ────────────────────────────────
    socket.on('file:upload', ({ agentId, fileName, fileData, remotePath }) => {
      if (!hasRole(socket, 'operator')) return deny(socket, 'file:upload');
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) {
        store.addEvent('file_upload', `Admin uploaded file: ${fileName} to ${remotePath}`, agentId, socket.user.username);
        agentSocket.emit('file:upload', { fileName, fileData, remotePath });
      }
    });

    // ── File transfer between agents (SFTP-like) ────────────
    socket.on('file:transfer', ({ sourceAgentId, destAgentId, filePath, destPath, transferId }) => {
      if (!hasRole(socket, 'operator')) return deny(socket, 'file:transfer');
      const srcSocket = findAgentSocket(sourceAgentId);
      const dstSocket = findAgentSocket(destAgentId);
      if (!srcSocket) {
        socket.emit('file:transfer:status', { transferId, success: false, error: 'Source agent not connected' });
        return;
      }
      if (!dstSocket) {
        socket.emit('file:transfer:status', { transferId, success: false, error: 'Destination agent not connected' });
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop();
      store.addEvent('file_transfer', `Transfer "${fileName}" from ${sourceAgentId} to ${destAgentId}`, sourceAgentId, socket.user.username);

      socket.emit('file:transfer:status', { transferId, status: 'reading', fileName });
      srcSocket.emit('file:download', { path: filePath });

      const onContent = (data) => {
        if (!data.success) {
          socket.emit('file:transfer:status', { transferId, success: false, error: data.error || 'Failed to read source file' });
          return;
        }
        socket.emit('file:transfer:status', { transferId, status: 'writing', fileName, size: data.size });
        dstSocket.emit('file:upload', { fileName: data.name, fileData: data.content, remotePath: destPath });

        const onComplete = (result) => {
          socket.emit('file:transfer:status', {
            transferId, success: result.success, fileName: data.name,
            size: data.size, destPath: result.path, error: result.error,
          });
          dstSocket.off('file:transfer:complete', onComplete);
        };
        dstSocket.once('file:transfer:complete', onComplete);
      };
      srcSocket.once('file:content:result', onContent);
    });

    // ── Wake-on-LAN ─────────────────────────────────────────
    socket.on('wol:send', ({ macAddress, agentId: targetId }) => {
      try {
        const mac = macAddress.replace(/[:-]/g, '');
        const macBuffer = Buffer.from(mac, 'hex');
        const magicPacket = Buffer.alloc(102);
        for (let i = 0; i < 6; i++) magicPacket[i] = 0xff;
        for (let i = 0; i < 16; i++) macBuffer.copy(magicPacket, 6 + i * 6);

        const udpSocket = dgram.createSocket('udp4');
        udpSocket.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', () => udpSocket.close());
        udpSocket.setBroadcast(true);

        store.addEvent('wol_sent', `Wake-on-LAN sent to ${macAddress}`, targetId, socket.user.username);
        socket.emit('wol:result', { success: true, macAddress });
      } catch (error) {
        socket.emit('wol:result', { success: false, error: error.message });
      }
    });

    socket.on('ping:agent', ({ agentId }) => {
      const agentSocket = findAgentSocket(agentId);
      if (agentSocket) agentSocket.emit('ping:latency', { timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      console.log(`[Dashboard Disconnected] ${socket.user.username}`);
    });
  });
};
