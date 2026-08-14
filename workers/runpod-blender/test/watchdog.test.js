'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeCostAwareMaxRuntime, StartupWatchdog, HARD_COST_CAP_USD } = require('../src/watchdog');

test('cost-aware sizing never allows worst-case spend above the hard cap', () => {
  for (const rate of [0.34, 0.69, 1.2, 2.5, 5]) {
    const sized = computeCostAwareMaxRuntime({ gpuHourlyRateUsd: rate });
    assert.ok(sized.worstCaseCostUsd <= HARD_COST_CAP_USD + 1e-6, `rate ${rate} worst-case ${sized.worstCaseCostUsd} exceeds cap`);
    assert.ok(sized.maxRuntimeMs > 0);
  }
});

test('higher GPU rate yields a smaller runtime budget', () => {
  const cheap = computeCostAwareMaxRuntime({ gpuHourlyRateUsd: 0.34 });
  const pricey = computeCostAwareMaxRuntime({ gpuHourlyRateUsd: 2.0 });
  assert.ok(pricey.maxRuntimeMinutes < cheap.maxRuntimeMinutes);
});

test('safety margin reduces the budget below the raw cap-derived budget', () => {
  const rate = 0.34;
  const full = (HARD_COST_CAP_USD / rate) * 60; // minutes at exactly the cap
  const sized = computeCostAwareMaxRuntime({ gpuHourlyRateUsd: rate, safetyMargin: 0.8 });
  assert.ok(sized.maxRuntimeMinutes <= full);
  assert.ok(sized.maxRuntimeMinutes >= full * 0.79);
});

test('manifest ceiling clamps below the cost budget when smaller', () => {
  const sized = computeCostAwareMaxRuntime({ gpuHourlyRateUsd: 0.1, manifestMaxRuntimeMinutes: 3 });
  assert.equal(sized.maxRuntimeMinutes, 3);
  assert.equal(sized.cappedBy, 'MANIFEST_LIMIT');
});

test('invalid/zero rate fails safe to a tiny budget', () => {
  for (const bad of [0, -1, NaN, undefined]) {
    const sized = computeCostAwareMaxRuntime({ gpuHourlyRateUsd: bad });
    assert.ok(sized.maxRuntimeMinutes <= 1);
    assert.equal(sized.cappedBy, 'UNKNOWN_RATE_FAILSAFE');
  }
});

test('StartupWatchdog fires onTimeout when milestone not reached', () => {
  let fired = null;
  let timerFn = null;
  const wd = new StartupWatchdog({
    startupTimeoutMs: 100,
    onTimeout: (info) => { fired = info; },
    setTimer: (ms, fn) => { timerFn = fn; return 't'; },
    clearTimer: () => {},
  });
  wd.start();
  wd.milestone('R2_CLIENT_CREATED');
  timerFn(); // simulate timeout firing
  assert.ok(fired);
  assert.equal(fired.lastMilestone, 'R2_CLIENT_CREATED');
  assert.equal(wd.didFire, true);
});

test('StartupWatchdog works with the REAL setTimeout (arg order regression)', async () => {
  let fired = null;
  const wd = new StartupWatchdog({ startupTimeoutMs: 30, onTimeout: (info) => { fired = info; } });
  wd.start(); // must not throw "callback must be a function"
  wd.milestone('R2_CLIENT_CREATED');
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(fired, 'watchdog should have fired via real timer');
  assert.equal(fired.lastMilestone, 'R2_CLIENT_CREATED');
});

test('StartupWatchdog reached() with real timers prevents firing', async () => {
  let fired = false;
  const wd = new StartupWatchdog({ startupTimeoutMs: 30, onTimeout: () => { fired = true; } });
  wd.start();
  wd.reached('RENDER_STARTED');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, false);
});

test('StartupWatchdog does not fire once reached() is called', () => {
  let fired = false;
  let cleared = false;
  let timerFn = null;
  const wd = new StartupWatchdog({
    startupTimeoutMs: 100,
    onTimeout: () => { fired = true; },
    setTimer: (ms, fn) => { timerFn = fn; return 't'; },
    clearTimer: () => { cleared = true; },
  });
  wd.start();
  wd.reached('RENDER_STARTED');
  timerFn(); // even if the timer somehow fires after clear, it must be a no-op
  assert.equal(fired, false);
  assert.equal(cleared, true);
});
