#!/usr/bin/env node
/**
 * Still-only boot for V7 Proof A. File-shaped CMD so RunPod dockerArgs survive
 * bash -c / space-split. Never starts the 30-second showcase.
 */
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');

const MARK_DIR = '/tmp/v7-startup-markers';
const HEALTH_PORT = Number(process.env.V7_HEALTH_PORT || 18080);
const HEALTH_BIND = process.env.V7_HEALTH_BIND || '127.0.0.1';
const PROOF_SECONDS = Number(process.env.V7_STARTUP_PROOF_SECONDS || 180);

function log(event, detail) {
  const row = { ts: new Date().toISOString(), event, ...(detail || {}) };
  if (row.message) row.message = redact(String(row.message)).slice(0, 800);
  console.log(JSON.stringify(row));
}

function redact(text) {
  return String(text || '')
    .replace(/(R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|RUNPOD_API_KEY|AWS_SECRET_ACCESS_KEY)=[^\s]+/gi, '$1=REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer REDACTED');
}

function mark(stage, extra) {
  mkdirSync(MARK_DIR, { recursive: true });
  const payload = {
    schema: 'TIVVLEJOY_WORKER_STARTUP_MARKERS_V1',
    stage,
    at: new Date().toISOString(),
    ...(extra || {}),
  };
  writeFileSync(`${MARK_DIR}/${stage}.json`, `${JSON.stringify(payload, null, 2)}\n`);
  log(stage, extra);
  return payload;
}

function meminfo() {
  const row = {};
  for (const line of readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const [key, rest] = line.split(':');
    if (!key || !rest) continue;
    row[key] = Number(rest.trim().split(' ')[0]) * 1024;
  }
  return {
    memTotal: row.MemTotal || 0,
    memAvailable: row.MemAvailable || 0,
    swapTotal: row.SwapTotal || 0,
  };
}

function startHealthServer() {
  const server = createServer((req, res) => {
    const ok = req.url === '/ready' || req.url === '/health' || req.url === '/';
    const body = JSON.stringify({
      schema: 'TIVVLEJOY_V7_STARTUP_HEALTH_V1',
      ok,
      event: 'WORKER_READY',
      url: req.url,
      pid: process.pid,
    });
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(HEALTH_PORT, HEALTH_BIND, () => resolve(server));
  });
}

async function runStartupProof() {
  mark('WORKER_MODULE_LOADED', { proof: true, r2Skipped: true, blenderSkipped: true });
  const server = await startHealthServer();
  mark('WORKER_LISTENING', { port: HEALTH_PORT, bind: HEALTH_BIND });
  mark('WORKER_READY', { seconds: PROOF_SECONDS });
  writeFileSync(
    `${MARK_DIR}/READY.json`,
    `${JSON.stringify({ ok: true, port: HEALTH_PORT, at: new Date().toISOString() }, null, 2)}\n`,
  );
  let beats = 0;
  const started = Date.now();
  const timer = setInterval(() => {
    beats += 1;
    const heartbeat = { event: 'HEARTBEAT', beat: beats, uptimeMs: Date.now() - started };
    writeFileSync(`${MARK_DIR}/HEARTBEAT.json`, `${JSON.stringify(heartbeat, null, 2)}\n`);
    log('HEARTBEAT', heartbeat);
  }, 15000);
  const stop = (signal, code) => {
    clearInterval(timer);
    log('BOOTSTRAP_EXIT', { signal: signal || null, code, beats });
    try {
      server.close();
    } catch {
      // ignore
    }
    process.exit(code);
  };
  process.on('SIGTERM', () => stop('SIGTERM', 0));
  process.on('SIGINT', () => stop('SIGINT', 0));
  await new Promise((resolve) => setTimeout(resolve, PROOF_SECONDS * 1000));
  stop(null, 0);
}

async function runPaidBoot() {
  const r2 = require('./r2-client');
  mark('R2_CLIENT_STARTED');
  const ctx = r2.createR2Client(process.env);
  const prefix = String(process.env.V7_PROOF_A_PREFIX || '').replace(/^\/+|\/+$/g, '');
  if (!prefix) throw new Error('V7_PROOF_A_PREFIX missing');
  const mem = meminfo();
  if (mem.memTotal < 24 * 1024 * 1024 * 1024) {
    await r2.uploadBuffer(
      ctx,
      `${prefix}/status.json`,
      Buffer.from(
        `${JSON.stringify({ schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1', status: 'FAILED', code: 'SYSTEM_RAM_BELOW_24GIB', mem }, null, 2)}\n`,
      ),
      'application/json',
    );
    process.exitCode = 3;
    return;
  }
  mark('HOST_MEMORY_RECEIPT_WRITTEN', mem);
  await r2.uploadBuffer(
    ctx,
    `${prefix}/host-memory-receipt.json`,
    Buffer.from(`${JSON.stringify({ schema: 'TIVVLEJOY_HOST_MEMORY_RECEIPT_V1', ...mem }, null, 2)}\n`),
    'application/json',
  );
  mark('SOURCE_MANIFEST_FETCH_STARTED');
  await r2.downloadToFile(ctx, process.env.V7_ENTRY_KEY, '/tmp/v7-proof-a-entry.js');
  mark('SOURCE_MANIFEST_FETCH_COMPLETE');
  const run = spawnSync('node', ['/tmp/v7-proof-a-entry.js'], { stdio: 'inherit' });
  process.exit(run.status || 0);
}

async function main() {
  mark('IMAGE_PROCESS_STARTED');
  mark('NODE_ENTRY_STARTED', { argv0: process.argv[1] || null, version: process.version });
  if (process.env.V7_STARTUP_PROOF === '1' || process.env.V7_STARTUP_CANARY === '1') {
    await runStartupProof();
    return;
  }
  await runPaidBoot();
}

if (require.main === module) {
  main().catch((error) => {
    log('boot_failed', { message: String(error && error.message ? error.message : error) });
    process.exitCode = 1;
  });
}

module.exports = { mark, meminfo, redact, HEALTH_PORT };
