/**
 * Process listing + termination for the dashboard's task-manager view.
 * Cross-platform via systeminformation; kill is native Node `process.kill`.
 */

const si = require('systeminformation');

/**
 * Return a normalised process snapshot for the dashboard.
 * Limit defaults to 200 to keep the wire payload small.
 */
async function listProcesses({ limit = 200 } = {}) {
  try {
    const data = await si.processes();
    const list = (data.list || [])
      .map((p) => ({
        pid: p.pid,
        parentPid: p.parentPid,
        name: p.name || '',
        cpu: typeof p.pcpu === 'number' ? Math.round(p.pcpu * 10) / 10 : 0,
        mem: typeof p.pmem === 'number' ? Math.round(p.pmem * 10) / 10 : 0,
        memRssMb: p.mem_rss ? Math.round(p.mem_rss / 1024) : 0,
        user: p.user || '',
        state: p.state || '',
        started: p.started || '',
        command: (p.command || p.name || '').slice(0, 240),
      }))
      // Sort by CPU desc, then memory desc — UI can re-sort, this is just a sane default
      .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
      .slice(0, limit);

    return {
      success: true,
      summary: {
        all: data.all || list.length,
        running: data.running || 0,
        blocked: data.blocked || 0,
        sleeping: data.sleeping || 0,
        unknown: data.unknown || 0,
      },
      list,
    };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Kill a single process by pid. Refuses to kill the agent itself.
 */
function killProcess(pid, { signal = 'SIGTERM' } = {}) {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return { success: false, error: 'invalid pid' };
  }
  if (numeric === process.pid) {
    return { success: false, error: 'refusing to kill the agent process' };
  }
  try {
    process.kill(numeric, signal);
    return { success: true, pid: numeric, signal };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { listProcesses, killProcess };
