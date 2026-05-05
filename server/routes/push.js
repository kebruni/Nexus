/** /api/push/* — Web Push (browser notifications) endpoints.
 *
 *  Available to any authenticated user. Each user can subscribe
 *  multiple browsers / devices; the server fans alerts out to all of
 *  them.
 */
const pushSender = require('../pushSender');

module.exports = function registerPush(app, { store, auth }) {
  const { authMiddleware } = auth;

  // Public endpoint so the SPA can prime pushManager.subscribe() with
  // the right key. Returns the urlsafe-base64 VAPID public key.
  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: pushSender.getVapidPublicKey() });
  });

  app.get('/api/push/status', authMiddleware, (req, res) => {
    const count = store.countPushSubscriptionsForUser(req.user.username);
    res.json({ enabled: count > 0, deviceCount: count });
  });

  app.post('/api/push/subscribe', authMiddleware, (req, res) => {
    try {
      const id = store.addPushSubscription(
        req.user.username,
        req.body,
        req.headers['user-agent'] || null,
      );
      store.addEvent(
        'push_subscribed',
        `Push notifications enabled for ${req.user.username}`,
        null,
        req.user.username,
      );
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: err.message || 'invalid subscription' });
    }
  });

  app.post('/api/push/unsubscribe', authMiddleware, (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    let removed;
    if (endpoint) {
      removed = store.removePushSubscriptionByEndpoint(endpoint);
    } else {
      removed = store.removeAllPushSubscriptionsForUser(req.user.username);
    }
    if (removed > 0) {
      store.addEvent(
        'push_unsubscribed',
        `Push notifications disabled for ${req.user.username}`,
        null,
        req.user.username,
      );
    }
    res.json({ removed });
  });

  app.post('/api/push/test', authMiddleware, async (req, res) => {
    const subs = store.getPushSubscriptionsForUser(req.user.username);
    if (subs.length === 0) {
      return res.status(400).json({ error: 'no subscriptions for this user' });
    }
    const payload = pushSender.buildTestPayload();
    const results = await Promise.all(subs.map((s) => pushSender.sendOne(s, payload)));
    // Prune dead ones, count successes
    let okCount = 0;
    let prunedCount = 0;
    for (let i = 0; i < results.length; i += 1) {
      if (results[i].ok) {
        okCount += 1;
        store.touchPushSubscription(subs[i].endpoint);
      } else if (results[i].expired) {
        store.removePushSubscriptionByEndpoint(subs[i].endpoint);
        prunedCount += 1;
      }
    }
    res.json({ delivered: okCount, total: subs.length, pruned: prunedCount });
  });
};
