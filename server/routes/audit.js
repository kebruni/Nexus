/**
 * /api/audit — rich query layer over eventLog with filters, paging,
 * and a CSV export. Admin-only because audit entries reveal usernames.
 */

function parseQuery(q) {
  const types = []
    .concat(q.type || [])
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    type: types.length ? types : undefined,
    agentId: q.agentId || undefined,
    actor: q.actor || undefined,
    q: q.q || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
    limit: q.limit,
    offset: q.offset,
  };
}

module.exports = function registerAudit(app, { store, auth }) {
  const { authMiddleware, requireRole } = auth;

  app.get('/api/audit', authMiddleware, requireRole('admin'), (req, res) => {
    res.json(store.getEventsAdvanced(parseQuery(req.query)));
  });

  app.get('/api/audit/export.csv', authMiddleware, requireRole('admin'), (req, res) => {
    // Cap at 10k so a single click can pull the full retained window.
    const opts = parseQuery(req.query);
    opts.limit = 10000;
    opts.offset = 0;
    const { items } = store.getEventsAdvanced(opts);

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const lines = ['timestamp,type,actor,agentId,message'];
    for (const ev of items) {
      lines.push([escape(ev.timestamp), escape(ev.type), escape(ev.actor), escape(ev.agentId), escape(ev.message)].join(','));
    }
    // BOM so Excel opens UTF-8 cleanly.
    const body = '\uFEFF' + lines.join('\r\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${stamp}.csv"`);
    res.send(body);
  });
};
