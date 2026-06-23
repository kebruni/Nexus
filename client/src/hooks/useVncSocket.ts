/**
 * React hook for VNC WebSocket connections.
 *
 * Manages a binary WebSocket to the server's /vnc endpoint,
 * handling frame decoding, input encoding, and reconnection.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// Binary message types — must match server/vnc-proxy.js
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
} as const;

export interface MonitorInfo {
  id: number;
  name: string;
  index: number;
}

export interface VncStats {
  bandwidth: number;   // bytes per 2-second window
  fps: number;         // frames per 2-second window
  adaptiveQuality: number;
}

interface UseVncSocketOptions {
  agentId: string;
  onFrame: (blob: Blob) => void;
  onCursor?: (x: number, y: number) => void;
  onMonitors?: (monitors: MonitorInfo[]) => void;
  onStats?: (stats: VncStats) => void;
  onAgentReady?: () => void;
  onAgentGone?: () => void;
}

function parseMessage(
  buf: Uint8Array,
  callbacks: {
    onFrame: (blob: Blob) => void;
    onCursor?: (x: number, y: number) => void;
    onMonitors?: (monitors: MonitorInfo[]) => void;
    onStats?: (stats: VncStats) => void;
    onAgentReady?: () => void;
    onAgentGone?: () => void;
  },
  setAgentOnline: (v: boolean) => void,
) {
  const type = buf[0];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  switch (type) {
    case MSG.FRAME: {
      if (buf.length <= 5) return;
      const jpegData = buf.slice(5);
      const blob = new Blob([jpegData], { type: 'image/jpeg' });
      console.log(`[VNC] Frame received: ${blob.size} bytes`);
      callbacks.onFrame(blob);
      break;
    }
    case MSG.CURSOR: {
      if (buf.length < 5) return;
      const x = view.getUint16(1, true);
      const y = view.getUint16(3, true);
      callbacks.onCursor?.(x, y);
      break;
    }
    case MSG.MONITORS: {
      if (buf.length < 2) return;
      const count = buf[1];
      const monitors: MonitorInfo[] = [];
      let offset = 2;
      for (let i = 0; i < count && offset < buf.length; i++) {
        const id = buf[offset];
        const nameLen = buf[offset + 1];
        offset += 2;
        const name = new TextDecoder().decode(buf.slice(offset, offset + nameLen));
        offset += nameLen;
        monitors.push({ id, name, index: i });
      }
      callbacks.onMonitors?.(monitors);
      break;
    }
    case MSG.STATS: {
      if (buf.length < 7) return;
      const bandwidth = view.getUint32(1, true);
      const fps = view.getUint16(5, true);
      callbacks.onStats?.({ bandwidth, fps, adaptiveQuality: 0 });
      break;
    }
    case MSG.AGENT_READY:
      setAgentOnline(true);
      callbacks.onAgentReady?.();
      break;
    case MSG.AGENT_GONE:
      setAgentOnline(false);
      callbacks.onAgentGone?.();
      break;
  }
}

export function useVncSocket({
  agentId,
  onFrame,
  onCursor,
  onMonitors,
  onStats,
  onAgentReady,
  onAgentGone,
}: UseVncSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);

  // Stable callback refs so we always call the latest callback version
  const callbacksRef = useRef({ onFrame, onCursor, onMonitors, onStats, onAgentReady, onAgentGone });
  useEffect(() => {
    callbacksRef.current = { onFrame, onCursor, onMonitors, onStats, onAgentReady, onAgentGone };
  });

  // connectRef holds the connect function so scheduleReconnect can reference it
  const connectRef = useRef<() => void>(() => {});

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setAgentOnline(false);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current();
    }, 3000);
  }, []);

  const connect = useCallback(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (!token || !agentId) return;

    // Build WebSocket URL from current page origin
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${proto}//${host}/vnc?role=dashboard&agentId=${encodeURIComponent(agentId)}&token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.arrayBuffer();
      }
      if (!(data instanceof ArrayBuffer)) return;
      const buf = new Uint8Array(data);
      if (buf.length < 1) return;
      parseMessage(buf, callbacksRef.current, setAgentOnline);
    };

    ws.onclose = () => {
      setConnected(false);
      setAgentOnline(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [agentId, scheduleReconnect]);

  // Keep connectRef in sync
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Send start streaming command
  const startStream = useCallback((fps: number, quality: number, monitor: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const buf = new Uint8Array(4);
    buf[0] = MSG.START;
    buf[1] = fps;
    buf[2] = quality;
    buf[3] = monitor;
    ws.send(buf.buffer);
  }, []);

  // Send stop streaming command
  const stopStream = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const buf = new Uint8Array(1);
    buf[0] = MSG.STOP;
    ws.send(buf.buffer);
  }, []);

  // Send mouse event
  const sendMouse = useCallback((x: number, y: number, type: 'move' | 'click' | 'dblclick' | 'wheel', button: 'left' | 'right' | 'scroll', wheel: number = 0) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const buf = new ArrayBuffer(9);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    u8[0] = MSG.MOUSE;
    view.setUint16(1, x, true);
    view.setUint16(3, y, true);
    const typeMap: Record<string, number> = { move: 0, click: 1, dblclick: 2, wheel: 3 };
    u8[5] = typeMap[type] ?? 1;
    u8[6] = button === 'right' ? 1 : 0;
    view.setInt16(7, wheel, true);
    ws.send(buf);
  }, []);

  // Send keyboard event
  const sendKeyboard = useCallback((key: string, type: 'press' | 'release' = 'press') => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const keyBuf = new TextEncoder().encode(key);
    const buf = new Uint8Array(2 + keyBuf.length + 1);
    buf[0] = MSG.KEYBOARD;
    buf[1] = keyBuf.length;
    buf.set(keyBuf, 2);
    buf[2 + keyBuf.length] = type === 'press' ? 0 : 1;
    ws.send(buf.buffer);
  }, []);

  // Request monitor list
  const getMonitors = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const buf = new Uint8Array(1);
    buf[0] = MSG.GET_MONITORS;
    ws.send(buf.buffer);
  }, []);

  // Auto-connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    connected,
    agentOnline,
    startStream,
    stopStream,
    sendMouse,
    sendKeyboard,
    getMonitors,
    connect,
    disconnect,
  };
}
