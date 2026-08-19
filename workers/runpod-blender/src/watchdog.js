/**
 * Watchdogs for the Runpod GPU worker.
 *
 *  - StartupWatchdog: owns BOOT only (PROCESS_STARTED → healthGate →
 *    WORKER_READY). After WORKER_READY the timer must be cancelled via
 *    reached(). The single-shot runtime/cost guard owns the actual render
 *    job. A dead boot fires STARTUP_TIMEOUT so a paid GPU is not left idle.
 *
 *  - computeCostAwareMaxRuntime: sizes the render-runtime budget from the ACTUAL
 *    live GPU hourly rate against a hard USD cap (default $0.25) with a safety
 *    margin, and NEVER returns a budget whose worst-case spend exceeds the cap.
 */

const HARD_COST_CAP_USD = 0.25;

/**
 * Cost-aware runtime sizing.
 *
 * maxMinutes = (capUsd / hourlyRate) * 60 * safetyMargin, then clamped so the
 * worst-case spend at `hourlyRate` can never exceed `capUsd`, and further capped
 * by any manifest-provided maxRuntimeMinutes.
 *
 * @param {object} input
 * @param {number} input.gpuHourlyRateUsd  live hourly price of the pod's GPU
 * @param {number} [input.hardCapUsd=0.25] absolute USD ceiling for the job
 * @param {number} [input.safetyMargin=0.85] fraction of the cap-derived budget to use (0<m<=1)
 * @param {number} [input.manifestMaxRuntimeMinutes] optional manifest ceiling
 * @param {number} [input.absoluteMaxMinutes=180] hard upper bound regardless of price
 * @returns {{ maxRuntimeMinutes:number, maxRuntimeMs:number, worstCaseCostUsd:number,
 *            hardCapUsd:number, gpuHourlyRateUsd:number, cappedBy:string }}
 */
function computeCostAwareMaxRuntime(input) {
  const hardCapUsd = input.hardCapUsd ?? HARD_COST_CAP_USD;
  const safetyMargin = clamp(input.safetyMargin ?? 0.85, 0.05, 1);
  const absoluteMaxMinutes = input.absoluteMaxMinutes ?? 180;
  const rate = Number(input.gpuHourlyRateUsd);

  if (!Number.isFinite(rate) || rate <= 0) {
    // Unknown/invalid rate — fail safe to the smallest sensible budget.
    const minutes = Math.min(1, absoluteMaxMinutes);
    return {
      maxRuntimeMinutes: minutes,
      maxRuntimeMs: Math.round(minutes * 60_000),
      worstCaseCostUsd: 0,
      hardCapUsd,
      gpuHourlyRateUsd: Number.isFinite(rate) ? rate : 0,
      cappedBy: 'UNKNOWN_RATE_FAILSAFE',
    };
  }

  // Budget derived purely from the cap.
  const capMinutes = (hardCapUsd / rate) * 60;
  let minutes = capMinutes * safetyMargin;
  let cappedBy = 'COST_CAP';

  // Never exceed the cap even after rounding: worst-case spend must stay <= cap.
  const maxMinutesAtCap = (hardCapUsd / rate) * 60;
  if (minutes > maxMinutesAtCap) {
    minutes = maxMinutesAtCap;
    cappedBy = 'COST_CAP_STRICT';
  }

  // Clamp by manifest ceiling and absolute ceiling.
  if (Number.isFinite(input.manifestMaxRuntimeMinutes) && input.manifestMaxRuntimeMinutes > 0 && input.manifestMaxRuntimeMinutes < minutes) {
    minutes = input.manifestMaxRuntimeMinutes;
    cappedBy = 'MANIFEST_LIMIT';
  }
  if (minutes > absoluteMaxMinutes) {
    minutes = absoluteMaxMinutes;
    cappedBy = 'ABSOLUTE_MAX';
  }

  minutes = Math.max(0, minutes);
  const worstCaseCostUsd = Number(((minutes / 60) * rate).toFixed(4));

  return {
    maxRuntimeMinutes: Number(minutes.toFixed(4)),
    maxRuntimeMs: Math.round(minutes * 60_000),
    worstCaseCostUsd,
    hardCapUsd,
    gpuHourlyRateUsd: rate,
    cappedBy,
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * StartupWatchdog — fires onTimeout if `reached()` is not called before the
 * startup budget elapses. Cancel permanently at WORKER_READY. Do not leave
 * this timer armed during single-shot download/preflight/render/encode.
 */
class StartupWatchdog {
  /**
   * @param {object} opts
   * @param {number} [opts.startupTimeoutMs] budget to reach the milestone
   * @param {(info:{elapsedMs:number, lastMilestone:string|null})=>void} opts.onTimeout
   * @param {(ms:number,fn:()=>void)=>any} [opts.setTimer] injectable (tests)
   * @param {(t:any)=>void} [opts.clearTimer] injectable (tests)
   */
  constructor(opts = {}) {
    this.startupTimeoutMs = Number(opts.startupTimeoutMs) > 0 ? Number(opts.startupTimeoutMs) : 120_000;
    this.onTimeout = opts.onTimeout || (() => {});
    // Internal convention is setTimer(ms, fn); the real setTimeout is
    // setTimeout(fn, ms), so wrap it to match (tests inject the (ms, fn) form).
    this.setTimer = opts.setTimer || ((ms, fn) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer || ((t) => clearTimeout(t));
    this.startedAt = null;
    this.timer = null;
    this.fired = false;
    this.cleared = false;
    this.lastMilestone = null;
  }

  start() {
    this.startedAt = Date.now();
    this.timer = this.setTimer(this.startupTimeoutMs, () => {
      if (this.cleared || this.fired) return;
      this.fired = true;
      this.onTimeout({ elapsedMs: Date.now() - (this.startedAt || Date.now()), lastMilestone: this.lastMilestone });
    });
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
    return this;
  }

  /** Record progress; call with the milestone that was reached. */
  milestone(name) {
    this.lastMilestone = name;
  }

  /** The worker reached a meaningful bootstrap milestone — cancel the watchdog. */
  reached(name) {
    if (name) this.lastMilestone = name;
    this.cleared = true;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  }

  get didFire() {
    return this.fired;
  }
}

module.exports = { computeCostAwareMaxRuntime, StartupWatchdog, HARD_COST_CAP_USD };
