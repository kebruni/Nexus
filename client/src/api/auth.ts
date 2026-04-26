const API_BASE = 'http://localhost:3000/api';

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function verifyToken(token: string) {
  const res = await fetch(`${API_BASE}/auth/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export function getToken(): string | null {
  return localStorage.getItem('pc-hub-token');
}

export function setToken(token: string) {
  localStorage.setItem('pc-hub-token', token);
}

export function removeToken() {
  localStorage.removeItem('pc-hub-token');
}

export async function fetchAgents(token: string) {
  const res = await fetch(`${API_BASE}/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function fetchEvents(token: string, limit = 50, agentId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (agentId) params.set('agentId', agentId);
  const res = await fetch(`${API_BASE}/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}
