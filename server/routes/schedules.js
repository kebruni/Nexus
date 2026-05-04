/**
 * /api/schedules/* — cron-style task scheduler. Each schedule fires
 * the same fan-out as /api/bulk/command on the minute.
 */
const { validateCron } = require('../scheduler');
const { BULK_ACTIONS } = require('../lib/orchestration');

function validatePayload(body, partial = false) {
  if (!body || typeof body !== 'object') return 'Body required';
  if (!partial || 'name' in body) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 1) {
      return 'name is required';
    }
  }
  if (!partial || 'cron' in body) {
    const err = validateCron(body.cron);
    if (err) return `cron: ${err}`;
  }
  if (!partial || 'action' in body) {
    if (!BULK_ACTIONS.has(body.action)) {
      return `action must be one of ${Array.from(BULK_ACTIONS).join(', ')}`;
    }
    if (body.action === 'execute' && (!body.command || typeof body.command !== 'string')) {
      return 'command is required when action=execute';
    }
  }
  if (!partial || 'target' in body) {
    if (!body.target || typeof body.target !== 'object') return 'target is required';
    if (body.target.kind === 'group') {
      if (!body.target.value || typeof body.target.value !== 'string') {
        return 'target.value (group name) is required';
      }
    } else if (body.target.kind === 'agentIds') {
      if (!Array.isArray(body.target.value) || !body.target.value.length) {
        return 'target.value must be a non-empty array of agent IDs';
      }
    } else {
      return 'target.kind must be "group" or "agentIds"';
    }
  }
  return null;
}

module.exports = function registerSchedules(app, { store, auth, orchestration }) {
  const { authMiddleware, requireRole } = auth;
  const { dispatchSchedule } = orchestration;

  app.get('/api/schedules', authMiddleware, (_req, res) => {
    res.json({ schedules: store.getSchedules(), actions: Array.from(BULK_ACTIONS) });
  });

  app.post('/api/schedules', authMiddleware, requireRole('operator'), (req, res) => {
    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    const sched = store.addSchedule({
      name: req.body.name.trim(),
      cron: req.body.cron.trim(),
      action: req.body.action,
      command: req.body.command || null,
      target: req.body.target,
      enabled: req.body.enabled !== false,
      createdBy: req.user.username,
    });
    store.addEvent('schedule_created', `Schedule "${sched.name}" created`, null, req.user.username);
    res.status(201).json(sched);
  });

  app.put('/api/schedules/:id', authMiddleware, requireRole('operator'), (req, res) => {
    const existing = store.getSchedule(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    const err = validatePayload({ ...existing, ...req.body }, false);
    if (err) return res.status(400).json({ error: err });
    const updated = store.updateSchedule(req.params.id, req.body);
    store.addEvent('schedule_updated', `Schedule "${updated.name}" updated`, null, req.user.username);
    res.json(updated);
  });

  app.delete('/api/schedules/:id', authMiddleware, requireRole('operator'), (req, res) => {
    const existing = store.getSchedule(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    store.deleteSchedule(req.params.id);
    store.addEvent('schedule_deleted', `Schedule "${existing.name}" deleted`, null, req.user.username);
    res.json({ success: true });
  });

  app.patch('/api/schedules/:id/toggle', authMiddleware, requireRole('operator'), (req, res) => {
    const existing = store.getSchedule(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    const updated = store.updateSchedule(req.params.id, { enabled: !existing.enabled });
    store.addEvent(
      updated.enabled ? 'schedule_enabled' : 'schedule_disabled',
      `Schedule "${updated.name}" ${updated.enabled ? 'enabled' : 'disabled'}`,
      null,
      req.user.username,
    );
    res.json(updated);
  });

  app.post('/api/schedules/:id/run-now', authMiddleware, requireRole('operator'), (req, res) => {
    const existing = store.getSchedule(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    store.addEvent('schedule_run_now', `Schedule "${existing.name}" run on demand`, null, req.user.username);
    const result = dispatchSchedule(existing);
    res.json({ schedule: store.getSchedule(req.params.id), result });
  });
};
