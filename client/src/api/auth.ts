const API_BASE = '/api';

export type Role = 'viewer' | 'operator' | 'admin';
export interface CurrentUser {
  username: string;
  role: Role;
}

const USER_KEY = 'pc-hub-user';

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
  localStorage.removeItem(USER_KEY);
}

export function setCurrentUser(user: CurrentUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent('pc-hub-user-changed'));
}

export function getCurrentUser(): CurrentUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string' && typeof parsed.role === 'string') {
      return parsed as CurrentUser;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

export function hasRole(min: Role, user: CurrentUser | null = getCurrentUser()): boolean {
  if (!user) return false;
  return (ROLE_RANK[user.role] ?? -1) >= ROLE_RANK[min];
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
