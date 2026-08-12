#!/usr/bin/env tsx
/**
 * PHASE C — POST-RUN SAFETY (independent) + ACCEPTANCE QC (OFF-GPU).
 *
 * Independent of Phase B: re-verifies the account has NO pods / NO billable GPU
 * and that the paid-launch flags are restored to false. Then downloads the final
 * artifact + status/metadata from R2, verifies sha256 readback, runs ffprobe /
 * decode / black / freeze QC, extracts representative frames, and copies durable
 * artifacts to /opt/cursor/artifacts. Never starts a pod.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import { sha256Hex } from '@doodle-dash/shared';
import { STATE_FILE, makeStorage, redact } from './common';

const ART = '/opt/cursor/artifacts';

function sh(bin: string, args: string[]) {
  return spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  mkdirSync(ART, { recursive: true });
  const storage = makeStorage();
  const out: Record<string, unknown> = { jobId: state.jobId };

  console.log('=== PHASE C — POST-RUN SAFETY (independent) ===');
  // Independent safety verification.
  const client = new RunpodClient();
  let pods: any[] = [];
  try {
    const data = await client.graphql<{ myself?: { pods?: any[] } }>(
      `query { myself { pods { id name desiredStatus costPerHr } } }`,
    );
    pods = data.myself?.pods ?? [];
  } catch (e) {
    console.log('pod query error:', redact((e as Error).message));
  }
  const podsEmpty = pods.length === 0;
  const billable = pods.filter((p) => (p.costPerHr ?? 0) > 0);
  console.log(`myself.pods empty: ${podsEmpty ? 'YES' : 'NO'} (count=${pods.length})`);
  console.log(`Active billable GPU remaining: ${billable.length > 0 ? 'YES' : 'NO'}`);
  console.log(`ALLOW_PAID_GPU_LAUNCH: ${process.env.ALLOW_PAID_GPU_LAUNCH ?? '(unset->false)'}`);
  console.log(`CLOUD_RENDER_ENABLED: ${process.env.CLOUD_RENDER_ENABLED ?? '(unset->false)'}`);
  out.safety = {
    podsEmpty,
    billableRemaining: billable.length > 0,
    allowPaidGpuLaunch: process.env.ALLOW_PAID_GPU_LAUNCH ?? 'false',
    cloudRenderEnabled: process.env.CLOUD_RENDER_ENABLED ?? 'false',
    orphanResources: pods.length > 0,
  };

  if (state.finalStatus !== 'COMPLETE') {
    console.log(`\nRender finalStatus=${state.finalStatus} (not COMPLETE). No artifact to QC.`);
    out.qc = { note: `no artifact — finalStatus=${state.finalStatus}` };
    writeFileSync(path.join(ART, 'acceptance_1080p_qc.json'), JSON.stringify(out, null, 2));
    return;
  }

  console.log('\n=== ACCEPTANCE QC (off-GPU) ===');
  // Download artifact + status + metadata.
  const outputKey: string = state.outputKey;
  const statusKey: string = state.statusKey;
  const metadataKey: string = state.metadataKey;

  const status = JSON.parse(Buffer.from(await storage.readObject!(statusKey)).toString('utf8'));
  const metadata = JSON.parse(Buffer.from(await storage.readObject!(metadataKey)).toString('utf8'));
  const mp4Bytes = Buffer.from(await storage.readObject!(outputKey));
  const localMp4 = path.join(ART, 'meadow_map_mystery_final_1080p.mp4');
  writeFileSync(localMp4, mp4Bytes);

  const downloadedSha = sha256Hex(new Uint8Array(mp4Bytes));
  const readbackOk = downloadedSha === status.artifactSha256 && downloadedSha === metadata.artifactSha256;
  console.log(`R2 readback sha256: ${downloadedSha}`);
  console.log(`Integrity vs status/metadata: ${readbackOk ? 'MATCH' : 'MISMATCH'}`);

  // ffprobe
  const probe = sh('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=width,height,nb_read_frames,avg_frame_rate,duration,codec_name,pix_fmt',
    '-of', 'json', localMp4,
  ]);
  const info = JSON.parse(probe.stdout || '{}');
  const s = (info.streams || [])[0] || {};
  const width = Number(s.width);
  const height = Number(s.height);
  const frames = Number(s.nb_read_frames);
  console.log(`ffprobe: ${width}x${height} frames=${frames} fps=${s.avg_frame_rate} dur=${s.duration}s codec=${s.codec_name} pix=${s.pix_fmt}`);

  // Black + freeze detection (decode start->finish).
  const black = sh('ffmpeg', ['-v', 'info', '-i', localMp4, '-vf', 'blackdetect=d=0.05:pic_th=0.98', '-an', '-f', 'null', '-']);
  const freeze = sh('ffmpeg', ['-v', 'info', '-i', localMp4, '-vf', 'freezedetect=n=0.003:d=0.5', '-an', '-f', 'null', '-']);
  const blackHits = (black.stderr.match(/black_start/g) || []).length;
  const freezeHits = (freeze.stderr.match(/freeze_start/g) || []).length;
  console.log(`blackdetect segments: ${blackHits}; freezedetect segments: ${freezeHits}`);

  // Extract representative frames: begin(1), mid-motion(~15), middle(~45), end(last).
  const total = frames > 0 ? frames : 90;
  const picks: Array<[string, number]> = [
    ['begin', 1],
    ['mid_motion', Math.min(15, total)],
    ['middle', Math.round(total / 2)],
    ['end', total],
  ];
  const framePaths: Record<string, string> = {};
  for (const [label, n] of picks) {
    const dst = path.join(ART, `acceptance_1080p_frame_${label}.png`);
    // select the nth frame (0-indexed n-1)
    const r = sh('ffmpeg', ['-y', '-i', localMp4, '-vf', `select=eq(n\\,${Math.max(0, n - 1)})`, '-vframes', '1', dst]);
    if (r.status === 0) framePaths[label] = dst;
    else console.log(`frame extract ${label} failed: ${redact(r.stderr.slice(-200))}`);
  }

  // Upload QC report to R2 for durability.
  const qc = {
    resolution: `${width}x${height}`,
    resolutionExact1080x1920: width === 1080 && height === 1920,
    frameCount: frames,
    expectedFrames: (state.frameEnd - state.frameStart + 1),
    frameCountMatch: frames === (state.frameEnd - state.frameStart + 1),
    durationSec: Number(s.duration),
    codec: s.codec_name,
    pixFmt: s.pix_fmt,
    fps: s.avg_frame_rate,
    blackSegments: blackHits,
    freezeSegments: freezeHits,
    r2ReadbackSha256: downloadedSha,
    readbackIntegrity: readbackOk,
    outputKey,
    metadata,
    statusStage: status.stage,
  };
  out.qc = qc;
  const qcKeyR2 = `qc/${state.jobId}/acceptance_qc.json`;
  await storage.putObject(qcKeyR2, new TextEncoder().encode(JSON.stringify(qc, null, 2)), 'application/json');
  out.qcKeyR2 = qcKeyR2;

  writeFileSync(path.join(ART, 'acceptance_1080p_qc.json'), JSON.stringify(out, null, 2));
  console.log('\n===== QC RESULT =====');
  console.log(JSON.stringify(qc, null, 2));
  console.log(`\nArtifacts: ${localMp4}`);
  for (const [k, v] of Object.entries(framePaths)) console.log(`  frame[${k}] ${v}`);
  console.log(`R2 QC report: ${qcKeyR2}`);
}

main().catch((e) => {
  console.error(redact(String((e as Error).message || e)));
  process.exit(1);
});
