#!/usr/bin/env node
/**
 * Still-only V7 Proof A worker entry. Never starts the 30-second showcase.
 * One render. Upload. Exit. No RunPod mutations.
 */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } = require('node:fs');
const { dirname } = require('node:path');

const r2 = require('/opt/ddp-worker/src/r2-client');

const EXPECTED_H8 = 'c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e';
const EXPECTED_SOURCE = '2c747a306f1f8a3031155d3a266cc56b62e91966431db54e67c36f772c58c20c';
const OUT_DIR = '/tmp/v7-proof-a-out';
const SCRIPT_DIR = '/tmp/v7-scenery-scripts/scenery';

function log(event, detail = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function meminfo() {
  const text = readFileSync('/proc/meminfo', 'utf8');
  const row = {};
  for (const line of text.split('\n')) {
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

function nvidia() {
  const result = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,memory.used', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 15000 },
  );
  if (result.status !== 0) return { ok: false, error: String(result.stderr || '').slice(0, 300) };
  const parts = String(result.stdout || '')
    .trim()
    .split(',')
    .map((p) => p.trim());
  return {
    ok: true,
    name: parts[0],
    vramTotalMiB: Number(parts[1]),
    vramUsedMiB: Number(parts[2]),
  };
}

function blenderVersion() {
  const result = spawnSync('blender', ['--version'], { encoding: 'utf8', timeout: 20000 });
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = text.match(/Blender\s+(\d+\.\d+\.\d+)/);
  const raw = text.split('\n').find((line) => line.includes('Blender')) || '';
  return { raw: raw.trim(), version: match ? match[1] : null };
}

async function uploadJson(ctx, key, payload) {
  await r2.uploadBuffer(ctx, key, Buffer.from(`${JSON.stringify(payload, null, 2)}\n`), 'application/json');
}

const MARKERS = [];
async function mark(ctx, prefix, stage, extra = {}) {
  const row = { schema: 'TIVVLEJOY_WORKER_STARTUP_MARKERS_V1', stage, ts: new Date().toISOString(), ...extra };
  MARKERS.push(row);
  log(stage, extra);
  if (ctx && prefix) {
    await uploadJson(ctx, `${prefix}/startup-markers.json`, {
      schema: 'TIVVLEJOY_WORKER_STARTUP_MARKERS_V1',
      markers: MARKERS,
    });
  }
  return row;
}

async function main() {
  const env = process.env;
  const prefix = String(env.V7_PROOF_A_PREFIX || '').replace(/^\/+|\/+$/g, '');
  if (!prefix) throw new Error('V7_PROOF_A_PREFIX missing');
  const ctx = r2.createR2Client(env);
  mkdirSync(OUT_DIR, { recursive: true });

  const started = new Date().toISOString();
  await mark(ctx, prefix, 'IMAGE_PROCESS_STARTED');
  await mark(ctx, prefix, 'NODE_ENTRY_STARTED');
  const gpu = nvidia();
  const mem = meminfo();
  const blender = blenderVersion();
  log('worker_boot', { gpu, memTotalGiB: +(mem.memTotal / 1024 ** 3).toFixed(2), blender: blender.version });
  const vramBytes = Math.round((gpu.vramTotalMiB || 0) * 1024 * 1024);
  if (mem.memTotal < 24 * 1024 * 1024 * 1024) {
    await uploadJson(ctx, `${prefix}/host-memory-receipt.json`, { schema: 'TIVVLEJOY_HOST_MEMORY_RECEIPT_V1', ok: false, code: 'SYSTEM_RAM_BELOW_24GIB', ...mem, gpu });
    await uploadJson(ctx, `${prefix}/status.json`, {
      schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1',
      status: 'FAILED',
      code: 'SYSTEM_RAM_BELOW_24GIB',
      mem,
      started,
      ended: new Date().toISOString(),
    });
    process.exitCode = 3;
    return;
  }
  if (!gpu.ok || (gpu.vramTotalMiB || 0) < 23000) {
    await uploadJson(ctx, `${prefix}/host-memory-receipt.json`, {
      schema: 'TIVVLEJOY_HOST_MEMORY_RECEIPT_V1',
      ok: false,
      code: 'GPU_VRAM_BELOW_24GIB',
      ...mem,
      gpu,
    });
    await uploadJson(ctx, `${prefix}/status.json`, {
      schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1',
      status: 'FAILED',
      code: 'GPU_VRAM_BELOW_24GIB',
      mem,
      gpu,
      started,
      ended: new Date().toISOString(),
    });
    process.exitCode = 3;
    return;
  }
  const warnings = mem.memTotal < 32 * 1024 * 1024 * 1024 ? ['SYSTEM_RAM_BELOW_32GIB_PREFERRED'] : [];
  await uploadJson(ctx, `${prefix}/host-memory-receipt.json`, {
    schema: 'TIVVLEJOY_HOST_MEMORY_RECEIPT_V1',
    ok: true,
    warnings,
    blenderAllowed: true,
    gpuVramBytes: vramBytes,
    ...mem,
    gpu,
  });
  await mark(ctx, prefix, 'HOST_MEMORY_RECEIPT_WRITTEN', { memTotal: mem.memTotal, warnings, vramBytes });

  await mark(ctx, prefix, 'R2_CLIENT_STARTED');
  await mark(ctx, prefix, 'SOURCE_MANIFEST_FETCH_STARTED');
  const manifestKey = `${prefix}/source-manifest.json`;
  const localManifest = '/tmp/v7-source-manifest.json';
  await r2.downloadToFile(ctx, manifestKey, localManifest);
  await mark(ctx, prefix, 'SOURCE_MANIFEST_FETCH_COMPLETE');
  const manifest = JSON.parse(readFileSync(localManifest, 'utf8'));

  for (const file of manifest.files || []) {
    mkdirSync(dirname(file.dest), { recursive: true });
    log('download_start', { dest: file.dest, bytes: file.bytes || null });
    await r2.downloadToFile(ctx, file.key, file.dest);
    if (file.sha256) {
      const got = sha256File(file.dest);
      if (got !== file.sha256) throw new Error(`DOWNLOAD_HASH_MISMATCH:${file.role || file.dest}`);
    }
    if (!existsSync(file.dest) || statSync(file.dest).size <= 0) {
      throw new Error(`DOWNLOAD_EMPTY:${file.dest}`);
    }
  }

  const tar = '/tmp/v7-scenery-scripts.tar.gz';
  mkdirSync('/tmp/v7-scenery-scripts', { recursive: true });
  const tarRun = spawnSync('tar', ['-xzf', tar, '-C', '/tmp/v7-scenery-scripts'], { encoding: 'utf8' });
  if (tarRun.status !== 0) throw new Error(`SCRIPTS_TAR_EXTRACT_FAILED:${String(tarRun.stderr || '').slice(0, 300)}`);
  if (!existsSync(`${SCRIPT_DIR}/v7_proof_a_gpu_wrapper.py`)) {
    throw new Error('SCRIPTS_TAR_MISSING_WRAPPER');
  }

  const sourceSha = sha256File('/tmp/o14-lookdev/expanded-original14/sky_hdri/HDRi_JPG_Pack/sk2/Image0001.jpg');
  const h8Sha = sha256File('/tmp/tj_hdri_diag_8k.jpg');
  if (sourceSha !== EXPECTED_SOURCE) throw new Error('HDRI_SOURCE_IDENTITY_MISMATCH');
  if (h8Sha !== EXPECTED_H8) throw new Error('H8_IDENTITY_MISMATCH');

  const contractPy = `
import json, sys
sys.path.insert(0, "${SCRIPT_DIR}")
from worker_memory_contract_v1 import evaluate_worker_memory_contract
row = evaluate_worker_memory_contract(
    system_ram_bytes=${int(mem.memTotal)},
    gpu_vram_bytes=${vramBytes},
    memory_prediction_bytes=14 * 1024 * 1024 * 1024,
    source_manifest=["festuca_a", "carex_a", "fern_a", "beech_a", "ecokit_rocks", "hdri_jpg"],
    hdri_identity="Image0001.jpg:15000x7500:${EXPECTED_SOURCE}",
    hdri_derivative_identity="H8:8192x4096:${EXPECTED_H8}",
    blender_version="${blender.version || ''}",
    cycles_device="GPU",
    render_profile="PROOF_A_STILL",
    paid_create_allowed=False,
)
print(json.dumps(row))
`;
  const contractRun = spawnSync('python3', ['-c', contractPy], { encoding: 'utf8', timeout: 30000 });
  if (contractRun.status !== 0) {
    throw new Error(`MEMORY_CONTRACT_EVAL_FAILED:${String(contractRun.stderr || '').slice(0, 400)}`);
  }
  const contract = JSON.parse(contractRun.stdout);
  await uploadJson(ctx, `${prefix}/worker-memory-contract.json`, { ...contract, gpu, mem, blender });
  if (!contract.ok) {
    await uploadJson(ctx, `${prefix}/status.json`, {
      schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1',
      status: 'FAILED',
      code: 'WORKER_MEMORY_CONTRACT_FAILED',
      contract,
      started,
      ended: new Date().toISOString(),
    });
    process.exitCode = 3;
    return;
  }

  const beforeMem = meminfo();
  const beforeGpu = nvidia();
  await mark(ctx, prefix, 'BLENDER_EXEC_STARTED');
  await mark(ctx, prefix, 'BLENDER_PROCESS_STARTED');
  const render = spawnSync(
    'blender',
    [
      '-b',
      '--python',
      `${SCRIPT_DIR}/v7_proof_a_gpu_wrapper.py`,
      '--',
      '--proof',
      'A',
      '--water-test',
      'C',
      '--resolution',
      '540x960',
      '--samples',
      '32',
      '--output-dir',
      OUT_DIR,
      '--hdri-path',
      '/tmp/tj_hdri_diag_8k.jpg',
    ],
    { encoding: 'utf8', timeout: 20 * 60 * 1000, env: { ...process.env, PYTHONPATH: SCRIPT_DIR } },
  );
  writeFileSync(`${OUT_DIR}/BLENDER_STDOUT.txt`, String(render.stdout || ''));
  writeFileSync(`${OUT_DIR}/BLENDER_STDERR.txt`, String(render.stderr || ''));
  const afterMem = meminfo();
  const afterGpu = nvidia();
  log('blender_exit', { status: render.status, signal: render.signal });

  const png = `${OUT_DIR}/A_CREEK_BANK_WATER_TEST_C.png`;
  const phone = `${OUT_DIR}/A_CREEK_BANK_WATER_TEST_C_PHONE.png`;
  const pngOk = existsSync(png) && statSync(png).size > 0;
  const phoneOk = existsSync(phone) && statSync(phone).size > 0;

  const receipt = {
    schema: 'TIVVLEJOY_V7_PROOF_A_RENDER_RECEIPT_V1',
    started,
    ended: new Date().toISOString(),
    blenderStatus: render.status,
    blenderVersion: blender.version,
    cyclesDevice: 'GPU',
    resolution: '540x960',
    samples: 32,
    waterTest: 'C',
    hdri: { sourceSha, h8Sha, classification: 'CINEMATIC_LIGHTING_HDRI_APPROVED' },
    memory: { before: beforeMem, after: afterMem, contract },
    gpu: { before: beforeGpu, after: afterGpu },
    pngBytes: pngOk ? statSync(png).size : 0,
    phoneBytes: phoneOk ? statSync(phone).size : 0,
    pngWritten: pngOk,
  };
  writeFileSync(`${OUT_DIR}/RENDER_RECEIPT.json`, `${JSON.stringify(receipt, null, 2)}\n`);

  const uploads = [
    { path: `${OUT_DIR}/RENDER_RECEIPT.json`, key: `${prefix}/RENDER_RECEIPT.json`, type: 'application/json' },
    { path: `${OUT_DIR}/BLENDER_STDOUT.txt`, key: `${prefix}/BLENDER_STDOUT.txt`, type: 'text/plain' },
    { path: `${OUT_DIR}/BLENDER_STDERR.txt`, key: `${prefix}/BLENDER_STDERR.txt`, type: 'text/plain' },
  ];
  if (pngOk) uploads.push({ path: png, key: `${prefix}/A_CREEK_BANK_WATER_TEST_C.png`, type: 'image/png' });
  if (phoneOk) uploads.push({ path: phone, key: `${prefix}/A_CREEK_BANK_WATER_TEST_C_PHONE.png`, type: 'image/png' });
  if (existsSync(`${OUT_DIR}/CONTEXTUAL_RECOVERY_V7.json`)) {
    uploads.push({
      path: `${OUT_DIR}/CONTEXTUAL_RECOVERY_V7.json`,
      key: `${prefix}/CONTEXTUAL_RECOVERY_V7.json`,
      type: 'application/json',
    });
  }
  for (const item of uploads) {
    await r2.uploadFile(ctx, item.key, item.path, item.type);
  }

  const status = {
    schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1',
    status: pngOk && render.status === 0 ? 'COMPLETE' : 'FAILED',
    code: pngOk && render.status === 0 ? 'RENDERED' : 'RENDER_FAILED',
    pngWritten: pngOk,
    phoneWritten: phoneOk,
    blenderStatus: render.status,
    started,
    ended: new Date().toISOString(),
  };
  await uploadJson(ctx, `${prefix}/status.json`, status);
  if (status.status !== 'COMPLETE') process.exitCode = 4;
}

main().catch(async (error) => {
  log('worker_failed', { message: String(error && error.message ? error.message : error).slice(0, 1000) });
  try {
    const ctx = r2.createR2Client(process.env);
    const prefix = String(process.env.V7_PROOF_A_PREFIX || '').replace(/^\/+|\/+$/g, '');
    if (prefix) {
      await r2.uploadBuffer(
        ctx,
        `${prefix}/status.json`,
        Buffer.from(
          `${JSON.stringify({
            schema: 'TIVVLEJOY_V7_PROOF_A_PAID_STATUS_V1',
            status: 'FAILED',
            code: 'WORKER_EXCEPTION',
            message: String(error && error.message ? error.message : error).slice(0, 1000),
            ended: new Date().toISOString(),
          }, null, 2)}\n`,
        ),
        'application/json',
      );
    }
  } catch {
    // ignore secondary upload failure
  }
  process.exitCode = 1;
});
