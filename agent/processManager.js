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
    // First call to si.processes() always reports pcpu=0 because CPU usage
    // is computed as a delta between two snapshots. On a freshly-spawned
    // sample the deltas don't exist yet, so kick once to seed and then
    // wait briefly before taking the real measurement.
    if (!listProcesses._seeded) {
      try { await si.processes(); } catch (_e) { /* ignore — seed only */ }
      await new Promise((r) => setTimeout(r, 250));
      listProcesses._seeded = true;
    }
    const data = await si.processes();
    const list = (data.list || [])
      .map((p) => {
        // systeminformation field names changed across versions; accept both
        const rawCpu = (typeof p.cpu === 'number' ? p.cpu
          : typeof p.pcpu === 'number' ? p.pcpu
          : 0);
        const rawMem = (typeof p.mem === 'number' ? p.mem
          : typeof p.pmem === 'number' ? p.pmem
          : 0);
        const rawRssKb = (typeof p.memRss === 'number' ? p.memRss
          : typeof p.mem_rss === 'number' ? p.mem_rss
          : 0);
        return {
          pid: p.pid,
          parentPid: p.parentPid,
          name: p.name || '',
          cpu: Math.round(rawCpu * 10) / 10,
          mem: Math.round(rawMem * 10) / 10,
          memRssMb: rawRssKb ? Math.round(rawRssKb / 1024) : 0,
          user: p.user || '',
          state: p.state || '',
          started: p.started || '',
          command: (p.command || p.name || '').slice(0, 240),
        };
      })
      // Sort by CPU desc, then by absolute RSS desc (so userspace
      // processes win the tiebreaker on idle systems where every cpu is 0
      // and pmem rounds to 0). Pmem is kept as a final tiebreaker.
      .sort((a, b) => b.cpu - a.cpu || b.memRssMb - a.memRssMb || b.mem - a.mem)
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
