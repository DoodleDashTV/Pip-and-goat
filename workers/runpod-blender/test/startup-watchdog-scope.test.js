'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { StartupWatchdog, computeCostAwareMaxRuntime } = require('../src/watchdog');
const {
  applyHealthGateToStartupWatchdog,
  createAndStartStartupWatchdog,
  canWorkerSelfTerminate,
} = require('../src/worker');
const { buildRenderSubprocessEnvironment } = require('../src/child-env');

const workerSource = readFileSync(path.join(__dirname, '../src/worker.js'), 'utf8');
const singleShotSource = readFileSync(path.join(__dirname, '../src/single-shot.js'), 'utf8');

function scriptedWatchdog() {
  let timerFn = null;
  let cleared = false;
  const calls = [];
  const wd = new StartupWatchdog({
    startupTimeoutMs: 50,
    onTimeout: (info) => {
      calls.push({ op: 'timeout', info });
    },
    setTimer: (ms, fn) => {
      calls.push({ op: 'start', ms });
      timerFn = fn;
      return 'timer';
    },
    clearTimer: () => {
      cleared = true;
      calls.push({ op: 'clear' });
    },
  });
  return {
    wd,
    calls,
    fire() {
      if (typeof timerFn === 'function') timerFn();
    },
    wasCleared: () => cleared,
  };
}

describe('StartupWatchdog scope is BOOT only', () => {
  it('starts before healthGate and cancels with reached(WORKER_READY), not milestone', () => {
    const startedBeforeHealth = workerSource.indexOf('const startupWatchdog = createAndStartStartupWatchdog({ env, persist })');
    const healthIdx = workerSource.indexOf('const health = healthGate()');
    const applyIdx = workerSource.indexOf('const startup = applyHealthGateToStartupWatchdog(startupWatchdog, health)');
    const singleShotIdx = workerSource.indexOf('const result = await runSingleShot({ env, log })');
    assert.ok(startedBeforeHealth > 0 && startedBeforeHealth < healthIdx);
    assert.ok(applyIdx > healthIdx && applyIdx < singleShotIdx);
    assert.equal(workerSource.includes("startupWatchdog.milestone('WORKER_READY')"), false);
    assert.equal(workerSource.includes("startupWatchdog.reached('WORKER_READY')"), true);
    assert.equal(workerSource.includes("startupWatchdog.reached('SINGLE_SHOT_RETURNED')"), false);
  });

  it('successful healthGate reaches WORKER_READY and clears the timer before single-shot', () => {
    const scripted = scriptedWatchdog();
    scripted.wd.start();
    assert.equal(scripted.calls.some((item) => item.op === 'start'), true);
    const startup = applyHealthGateToStartupWatchdog(scripted.wd, { ok: true });
    assert.equal(startup.ok, true);
    assert.equal(startup.ready, true);
    assert.equal(startup.cancelled, true);
    assert.equal(startup.lastMilestone, 'WORKER_READY');
    assert.equal(scripted.wasCleared(), true);
    assert.equal(scripted.wd.timer, null);
    scripted.fire();
    assert.equal(scripted.wd.didFire, false);
  });

  it('cannot fire while single-shot is downloading, preflighting, rendering, encoding, uploading, or verifying', async () => {
    const phases = [
      'downloading assets',
      'running Blender preflight',
      'rendering',
      'encoding',
      'uploading',
      'verifying readback',
    ];
    let fired = false;
    const wd = new StartupWatchdog({
      startupTimeoutMs: 30,
      onTimeout: () => {
        fired = true;
      },
    });
    wd.start();
    const startup = applyHealthGateToStartupWatchdog(wd, { ok: true });
    assert.equal(startup.cancelled, true);
    for (const phase of phases) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      assert.equal(fired, false, `startup watchdog must stay cancelled during ${phase}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fired, false);
    assert.equal(wd.didFire, false);
  });

  it('healthGate failure still fails closed and cancels the timer', () => {
    const scripted = scriptedWatchdog();
    scripted.wd.start();
    const startup = applyHealthGateToStartupWatchdog(scripted.wd, {
      ok: false,
      classification: 'IMAGE_BOOT_FAILURE',
    });
    assert.equal(startup.ok, false);
    assert.equal(startup.ready, false);
    assert.equal(startup.lastMilestone, 'HEALTH_GATE_FAILED');
    assert.equal(scripted.wasCleared(), true);
    scripted.fire();
    assert.equal(scripted.wd.didFire, false);
  });

  it('a genuinely stalled startup before WORKER_READY still triggers STARTUP_TIMEOUT', async () => {
    const persisted = [];
    let exited = null;
    const wd = createAndStartStartupWatchdog({
      env: { STARTUP_WATCHDOG_MS: '20' },
      persist: async (classification, detail) => {
        persisted.push({ classification, detail });
      },
      logFn: () => {},
      terminate: async () => {},
      exitFn: (code) => {
        exited = code;
      },
    });
    wd.milestone('PROCESS_STARTED');
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(wd.didFire, true);
    assert.equal(persisted[0].classification, 'TIMEOUT');
    assert.equal(persisted[0].detail.kind, 'STARTUP_TIMEOUT');
    assert.equal(exited, 20);
  });

  it('single-shot runtime/cost guard remains active after startup cancellation', () => {
    assert.equal(singleShotSource.includes('computeCostAwareMaxRuntime'), true);
    assert.equal(singleShotSource.includes('checkBudget'), true);
    assert.equal(singleShotSource.includes("throw core.tagged(`Runtime limit exceeded before ${where}`, 'TIMEOUT')"), true);
    const sized = computeCostAwareMaxRuntime({
      gpuHourlyRateUsd: 0.74,
      hardCapUsd: 0.25,
      manifestMaxRuntimeMinutes: 20,
    });
    assert.ok(sized.maxRuntimeMs > 0);
    assert.ok(sized.worstCaseCostUsd <= 0.25 + 1e-6);
  });

  it('never injects launcher RUNPOD_API_KEY into Blender/FFmpeg child env', () => {
    const child = buildRenderSubprocessEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/worker',
      RUNPOD_API_KEY: 'FAKE_LAUNCHER_ACCOUNT_KEY',
      R2_SECRET_ACCESS_KEY: 'FAKE_R2_SECRET',
    });
    assert.equal('RUNPOD_API_KEY' in child, false);
    assert.equal(workerSource.includes('buildRenderSubprocessEnvironment'), true);
  });

  it('TivvleJoy paid jobs keep ALLOW_WORKER_SELF_TERMINATE false', () => {
    assert.equal(canWorkerSelfTerminate({ ALLOW_WORKER_SELF_TERMINATE: 'false' }), false);
    assert.equal(workerSource.includes("ALLOW_WORKER_SELF_TERMINATE is not false"), true);
  });
});
