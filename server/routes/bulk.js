/**
 * /api/bulk/command — fan a single action out to every online agent
 * in a target set (group or explicit ids). Shared with the scheduler
 * via orchestration.fanOutBulkAction.
 */
module.exports = function registerBulk(app, { auth, orchestration }) {
  const { authMiddleware, requireRole } = auth;
  const { fanOutBulkAction } = orchestration;

  app.post('/api/bulk/command', authMiddleware, requireRole('operator'), (req, res) => {
    const { action, groupName, agentIds, command } = req.body || {};
    const result = fanOutBulkAction({
      action, groupName, agentIds, command,
      actor: req.user.username,
      source: 'manual',
    });
    if (!result.ok) {
      const { status, error, allowed } = result;
      return res.status(status).json(allowed ? { error, allowed } : { error });
    }
    res.json({
      action: result.action,
      target: groupName ? { groupName } : { agentIds: (agentIds || []).slice() },
      dispatched: result.dispatched,
      skipped: result.skipped,
      sent: result.sent,
      total: result.total,
    });
  });
};
