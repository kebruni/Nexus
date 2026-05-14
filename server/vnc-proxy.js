/**
 * VNC WebSocket Proxy.
 *
 * Replaces Socket.IO-based screen streaming with a dedicated binary
 * WebSocket channel. Agents and dashboard clients connect to the same
 * HTTP server via WebSocket upgrade on `/vnc`.
 *
 * Binary protocol (little-endian):
 *
 *   Agent → Server → Dashboard
 *   ─────────────────────────────────────────────────
 *   0x01  Frame       [u16 width][u16 height][JPEG bytes]
 *   0x02  Cursor      [u16 x][u16 y]
 *   0x03  Monitors    [u8 count][{u8 id, u8 nameLen, name}…]
 *   0x04  Stats       [u32 frameBytes][u16 fps]
 *
 *   Dashboard → Server → Agent
 *   ─────────────────────────────────────────────────
 *   0x10  Mouse       [u16 x][u16 y][u8 type][u8 button][i16 wheel]
 *   0x11  Keyboard    [u8 keyLen][key UTF-8][u8 type]
 *   0x12  Start       [u8 fps][u8 quality][u8 monitor]
 *   0x13  Stop        (no payload)
 *   0x14  GetMonitors (no payload)
 *
 *   Server → Dashboard (control)
 *   ─────────────────────────────────────────────────
 *   0xF0  AgentReady  (agent connected for this session)
 *   0xF1  AgentGone   (agent disconnected)
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

// Message types
const MSG = {
  // Agent → Dashboard
  FRAME:        0x01,
  CURSOR:       0x02,
  MONITORS:     0x03,
  STATS:        0x04,
  // Dashboard → Agent
  MOUSE:        0x10,
  KEYBOARD:     0x11,
  START:        0x12,
  STOP:         0x13,
  GET_MONITORS: 0x14,
  // Server → Dashboard control
  AGENT_READY:  0xF0,
  AGENT_GONE:   0xF1,
};

/**
 * Attach VNC WebSocket handling to an existing HTTP server.
 *
 * @param {http.Server} httpServer
 * @param {object} opts
 * @param {string} opts.jwtSecret
 * @param {string} opts.agentSecret
 * @param {Function} opts.verifyAgentToken - from auth module
 * @param {Function} opts.touchAgentToken  - from auth module
 */
function attachVncProxy(httpServer, { jwtSecret, agentSecret, verifyAgentToken, touchAgentToken }) {
  // Agent sockets keyed by agentId
  const agentSockets = new Map();
  // Dashboard sockets keyed by agentId (multiple viewers per agent)
  const dashboardSockets = new Map();

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const parsed = url.parse(request.url, true);
    if (!parsed.pathname || !parsed.pathname.startsWith('/vnc')) {
      return; // not for us — let other upgrade handlers (socket.io) handle it
    }

    const query = parsed.query;
    const role = query.role; // 'agent' or 'dashboard'

    if (role === 'agent') {
      const agentId = query.agentId;
      const agentKey = query.agentKey;
      if (!agentId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      // Authenticate agent: per-agent token first, then shared secret
      let authenticated = false;
      if (agentKey && verifyAgentToken) {
        const tokenInfo = verifyAgentToken(agentKey);
        if (tokenInfo) {
          authenticated = true;
          if (touchAgentToken) touchAgentToken(tokenInfo.id);
        }
      }
      if (!authenticated && agentKey === agentSecret) {
        authenticated = true;
      }
      if (!authenticated) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        handleAgentConnection(ws, agentId);
      });
    } else if (role === 'dashboard') {
      const token = query.token;
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      try {
        const decoded = jwt.verify(token, jwtSecret);
        const agentId = query.agentId;
        if (!agentId) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          handleDashboardConnection(ws, agentId, decoded);
        });
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    } else {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  });

  function handleAgentConnection(ws, agentId) {
    console.log(`[VNC] Agent connected: ${agentId}`);
    agentSockets.set(agentId, ws);

    // Notify any waiting dashboard clients
    const viewers = dashboardSockets.get(agentId);
    if (viewers) {
      const readyMsg = Buffer.alloc(1);
      readyMsg[0] = MSG.AGENT_READY;
      for (const v of viewers) {
        if (v.readyState === 1) v.send(readyMsg);
      }
    }

    ws.on('message', (data) => {
      if (!(data instanceof Buffer)) return;
      // Relay binary data from agent to all dashboard viewers for this agent
      const viewers = dashboardSockets.get(agentId);
      if (!viewers || viewers.length === 0) return;
      for (const v of viewers) {
        if (v.readyState === 1) {
          v.send(data);
        }
      }
    });

    ws.on('close', () => {
      console.log(`[VNC] Agent disconnected: ${agentId}`);
      if (agentSockets.get(agentId) === ws) {
        agentSockets.delete(agentId);
      }
      // Notify dashboard viewers
      const viewers = dashboardSockets.get(agentId);
      if (viewers) {
        const goneMsg = Buffer.alloc(1);
        goneMsg[0] = MSG.AGENT_GONE;
        for (const v of viewers) {
          if (v.readyState === 1) v.send(goneMsg);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[VNC] Agent ${agentId} error:`, err.message);
    });
  }

  function handleDashboardConnection(ws, agentId, user) {
    console.log(`[VNC] Dashboard viewer connected for agent ${agentId} (user: ${user.username})`);

    if (!dashboardSockets.has(agentId)) {
      dashboardSockets.set(agentId, []);
    }
    dashboardSockets.get(agentId).push(ws);

    // Tell client whether agent is already connected
    const agentWs = agentSockets.get(agentId);
    if (agentWs && agentWs.readyState === 1) {
      const readyMsg = Buffer.alloc(1);
      readyMsg[0] = MSG.AGENT_READY;
      ws.send(readyMsg);
    }

    ws.on('message', (data) => {
      if (!(data instanceof Buffer)) return;
      // Relay commands from dashboard to agent
      const agentWs = agentSockets.get(agentId);
      if (agentWs && agentWs.readyState === 1) {
        agentWs.send(data);
      }
    });

    ws.on('close', () => {
      console.log(`[VNC] Dashboard viewer disconnected for agent ${agentId}`);
      const viewers = dashboardSockets.get(agentId);
      if (viewers) {
        const idx = viewers.indexOf(ws);
        if (idx !== -1) viewers.splice(idx, 1);
        if (viewers.length === 0) dashboardSockets.delete(agentId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[VNC] Dashboard viewer error for ${agentId}:`, err.message);
    });
  }

  return { agentSockets, dashboardSockets, MSG };
}

module.exports = { attachVncProxy, MSG };
