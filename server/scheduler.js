/**
 * Cron-style scheduled bulk actions.
 *
 * Supports the standard 5-field cron expression (minute hour day-of-month
 * month day-of-week) with the following primitives in each field:
 *
 *   *           — match anything
 *   N           — exact integer
 *   N-M         — inclusive range
 *   N,M,P       — comma list
 *   * /N        — step from the field's min, every N
 *   N-M/K       — step within range
 *
 * Day-of-week 0 and 7 both mean Sunday. Day-of-month and day-of-week are
 * OR'd when both are restricted, matching crontab(5).
 *
 * The runner ticks once per minute aligned to the next :00, finds enabled
 * schedules whose cron matches the current local minute, and dispatches
 * them through `dispatchFn(schedule)` (which is the same fan-out the bulk
 * REST endpoint uses). Result is recorded back on the schedule so the UI
 * can show "last run X ago — N sent / M skipped".
 */

const FIELD_BOUNDS = [
  { min: 0, max: 59 },  // minute
  { min: 0, max: 23 },  // hour
  { min: 1, max: 31 },  // day-of-month
  { min: 1, max: 12 },  // month
  { min: 0, max: 7 },   // day-of-week (Sun=0 or 7)
];

function parseField(raw, idx) {
  const { min, max } = FIELD_BOUNDS[idx];
  const parts = String(raw).split(',').map((p) => p.trim());
  const set = new Set();

  for (const part of parts) {
    if (!part) throw new Error(`Empty token in field ${idx}`);
    let stepStr;
    let rangeStr = part;
    if (part.includes('/')) {
      const split = part.split('/');
      if (split.length !== 2 || split[0] === '' || split[1] === '') {
        throw new Error(`Invalid step syntax in field ${idx}: ${part}`);
      }
      [rangeStr, stepStr] = split;
    }
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error(`Invalid step in field ${idx}: ${part}`);
    }

    let lo;
    let hi;
    if (rangeStr === '*' || rangeStr === '') {
      lo = min;
      hi = max;
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-').map((s) => parseInt(s, 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`Invalid range in field ${idx}: ${part}`);
      }
      lo = a;
      hi = b;
    } else {
      const n = parseInt(rangeStr, 10);
      if (!Number.isFinite(n)) {
        throw new Error(`Invalid value in field ${idx}: ${part}`);
      }
      lo = n;
      // step-with-single is "every N starting at lo"
      hi = stepStr ? max : n;
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`Out-of-bounds value in field ${idx}: ${part} (allowed ${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

/**
 * Parse a 5-field cron expression. Returns a matcher function
 * (date) -> boolean. Throws on invalid syntax.
 */
function parseCron(expr) {
  if (typeof expr !== 'string') throw new Error('cron must be a string');
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('cron expression must have 5 fields: "minute hour dom month dow"');
  }
  const [minSet, hourSet, domSet, monthSet, dowSet] = fields.map(parseField);

  // Normalize Sunday=7 -> 0 in dow
  if (dowSet.has(7)) {
    dowSet.delete(7);
    dowSet.add(0);
  }

  // Crontab(5) DOM/DOW semantics: if both are restricted, an event
  // matches if EITHER does. If only one is restricted (the other is *
  // covering its full range), it must match.
  const fullDomSet = new Set();
  for (let i = FIELD_BOUNDS[2].min; i <= FIELD_BOUNDS[2].max; i++) fullDomSet.add(i);
  const fullDowSet = new Set([0, 1, 2, 3, 4, 5, 6]);
  const domRestricted = !setsEqual(domSet, fullDomSet);
  const dowRestricted = !setsEqual(dowSet, fullDowSet);

  return function matches(date) {
    if (!minSet.has(date.getMinutes())) return false;
    if (!hourSet.has(date.getHours())) return false;
    if (!monthSet.has(date.getMonth() + 1)) return false;

    const dom = domSet.has(date.getDate());
    const dow = dowSet.has(date.getDay());
    if (domRestricted && dowRestricted) return dom || dow;
    return dom && dow;
  };
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Validate a cron expression. Returns null on ok, error string on bad. */
function validateCron(expr) {
  try {
    parseCron(expr);
    return null;
  } catch (e) {
    return e.message;
  }
}

/**
 * Wire up the once-per-minute runner. `getSchedules` returns the live
 * array of schedules from the store. `dispatchFn(schedule)` performs
 * the action and returns `{ sent, skipped, error? }`.
 *
 * Returns a `stop()` function for tests / graceful shutdown.
 */
function startScheduler({ getSchedules, dispatchFn, log = console }) {
  // Cache parsed matchers keyed by cron string to avoid re-parsing every minute.
  const cache = new Map();
  const matcherFor = (cronExpr) => {
    let m = cache.get(cronExpr);
    if (!m) {
      try {
        m = parseCron(cronExpr);
      } catch {
        m = null; // sentinel: bad cron, skip silently
      }
      cache.set(cronExpr, m);
    }
    return m;
  };

  let timer = null;

  const tick = async () => {
    const now = new Date();
    // Snap to second 0 of the current minute so multiple ticks within
    // one minute don't double-fire.
    now.setSeconds(0, 0);

    const schedules = getSchedules();
    for (const s of schedules) {
      if (!s.enabled) continue;
      const m = matcherFor(s.cron);
      if (!m || !m(now)) continue;
      try {
        const result = await dispatchFn(s);
        log.log(
          `[Scheduler] Fired "${s.name}" (${s.id}) — sent=${result.sent || 0} ` +
            `skipped=${result.skipped || 0}${result.error ? ' err=' + result.error : ''}`,
        );
      } catch (err) {
        log.error(`[Scheduler] Dispatch failed for "${s.name}":`, err.message);
      }
    }
  };

  // Align next tick to the start of the next minute.
  const scheduleNext = () => {
    const now = Date.now();
    const ms = 60_000 - (now % 60_000);
    timer = setTimeout(async () => {
      try {
        await tick();
      } catch (e) {
        log.error('[Scheduler] tick error:', e.message);
      }
      scheduleNext();
    }, ms);
    if (timer.unref) timer.unref();
  };

  scheduleNext();
  log.log('[Scheduler] Started — ticking every minute');

  return {
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    /** For tests / "Run now" buttons. */
    runOnce: tick,
    /** For "Run now" against a single schedule (manual). */
    fire: (schedule) => dispatchFn(schedule),
    parseCron,
    validateCron,
  };
}

module.exports = { parseCron, validateCron, startScheduler };
