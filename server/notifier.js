/**
 * Webhook notifier — fans out triggered alerts to user-configured channels.
 *
 * Supported types:
 *   - telegram : Bot API sendMessage (needs botToken + chatId)
 *   - discord  : webhook URL (Discord-style payload)
 *   - slack    : incoming webhook URL (text-only, also works for any tool that
 *                accepts {"text":"..."})
 *   - generic  : POST raw alert JSON to a user URL
 *
 * Each delivery's success/failure is recorded on the webhook's `lastDelivery`
 * field so admins can debug from the UI.
 */

const SEVERITY_RANK = { warning: 0, critical: 1 };

const FETCH_TIMEOUT_MS = 8_000;

function postJson(url, body, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      const text = await res.text().catch(() => '');
      return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
    })
    .finally(() => clearTimeout(timer));
}

function passesFilters(hook, alert) {
  const filters = hook.filters || {};
  if (filters.minSeverity) {
    const min = SEVERITY_RANK[filters.minSeverity] ?? 0;
    const cur = SEVERITY_RANK[alert.severity] ?? 0;
    if (cur < min) return false;
  }
  if (Array.isArray(filters.agentIds) && filters.agentIds.length > 0) {
    if (!filters.agentIds.includes(alert.agentId)) return false;
  }
  return true;
}

function severityEmoji(sev) {
  if (sev === 'critical') return '🔴';
  if (sev === 'warning') return '🟡';
  return '🔵';
}

function formatPlainText(alert) {
  const head = `${severityEmoji(alert.severity)} Nexus alert — ${alert.severity.toUpperCase()}`;
  return `${head}\n${alert.message}\nat ${alert.timestamp}`;
}

async function sendTelegram(hook, alert) {
  const { botToken, chatId } = hook.config || {};
  if (!botToken || !chatId) {
    return { ok: false, error: 'telegram channel needs botToken and chatId' };
  }
  const text = formatPlainText(alert);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const r = await postJson(url, { chat_id: chatId, text, disable_web_page_preview: true });
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}: ${r.body}` };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function sendDiscord(hook, alert) {
  const { url } = hook.config || {};
  if (!url) return { ok: false, error: 'discord channel needs url' };
  const payload = {
    username: 'Nexus',
    embeds: [
      {
        title: `${severityEmoji(alert.severity)} ${alert.severity.toUpperCase()} — ${alert.ruleName}`,
        description: alert.message,
        color: alert.severity === 'critical' ? 0xff3b30 : 0xffcc00,
        timestamp: alert.timestamp,
        fields: [
          { name: 'Agent', value: alert.agentHostname || alert.agentId, inline: true },
          { name: 'Metric', value: String(alert.metric).toUpperCase(), inline: true },
          { name: 'Value', value: `${alert.currentValue}% (threshold ${alert.threshold}%)`, inline: true },
        ],
      },
    ],
  };
  try {
    const r = await postJson(url, payload);
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}: ${r.body}` };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function sendSlack(hook, alert) {
  const { url } = hook.config || {};
  if (!url) return { ok: false, error: 'slack channel needs url' };
  try {
    const r = await postJson(url, { text: formatPlainText(alert) });
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}: ${r.body}` };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function sendGeneric(hook, alert) {
  const { url, headers } = hook.config || {};
  if (!url) return { ok: false, error: 'generic channel needs url' };
  try {
    const r = await postJson(url, { source: 'nexus', alert }, headers || {});
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}: ${r.body}` };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

const SENDERS = {
  telegram: sendTelegram,
  discord: sendDiscord,
  slack: sendSlack,
  generic: sendGeneric,
};

/**
 * Send the given alert to a single channel, regardless of filters/enabled state.
 * Used by the "Test" button.
 */
async function sendOne(hook, alert) {
  const sender = SENDERS[hook.type];
  if (!sender) return { ok: false, error: `unknown channel type: ${hook.type}` };
  return sender(hook, alert);
}

/**
 * Fan out the alert to every enabled channel that matches its filters.
 * Records the result on each channel's lastDelivery field via the store.
 */
function dispatchAlert(store, alert) {
  const hooks = store.getWebhooks();
  for (const hook of hooks) {
    if (!hook.enabled) continue;
    if (!passesFilters(hook, alert)) continue;
    sendOne(hook, alert)
      .then((res) => {
        if (res.ok) {
          console.log(`[Webhook] ${hook.type} "${hook.name}" delivered alert ${alert.id}`);
          store.setWebhookLastDelivery(hook.id, { ok: true });
        } else {
          console.warn(`[Webhook] ${hook.type} "${hook.name}" failed: ${res.error}`);
          store.setWebhookLastDelivery(hook.id, { ok: false, error: res.error });
        }
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        console.warn(`[Webhook] ${hook.type} "${hook.name}" threw: ${msg}`);
        store.setWebhookLastDelivery(hook.id, { ok: false, error: msg });
      });
  }
}

/**
 * Build a sample alert for the "Test" button so admins can verify their channel
 * config without waiting for a real threshold breach.
 */
function buildTestAlert() {
  return {
    id: 'test-' + Date.now(),
    ruleId: 'test',
    ruleName: 'Test alert',
    agentId: 'test-agent',
    agentHostname: 'nexus-test',
    metric: 'cpu',
    currentValue: 95,
    threshold: 90,
    message: 'Test webhook from Nexus — your channel is wired up correctly.',
    severity: 'critical',
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };
}

module.exports = {
  dispatchAlert,
  sendOne,
  buildTestAlert,
};
