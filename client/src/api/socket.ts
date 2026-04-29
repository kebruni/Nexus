import { io, Socket } from 'socket.io-client';

// Empty origin → socket.io connects to the page origin, which is proxied to the
// backend in dev (vite.config.ts) and served from the same host in production.
const BACKEND_ORIGIN = '';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(`${BACKEND_ORIGIN}/dashboard`, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    reconnectionAttempts: Infinity,
    timeout: 20000,
    transports: ['polling', 'websocket'],
    upgrade: true,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to dashboard namespace');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
