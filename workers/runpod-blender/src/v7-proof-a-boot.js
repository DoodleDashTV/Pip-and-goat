#!/usr/bin/env node
/**
 * Persistent V7 Proof A worker. File-shaped CMD so RunPod dockerArgs survive
 * bash -c / space-split. Never starts the 30-second showcase. Never times out.
 * Exits only on SIGTERM/SIGINT, fatal error, or authenticated shutdown.
 */
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');

const MARK_DIR = process.env.V7_MARK_DIR || '/tmp/v7-startup-markers';
const HEALTH_PORT = Number(process.env.V7_HEALTH_PORT || 18080);
const HEALTH_BIND = process.env.V7_HEALTH_BIND || '127.0.0.1';
const HEARTBEAT_MS = Math.max(250, Number(process.env.V7_HEARTBEAT_MS || 15000));
const IDENTITY_PATH = process.env.V7_IMAGE_IDENTITY_PATH || '/opt/ddp-worker/.image-identity.json';
const REQUIRED_MARKERS = [
  'BOOTSTRAP_ENTERED',
  'NODE_AVAILABLE',
  'IMAGE_PROCESS_STARTED',
  'NODE_ENTRY_STARTED',
  'WORKER_MODULE_LOADED',
  'WORKER_LISTENING',
  'WORKER_READY',
];

const state = {
  schema: 'TIVVLEJOY_V7_STARTUP_PROOF_V2',
  bootId: process.env.V7_BOOT_ID || randomUUID(),
  pid: process.pid,
  startedAtMs: Date.now(),
  startedAt: new Date().toISOString(),
  ready: false,
  listening: false,
  exiting: false,
  heartbeatCount: 0,
  heartbeatAt: null,
  heartbeatAtMs: 0,
  markers: {},
  shutdown: null,
};

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

function loadImageIdentity() {
  const fromFile = {};
  try {
    if (existsSync(IDENTITY_PATH)) Object.assign(fromFile, JSON.parse(readFileSync(IDENTITY_PATH, 'utf8')));
  } catch {
    // identity file is optional on local/dev
  }
  const digest = String(process.env.V7_IMAGE_DIGEST || fromFile.digest || '');
  const sourceSha = String(process.env.V7_SOURCE_SHA || fromFile.sourceSha || fromFile.sourceCommit || '');
  const parentDigest = String(fromFile.parentDigest || '');
  return {
    digest: digest || null,
    sourceSha: sourceSha || null,
    parentDigest: parentDigest || null,
    workerEntrypoint: 'v7-proof-a-boot.js',
    pid1: 'v7-pid1-bootstrap.sh',
  };
}

function ingestMarkerFile(stage) {
  try {
    const raw = JSON.parse(readFileSync(`${MARK_DIR}/${stage}.json`, 'utf8'));
    if (raw && raw.stage === stage) {
      state.markers[stage] = { stage, at: raw.at || new Date().toISOString(), via: 'file' };
    }
  } catch {
    // missing until bootstrap or mark() writes it
  }
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
  state.markers[stage] = { stage, at: payload.at, via: 'process' };
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

function proofPayload(url) {
  const identity = loadImageIdentity();
  for (const name of REQUIRED_MARKERS) ingestMarkerFile(name);
  return {
    schema: state.schema,
    ok: Boolean(state.ready && state.listening && !state.exiting),
    event: state.ready ? 'WORKER_READY' : 'WORKER_NOT_READY',
    url,
    pid: process.pid,
    bootId: state.bootId,
    uptimeMs: Date.now() - state.startedAtMs,
    startedAt: state.startedAt,
    imageDigest: identity.digest,
    sourceSha: identity.sourceSha,
    parentDigest: identity.parentDigest,
    workerEntrypoint: identity.workerEntrypoint,
    pid1: identity.pid1,
    markers: REQUIRED_MARKERS.map((name) => state.markers[name] || { stage: name, at: null, via: null }),
    heartbeatCount: state.heartbeatCount,
    heartbeatAt: state.heartbeatAt,
    heartbeatAtMs: state.heartbeatAtMs,
    restart: false,
    blenderInvoked: false,
    r2Invoked: false,
  };
}

function containsSecret(text) {
  return /R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|RUNPOD_API_KEY|AWS_SECRET_ACCESS_KEY|Bearer\s+[A-Za-z0-9._-]{8,}|ghp_[A-Za-z0-9]+/i.test(
    text,
  );
}

function startHealthServer() {
  const server = createServer((req, res) => {
    const path = String(req.url || '/').split('?')[0];
    const known = path === '/ready' || path === '/health' || path === '/startup-proof' || path === '/';
    if (!known) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ schema: state.schema, ok: false, event: 'NOT_FOUND' }));
      return;
    }
    const bodyObj = proofPayload(path);
    const body = JSON.stringify(bodyObj);
    if (containsSecret(body)) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ schema: state.schema, ok: false, event: 'SECRET_LEAK_BLOCKED' }));
      return;
    }
    const healthy = bodyObj.ok === true;
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(HEALTH_PORT, HEALTH_BIND, () => resolve(server));
  });
}

async function runPersistentWorker() {
  ingestMarkerFile('BOOTSTRAP_ENTERED');
  ingestMarkerFile('NODE_AVAILABLE');
  mark('WORKER_MODULE_LOADED', { persist: true, r2Skipped: true, blenderSkipped: true });
  const server = await startHealthServer();
  state.listening = true;
  mark('WORKER_LISTENING', { port: HEALTH_PORT, bind: HEALTH_BIND });
  state.ready = true;
  mark('WORKER_READY', { persist: true });
  writeFileSync(
    `${MARK_DIR}/READY.json`,
    `${JSON.stringify({ ok: true, port: HEALTH_PORT, bootId: state.bootId, at: new Date().toISOString() }, null, 2)}\n`,
  );
  const timer = setInterval(() => {
    if (state.exiting) return;
    state.heartbeatCount += 1;
    state.heartbeatAtMs = Date.now();
    state.heartbeatAt = new Date(state.heartbeatAtMs).toISOString();
    const heartbeat = {
      event: 'HEARTBEAT',
      beat: state.heartbeatCount,
      uptimeMs: Date.now() - state.startedAtMs,
      bootId: state.bootId,
      pid: process.pid,
    };
    writeFileSync(`${MARK_DIR}/HEARTBEAT.json`, `${JSON.stringify(heartbeat, null, 2)}\n`);
    log('HEARTBEAT', heartbeat);
  }, HEARTBEAT_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const stop = (signal, code) => {
    if (state.exiting) return;
    state.exiting = true;
    state.ready = false;
    state.shutdown = { signal: signal || null, code, at: new Date().toISOString() };
    clearInterval(timer);
    log('BOOTSTRAP_EXIT', { signal: signal || null, code, beats: state.heartbeatCount, bootId: state.bootId });
    try {
      server.close();
    } catch {
      // ignore
    }
    process.exit(code);
  };
  process.on('SIGTERM', () => stop('SIGTERM', 0));
  process.on('SIGINT', () => stop('SIGINT', 0));
  process.on('uncaughtException', (error) => {
    log('boot_failed', { message: String(error && error.message ? error.message : error) });
    stop('uncaughtException', 1);
  });
  await new Promise(() => {
    // Persist until a signal or fatal handler calls stop().
  });
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
  mkdirSync(MARK_DIR, { recursive: true });
  mark('IMAGE_PROCESS_STARTED');
  mark('NODE_ENTRY_STARTED', { argv0: process.argv[1] || null, version: process.version, bootId: state.bootId });
  if (process.env.PAID_EXECUTION_AUTHORIZED === 'true') {
    await runPaidBoot();
    return;
  }
  await runPersistentWorker();
}

if (require.main === module) {
  main().catch((error) => {
    log('boot_failed', { message: String(error && error.message ? error.message : error) });
    process.exitCode = 1;
    process.exit(1);
  });
}

module.exports = {
  mark,
  meminfo,
  redact,
  proofPayload,
  containsSecret,
  HEALTH_PORT,
  REQUIRED_MARKERS,
};
