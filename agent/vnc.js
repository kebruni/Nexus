/**
 * VNC WebSocket module for the Nexus agent.
 *
 * Replaces Socket.IO-based screen streaming with a dedicated binary
 * WebSocket connection. Frames are sent as raw JPEG bytes (no base64),
 * cutting bandwidth by ~33% and reducing CPU overhead.
 *
 * Features:
 *  - Adaptive quality: automatically adjusts JPEG quality based on
 *    measured frame send time, keeping latency low on slow links.
 *  - Delta detection: skips sending frames when the screen hasn't
 *    changed (compares JPEG payload hash).
 *  - Reconnection: transparently reconnects to the server.
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const config = require('./config');
const { captureScreen, simulateMouse, simulateKeyboard, listMonitors } = require('./screenCapture');

// Binary message types — must match server/vnc-proxy.js & client
const MSG = {
  FRAME:        0x01,
  CURSOR:       0x02,
  MONITORS:     0x03,
  STATS:        0x04,
  MOUSE:        0x10,
  KEYBOARD:     0x11,
  START:        0x12,
  STOP:         0x13,
  GET_MONITORS: 0x14,
};

let ws = null;
let streaming = false;
let streamTimer = null;
let reconnectTimer = null;
let currentFps = 2;
let currentQuality = 50;
let currentMonitor = 0;
let lastFrameHash = '';
let adaptiveQuality = 50;
let frameBytesSent = 0;
let framesPerSecond = 0;
let frameCounter = 0;
let statsInterval = null;

const MAX_FPS = 5;
const MIN_QUALITY = 15;
const MAX_QUALITY = 80;
// Target: each frame should be sent within this budget (ms)
const TARGET_SEND_TIME = 200;

/**
 * Connect to the VNC WebSocket endpoint on the Nexus server.
 */
function connect(agentId, agentKey, serverHttpUrl = config.SERVER_URL) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const serverUrl = serverHttpUrl.replace(/^http/, 'ws');
  const vncUrl = `${serverUrl}/vnc?role=agent&agentId=${encodeURIComponent(agentId)}&agentKey=${encodeURIComponent(agentKey)}`;

  console.log(`  [VNC] Connecting to ${serverHttpUrl}/vnc ...`);

  ws = new WebSocket(vncUrl, {
    perMessageDeflate: false,
    maxPayload: 16 * 1024 * 1024,
  });

  ws.binaryType = 'nodebuffer';
  const socket = ws;

  ws.on('open', () => {
    console.log('  [VNC] WebSocket connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  ws.on('message', (data) => {
    if (!(data instanceof Buffer) || data.length < 1) return;
    handleMessage(data);
  });

  ws.on('close', () => {
    console.log('  [VNC] WebSocket closed');
    stopStream();
    if (socket.manualClose) {
      return;
    }
    scheduleReconnect(agentId, agentKey, serverHttpUrl);
  });

  ws.on('error', (err) => {
    console.error('  [VNC] WebSocket error:', err.message);
  });
}

function scheduleReconnect(agentId, agentKey, serverHttpUrl) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(agentId, agentKey, serverHttpUrl);
  }, 5000);
}

/**
 * Handle incoming binary messages from the server (dashboard commands).
 */
function handleMessage(buf) {
  const type = buf[0];

  switch (type) {
    case MSG.START: {
      const fps = buf.length > 1 ? buf[1] : 2;
      const quality = buf.length > 2 ? buf[2] : 50;
      const monitor = buf.length > 3 ? buf[3] : 0;
      console.log(`  [VNC] Start streaming (fps=${fps}, quality=${quality}, monitor=${monitor})`);
      startStream(fps, quality, monitor);
      break;
    }
    case MSG.STOP:
      console.log('  [VNC] Stop streaming');
      stopStream();
      break;
    case MSG.MOUSE: {
      if (buf.length < 9) return;
      const x = buf.readUInt16LE(1);
      const y = buf.readUInt16LE(3);
      const mouseType = buf[5];
      const button = buf[6];
      const wheel = buf.readInt16LE(7);
      const typeStr = ['move', 'click', 'dblclick', 'wheel'][mouseType] || 'click';
      const buttonStr = button === 1 ? 'right' : 'left';
      simulateMouse(x, y, typeStr, buttonStr, wheel);
      break;
    }
    case MSG.KEYBOARD: {
      if (buf.length < 3) return;
      const keyLen = buf[1];
      if (buf.length < 2 + keyLen + 1) return;
      const key = buf.slice(2, 2 + keyLen).toString('utf-8');
      const kbType = buf[2 + keyLen];
      const kbTypeStr = kbType === 0 ? 'press' : 'release';
      simulateKeyboard(key, kbTypeStr);
      break;
    }
    case MSG.GET_MONITORS:
      sendMonitorList();
      break;
    default:
      break;
  }
}

/**
 * Start capturing and streaming screen frames.
 */
function startStream(fps, quality, monitor) {
  stopStream();
  streaming = true;
  currentFps = Math.min(Math.max(fps || 2, 1), MAX_FPS);
  currentQuality = Math.min(Math.max(quality || 50, MIN_QUALITY), MAX_QUALITY);
  adaptiveQuality = currentQuality;
  currentMonitor = monitor || 0;
  lastFrameHash = '';
  frameBytesSent = 0;
  frameCounter = 0;

  const interval = Math.max(200, Math.round(1000 / currentFps));

  const loop = async () => {
    if (!streaming) return;
    const start = Date.now();

    try {
      const frame = await captureScreen(adaptiveQuality, currentMonitor);
      if (frame.success && streaming && ws && ws.readyState === WebSocket.OPEN) {
        const jpegBuf = Buffer.from(frame.image, 'base64');

        // Delta detection: skip if frame is identical
        const hash = crypto.createHash('md5').update(jpegBuf).digest('hex');
        if (hash !== lastFrameHash) {
          lastFrameHash = hash;
          sendFrame(jpegBuf, frame.timestamp);
          frameBytesSent += jpegBuf.length;
          frameCounter++;

          // Adaptive quality: adjust based on frame send time
          const sendTime = Date.now() - start;
          if (sendTime > TARGET_SEND_TIME && adaptiveQuality > MIN_QUALITY) {
            adaptiveQuality = Math.max(MIN_QUALITY, adaptiveQuality - 3);
          } else if (sendTime < TARGET_SEND_TIME / 2 && adaptiveQuality < currentQuality) {
            adaptiveQuality = Math.min(currentQuality, adaptiveQuality + 2);
          }
        }
      }
    } catch (err) {
      console.error('  [VNC] Frame capture error:', err.message);
    }

    if (streaming) {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, interval - elapsed);
      streamTimer = setTimeout(loop, delay);
    }
  };

  loop();

  // Stats reporting every 2 seconds
  statsInterval = setInterval(() => {
    if (!streaming || !ws || ws.readyState !== WebSocket.OPEN) return;
    framesPerSecond = frameCounter;
    frameCounter = 0;
    sendStats(frameBytesSent, framesPerSecond);
    frameBytesSent = 0;
  }, 2000);

  console.log(`  [VNC] Streaming at ${currentFps} FPS, quality ${currentQuality}, monitor ${currentMonitor}`);
}

function stopStream() {
  streaming = false;
  if (streamTimer) {
    clearTimeout(streamTimer);
    streamTimer = null;
  }
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  lastFrameHash = '';
}

/**
 * Send a binary frame message.
 * Format: [0x01][u16 width][u16 height][JPEG bytes]
 *
 * Width and height are not known from the JPEG alone without parsing the
 * SOF marker, so we send 0 and let the client derive dimensions from the
 * decoded image. This keeps the fast path simple.
 */
function sendFrame(jpegBuf) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const header = Buffer.alloc(5);
  header[0] = MSG.FRAME;
  header.writeUInt16LE(0, 1); // width — derived client-side
  header.writeUInt16LE(0, 3); // height — derived client-side
  const msg = Buffer.concat([header, jpegBuf]);
  ws.send(msg);
}

/**
 * Send monitor list.
 */
async function sendMonitorList() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const monitors = await listMonitors();
    const parts = [Buffer.alloc(2)];
    parts[0][0] = MSG.MONITORS;
    parts[0][1] = monitors.length;
    for (const m of monitors) {
      const nameBuf = Buffer.from(m.name || `Display ${m.index + 1}`, 'utf-8');
      const entry = Buffer.alloc(2 + nameBuf.length);
      entry[0] = m.id != null ? m.id : m.index;
      entry[1] = nameBuf.length;
      nameBuf.copy(entry, 2);
      parts.push(entry);
    }
    ws.send(Buffer.concat(parts));
  } catch (err) {
    console.error('  [VNC] Monitor list error:', err.message);
  }
}

/**
 * Send stats message.
 */
function sendStats(totalBytes, fps) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    console.log(`  [VNC] sendStats: bytes=${totalBytes}, fps=${fps}`);
  } catch (e) {}
  const buf = Buffer.alloc(7);
  buf[0] = MSG.STATS;
  buf.writeUInt32LE(totalBytes, 1);
  buf.writeUInt16LE(fps, 5);
  ws.send(buf);
}

/**
 * Disconnect and clean up.
 */
function disconnect() {
  stopStream();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.manualClose = true;
    ws.close();
    ws = null;
  }
}

module.exports = { connect, disconnect };
