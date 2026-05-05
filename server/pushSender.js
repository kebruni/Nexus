/**
 * Web Push fan-out for triggered alerts.
 *
 * VAPID keys live in `.data/secrets.json` (auto-generated on first
 * boot, like JWT_SECRET / AGENT_SECRET). The same module exposes
 * `getVapidPublicKey()` so the dashboard can request it via the API
 * and pass it into `pushManager.subscribe()`.
 *
 * On 404 / 410 from the push service, the subscription is dead and
 * gets pruned from SQLite.
 */

const crypto = require('crypto');
const webPush = require('web-push');
const persistence = require('./persistence');

let secrets = persistence.loadSecrets() || {};

function ensureVapid() {
  if (secrets.vapidPublicKey && secrets.vapidPrivateKey) {
    return { publicKey: secrets.vapidPublicKey, privateKey: secrets.vapidPrivateKey, source: 'persisted' };
  }
  const generated = webPush.generateVAPIDKeys();
  secrets.vapidPublicKey = generated.publicKey;
  secrets.vapidPrivateKey = generated.privateKey;
  if (!secrets.vapidSubject) {
    // Spec says VAPID subject must be a mailto: or https: URL. We don't
    // know the operator's email — generate a synthetic one tied to the
    // server's machine-id. Push services accept this.
    const tag = crypto.randomBytes(8).toString('hex');
    secrets.vapidSubject = `mailto:nexus-${tag}@local`;
  }
  persistence.saveSecrets(secrets);
  return { publicKey: generated.publicKey, privateKey: generated.privateKey, source: 'generated' };
}

const vapid = ensureVapid();
webPush.setVapidDetails(secrets.vapidSubject, vapid.publicKey, vapid.privateKey);

console.log(`[Push] VAPID keys ${vapid.source} (subject ${secrets.vapidSubject})`);

function getVapidPublicKey() {
  return vapid.publicKey;
}

function severityEmoji(sev) {
  if (sev === 'critical') return '🔴';
  if (sev === 'warning') return '🟡';
  return '🔵';
}

function buildPayload(alert) {
  const title = `${severityEmoji(alert.severity)} Nexus alert — ${alert.severity.toUpperCase()}`;
  return JSON.stringify({
    title,
    body: alert.message,
    tag: `alert:${alert.id}`,
    timestamp: Date.now(),
    data: {
      alertId: alert.id,
      agentId: alert.agentId,
      url: alert.agentId ? `/agents/${alert.agentId}` : '/alerts',
    },
  });
}

/**
 * Send the given payload to a single subscription. Returns
 * `{ ok, status, expired }`. Callers can inspect `expired` to
 * know whether to prune the row.
 */
async function sendOne(sub, payload) {
  try {
    const res = await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload,
      { TTL: 60 }
    );
    return { ok: true, status: res.statusCode };
  } catch (err) {
    const status = err && err.statusCode;
    const expired = status === 404 || status === 410;
    return { ok: false, status: status || 0, expired, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Fan the alert out to every active subscription. Subscriptions that
 * the push service rejects as gone (404/410) are pruned from the DB.
 */
function dispatchAlert(store, alert) {
  const subs = store.getAllPushSubscriptions();
  if (subs.length === 0) return;
  const payload = buildPayload(alert);
  for (const sub of subs) {
    sendOne(sub, payload).then((res) => {
      if (res.ok) {
        store.touchPushSubscription(sub.endpoint);
      } else if (res.expired) {
        console.log(`[Push] Pruning expired subscription for user=${sub.userId} (status=${res.status})`);
        store.removePushSubscriptionByEndpoint(sub.endpoint);
      } else {
        console.warn(`[Push] sendOne failed (status=${res.status}): ${res.error}`);
      }
    });
  }
}

/**
 * Build a sample payload for the Settings → "Send test push" button.
 */
function buildTestPayload() {
  return JSON.stringify({
    title: '🔵 Nexus — test push',
    body: 'Browser notifications are wired up correctly.',
    tag: 'nexus:test',
    timestamp: Date.now(),
    data: { url: '/' },
  });
}

module.exports = {
  getVapidPublicKey,
  dispatchAlert,
  sendOne,
  buildTestPayload,
};
