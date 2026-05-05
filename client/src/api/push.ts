/**
 * Web Push helper — register / unregister the service worker and
 * sync the resulting PushSubscription with the server.
 *
 * All endpoints are auth-gated; pass the user's JWT.
 */
const API_BASE = '/api';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface PushStatus {
  enabled: boolean;
  deviceCount: number;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function getPushStatus(token: string): Promise<PushStatus> {
  const res = await fetch(`${API_BASE}/push/status`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch push status');
  return res.json();
}

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/push/vapid-public-key`);
  if (!res.ok) throw new Error('Failed to fetch VAPID public key');
  const j = (await res.json()) as { publicKey: string };
  return j.publicKey;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Ask the browser for permission, register the SW, subscribe to push
 * with VAPID and POST the subscription to the server. Idempotent —
 * if already subscribed, returns existing subscription.
 */
export async function enablePush(token: string): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error('This browser does not support Web Push');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');

  const reg = await ensureServiceWorker();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapid = await fetchVapidPublicKey();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }
  const res = await fetch(`${API_BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(`Server rejected subscription: ${res.status}`);
  return sub;
}

export async function disablePush(token: string): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(`${API_BASE}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  }
}

export async function sendTestPush(token: string): Promise<{ delivered: number; total: number; pruned: number }> {
  const res = await fetch(`${API_BASE}/push/test`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Test push failed: ${res.status} ${txt}`);
  }
  return res.json();
}
