#!/usr/bin/env node
/**
 * TivvleJoy scenery showcase cold-start marker + worker handoff.
 *
 * This file is baked into the thin scenery worker image. It performs no RunPod
 * mutations. As soon as the container process actually starts, it writes a
 * PROCESS_STARTED marker to the existing private R2 job status path, then
 * hands control to scenery-showcase.js.
 */
const r2 = require('./r2-client');

function strip(value) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function log(event, detail = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}

async function markProcessStarted() {
  const env = process.env;
  const jobId = strip(env.RENDER_JOB_ID);
  if (!jobId) {
    throw Object.assign(new Error('RENDER_JOB_ID is required before worker handoff'), { code: 'NO_JOB_ID' });
  }

  const ctx = r2.createR2Client(env);
  const startupKey = `jobs/${jobId}/startup-status.json`;
  const payload = {
    schema: 'TIVVLEJOY_SCENERY_SHOWCASE_STARTUP_V2',
    jobId,
    result: 'RUNNING',
    stage: 'PROCESS_STARTED',
    at: new Date().toISOString(),
  };

  await r2.uploadBuffer(
    ctx,
    startupKey,
    Buffer.from(`${JSON.stringify(payload, null, 2)}\n`),
    'application/json',
  );
  log('scenery_showcase_process_started', { jobId, stage: payload.stage });
}

markProcessStarted()
  .then(() => {
    // scenery-showcase.js owns all remaining validation, discovery, rendering,
    // encoding, upload/readback verification, and terminal status handling.
    require('./scenery-showcase.js');
  })
  .catch((error) => {
    log('scenery_showcase_process_start_failed', {
      code: error && error.code ? error.code : 'PROCESS_START_FAILED',
      message: error && error.message ? String(error.message).slice(0, 1000) : String(error),
    });
    process.exitCode = 1;
  });
