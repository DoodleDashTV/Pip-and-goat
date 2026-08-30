#!/usr/bin/env node
/**
 * Still-only boot for V7 Proof A. Baked into future worker images.
 * Writes startup markers before any large download or Blender.
 * Does not start the 30-second showcase.
 */
const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');

const MARK_DIR = '/tmp/v7-startup-markers';

function log(event, detail) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...(detail || {}) }));
}

function mark(stage, extra) {
  mkdirSync(MARK_DIR, { recursive: true });
  const payload = { schema: 'TIVVLEJOY_WORKER_STARTUP_MARKERS_V1', stage, at: new Date().toISOString(), ...(extra || {}) };
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

async function main() {
  mark('IMAGE_PROCESS_STARTED');
  mark('NODE_ENTRY_STARTED', { argv0: process.argv[1] || null });

  if (process.env.V7_STARTUP_CANARY === '1') {
    mark('R2_CLIENT_STARTED', { canary: true, r2Skipped: true });
    const blender = spawnSync('blender', ['--version'], { encoding: 'utf8', timeout: 20000 });
    const line = String(blender.stdout || '').split('\n')[0] || '';
    const version = (line.match(/Blender\s+(\d+\.\d+\.\d+)/) || [])[1] || null;
    writeFileSync(
      `${MARK_DIR}/CANARY.json`,
      `${JSON.stringify({ schema: 'TIVVLEJOY_WORKER_STARTUP_CANARY_V1', blenderVersion: version, mem: meminfo(), ok: version === '4.2.2' }, null, 2)}\n`,
    );
    if (version !== '4.2.2') process.exitCode = 2;
    return;
  }

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
      Buffer.from(`${JSON.stringify({ schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1', status: 'FAILED', code: 'SYSTEM_RAM_BELOW_24GIB', mem }, null, 2)}\n`),
      'application/json',
    );
    process.exitCode = 3;
    return;
  }
  mark('HOST_MEMORY_RECEIPT_WRITTEN', mem);
  await r2.uploadBuffer(ctx, `${prefix}/host-memory-receipt.json`, Buffer.from(`${JSON.stringify({ schema: 'TIVVLEJOY_HOST_MEMORY_RECEIPT_V1', ...mem }, null, 2)}\n`), 'application/json');
  mark('SOURCE_MANIFEST_FETCH_STARTED');
  await r2.downloadToFile(ctx, process.env.V7_ENTRY_KEY, '/tmp/v7-proof-a-entry.js');
  mark('SOURCE_MANIFEST_FETCH_COMPLETE');
  const run = spawnSync('node', ['/tmp/v7-proof-a-entry.js'], { stdio: 'inherit' });
  process.exit(run.status || 0);
}

if (require.main === module) {
  main().catch((error) => {
    log('boot_failed', { message: String(error && error.message ? error.message : error).slice(0, 800) });
    process.exitCode = 1;
  });
}

module.exports = { mark, meminfo };
