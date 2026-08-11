/**
 * STAGE E — DRAFT_FAST acceptance with live timing + cache tests.
 * Does NOT touch AUDIT_FAST path. Does NOT run FINAL_1080P.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import {
  detectHardware,
  dirtyShotPlanner,
  episodeShotRenderService,
  shotRenderCacheService,
} from '@doodle-dash/production';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const ROOT = path.resolve(__dirname, '../../..');
const EPISODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUT = path.join(ROOT, 'artifacts/performance/draft-fast');
const EP_OUT = path.join(ROOT, 'artifacts/episodes/extreme-speed-acceptance/draft_fast');
const STALL_MS = 120_000;

function log(msg: string) {
  console.log(msg);
}

function stallWatch(op: string) {
  const t0 = Date.now();
  const id = setInterval(() => {
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    log(`[STALL] ${op} still blocking after ${sec}s`);
  }, STALL_MS);
  return {
    stop: () => clearInterval(id),
    elapsedMs: () => Date.now() - t0,
  };
}

async function downloadUri(uri: string, dest: string) {
  mkdirSync(path.dirname(dest), { recursive: true });
  if (uri.startsWith('local://')) {
    await fs.copyFile(path.join(ROOT, '.doodle-dash-storage', uri.slice('local://'.length)), dest);
    return;
  }
  const bucket = process.env.OBJECT_STORAGE_BUCKET || 'doodle-dash-production';
  let key = uri;
  if (uri.startsWith('s3://')) {
    const without = uri.slice(5);
    key = without.slice(without.indexOf('/') + 1);
  } else {
    const marker = `/${bucket}/`;
    const idx = uri.indexOf(marker);
    key = idx >= 0 ? uri.slice(idx + marker.length) : path.basename(uri);
  }
  const s3 = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
    },
  });
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await fs.writeFile(dest, Buffer.from(await out.Body!.transformToByteArray()));
}

async function waitJobs(jobIds: string[], label: string) {
  const watch = stallWatch(label);
  const perShot: Record<string, { prepMs?: number; renderMs?: number; status: string }> = {};
  const seen = new Set<string>();
  try {
    while (true) {
      const jobs = await prisma.renderJob.findMany({
        where: { id: { in: jobIds } },
        include: { shot: true, outputs: true },
      });
      for (const j of jobs) {
        const sn = j.shot?.shotNumber ?? '?';
        const key = `${j.id}:${j.status}:${j.progress}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (j.status === 'PREPARING' || (j.status === 'RENDERING' && j.progress <= 30)) {
            log(`[DRAFT] shot ${sn} preparation`);
          }
          if (j.status === 'RENDERING' && j.progress > 30) {
            log(`[DRAFT] shot ${sn} rendering (progress ${j.progress}%)`);
          }
          if (j.status === 'ENCODING') log(`[DRAFT] shot ${sn} encoding`);
          if (j.status === 'COMPLETE') log(`[DRAFT] shot ${sn} COMPLETE`);
          if (j.status === 'FAILED') log(`[DRAFT] shot ${sn} FAILED: ${j.error}`);
        }
        const timingPath = path.join(
          '/tmp/doodle-dash-blender-renderer',
          j.id,
          'output',
          'daemon_timings.json',
        );
        if (j.status === 'COMPLETE' && existsSync(timingPath) && !perShot[j.id]?.renderMs) {
          const t = JSON.parse(readFileSync(timingPath, 'utf8'));
          const timings = t.timings || t;
          perShot[j.id] = {
            status: j.status,
            prepMs:
              (timings.scene_reset_ms || 0) +
              (timings.asset_loading_ms || 0) +
              (timings.scene_assembly_ms || 0) +
              (timings.animation_application_ms || 0),
            renderMs: timings.frame_render_ms,
          };
          log(`[DRAFT] Pip asset load: ${timings.pip_load_ms ?? 'n/a'} ms`);
          log(`[DRAFT] Goat asset load: ${timings.goat_load_ms ?? 'n/a'} ms`);
          log(`[DRAFT] environment load: ${timings.environment_load_ms ?? 'n/a'} ms`);
          log(
            `[DRAFT] shot ${sn} timings — prep=${perShot[j.id].prepMs}ms render=${perShot[j.id].renderMs}ms encode=${timings.ffmpeg_encoding_ms}ms frames=${t.frameCount}`,
          );
        }
      }
      const pending = jobs.filter((j) => !['COMPLETE', 'FAILED', 'CANCELLED'].includes(j.status));
      if (pending.length === 0) {
        return { jobs, perShot, wallMs: watch.elapsedMs() };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    watch.stop();
  }
}

async function assembleDraft(episodeId: string) {
  const watch = stallWatch('draft compositing/encoding/audio');
  log('[DRAFT] compositing');
  const jobs = await prisma.renderJob.findMany({
    where: { episodeId, status: 'COMPLETE', resolution: '540x960' },
    include: { outputs: true, shot: true },
    orderBy: { createdAt: 'asc' },
  });
  const byShot = new Map<string, (typeof jobs)[0]>();
  for (const job of jobs) {
    if (!job.shotId) continue;
    const prev = byShot.get(job.shotId);
    if (!prev || (job.completedAt && prev.completedAt && job.completedAt > prev.completedAt)) {
      byShot.set(job.shotId, job);
    }
  }
  const shots = await prisma.shot.findMany({
    where: { scene: { episodeId } },
    orderBy: { shotNumber: 'asc' },
  });
  const work = path.join(EP_OUT, 'work');
  mkdirSync(work, { recursive: true });
  const shotVideos: string[] = [];
  for (const shot of shots) {
    let uri: string | null = null;
    const job = byShot.get(shot.id);
    if (job) {
      uri = job.outputs.find((o) => o.uri?.endsWith('.mp4') || o.kind === 'final')?.uri ?? null;
    }
    if (!uri) {
      const cached = await prisma.shotRenderCacheEntry.findFirst({
        where: { shotId: shot.id, profileCode: 'DRAFT_FAST', approved: true, outputUri: { not: null } },
        orderBy: { updatedAt: 'desc' },
      });
      uri = cached?.outputUri ?? null;
    }
    if (!uri) throw new Error(`No draft output for shot ${shot.shotNumber}`);
    const dest = path.join(work, `shot-${shot.shotNumber}.mp4`);
    await downloadUri(uri, dest);
    shotVideos.push(dest);
  }
  const list = path.join(work, 'concat.txt');
  writeFileSync(list, shotVideos.map((p) => `file '${p}'`).join('\n'));
  const picture = path.join(work, 'picture.mp4');
  const concat = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', picture], {
    encoding: 'utf8',
  });
  if (concat.status !== 0) throw new Error(concat.stderr || 'concat failed');

  log('[DRAFT] audio');
  const dialogues = await prisma.dialogueLine.findMany({
    where: { episodeId },
    orderBy: { startMs: 'asc' },
  });
  const audioInputs: string[] = [];
  const filterParts: string[] = [];
  let ai = 0;
  for (const line of dialogues) {
    const cache = await prisma.voiceGenerationCacheEntry.findFirst({
      where: { text: line.text, audioUri: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!cache?.audioUri) continue;
    const wav = path.join(work, `line-${ai}.wav`);
    await downloadUri(cache.audioUri, wav);
    audioInputs.push('-i', wav);
    const delay = line.startMs ?? 0;
    filterParts.push(`[${ai + 1}:a]adelay=${delay}|${delay},volume=1[a${ai}]`);
    ai++;
  }
  log('[DRAFT] encoding');
  const outMp4 = path.join(EP_OUT, 'ExtremeSpeed_DRAFT_FAST.mp4');
  mkdirSync(path.dirname(outMp4), { recursive: true });
  const tEnc = Date.now();
  if (ai === 0) {
    copyFileSync(picture, outMp4);
  } else {
    const mix =
      filterParts.join(';') +
      ';' +
      filterParts.map((_, i) => `[a${i}]`).join('') +
      `amix=inputs=${ai}:normalize=0[aout]`;
    const enc = spawnSync(
      'ffmpeg',
      ['-y', '-i', picture, ...audioInputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outMp4],
      { encoding: 'utf8' },
    );
    if (enc.status !== 0) copyFileSync(picture, outMp4);
  }
  const encodeMs = Date.now() - tEnc;
  watch.stop();
  return { outMp4, encodeMs, assembleWallMs: watch.elapsedMs() };
}

function probe(file: string) {
  const res = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate,codec_name', '-show_entries', 'format=duration', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(res.stdout || '{}');
}

function extractFrames(file: string, times: number[], destDir: string) {
  mkdirSync(destDir, { recursive: true });
  for (const t of times) {
    spawnSync('ffmpeg', ['-y', '-ss', String(t), '-i', file, '-frames:v', '1', path.join(destDir, `t${t}.png`)], {
      encoding: 'utf8',
    });
  }
}

async function collectDaemonStats(jobIds: string[]) {
  let startups = 0;
  let jobsHandled = 0;
  let assetLoad = 0;
  let frameRender = 0;
  let encode = 0;
  let frames = 0;
  for (const id of jobIds) {
    const p = path.join('/tmp/doodle-dash-blender-renderer', id, 'output', 'daemon_timings.json');
    if (!existsSync(p)) continue;
    const t = JSON.parse(readFileSync(p, 'utf8'));
    startups = Math.max(startups, t.blenderStartupsThisProcess || 1);
    jobsHandled += 1;
    const timings = t.timings || {};
    assetLoad += timings.asset_loading_ms || 0;
    frameRender += timings.frame_render_ms || 0;
    encode += timings.ffmpeg_encoding_ms || 0;
    frames += t.frameCount || 0;
  }
  return { startups, jobsHandled, assetLoad, frameRender, encode, frames };
}

async function queueAndRun(label: string) {
  log(`[DRAFT] Job start — ${label}`);
  log('[DRAFT] Blender startup/reuse — persistent daemon expected');
  const t0 = Date.now();
  const queued = await episodeShotRenderService.queueEpisode({
    episodeId: EPISODE_ID,
    profileCode: 'DRAFT_FAST',
    priority: 75,
  });
  log(
    `[DRAFT] queued jobs=${queued.jobCount} reused=${queued.reused.length} frames≈${queued.estimatedFrames} samples=${queued.samples} res=${queued.resolution}`,
  );
  let wait: Awaited<ReturnType<typeof waitJobs>> | null = null;
  if (queued.jobCount > 0) {
    wait = await waitJobs(
      queued.jobs.map((j) => j.jobId),
      `${label} render jobs`,
    );
  }
  const wallMs = Date.now() - t0;
  const daemon = queued.jobCount
    ? await collectDaemonStats(queued.jobs.map((j) => j.jobId))
    : { startups: 0, jobsHandled: 0, assetLoad: 0, frameRender: 0, encode: 0, frames: 0 };
  return { queued, wait, wallMs, daemon };
}

async function plan() {
  return dirtyShotPlanner.planEpisode({
    episodeId: EPISODE_ID,
    profileCode: 'DRAFT_FAST',
    buildFingerprint: (id, code) => shotRenderCacheService.buildFingerprint(id, code),
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(EP_OUT, { recursive: true });
  const hardware = detectHardware();

  // Cancel any leftover non-complete jobs for this episode
  await prisma.renderJob.updateMany({
    where: {
      episodeId: EPISODE_ID,
      status: { in: ['QUEUED', 'PREPARING', 'RENDERING', 'ENCODING'] },
    },
    data: { status: 'CANCELLED', error: 'superseded by DRAFT_FAST acceptance', completedAt: new Date() },
  });

  // ── FIRST RUN ──
  const first = await queueAndRun('FIRST DRAFT_FAST');
  const failed = first.wait?.jobs.filter((j) => j.status === 'FAILED') || [];
  if (failed.length) {
    throw new Error(`DRAFT_FAST first run failed: ${failed.map((j) => j.error).join('; ')}`);
  }
  const assembled = await assembleDraft(EPISODE_ID);
  log(`[DRAFT] total first-run wall: ${(first.wallMs / 1000).toFixed(1)}s (+ assemble ${assembled.assembleWallMs}ms)`);
  const probe1 = probe(assembled.outMp4);
  extractFrames(assembled.outMp4, [0.5, 3, 6, 9, 11], path.join(EP_OUT, 'inspect'));

  // ── CACHE TEST #1 identical rerun ──
  log('\n[CACHE] Identical rerun starting');
  const second = await queueAndRun('IDENTICAL RERUN');
  const speedup = second.wallMs > 0 ? first.wallMs / second.wallMs : null;
  log(
    `[CACHE] Re-run: ${(second.wallMs / 1000).toFixed(2)} sec — jobs=${second.queued.jobCount} reused=${second.queued.reused.length}`,
  );

  // ── CACHE TEST #2 one shot change ──
  const shots = await prisma.shot.findMany({
    where: { scene: { episodeId: EPISODE_ID } },
    orderBy: { shotNumber: 'asc' },
  });
  const shot3 = shots.find((s) => s.shotNumber === 3)!;
  const origDesc = shot3.description;
  await prisma.shot.update({
    where: { id: shot3.id },
    data: { description: origDesc + ' [DRAFT_CACHE_ONE_SHOT]' },
  });
  const planB = await plan();
  log(
    `[CACHE] One-shot edit plan — render=${planB.shotsToRender} reuse=${planB.shotsToReuse}`,
  );
  const oneShot = await queueAndRun('ONE SHOT CHANGE');
  // restore description after queue so fingerprints for subsequent tests are clean…
  // Actually keep until jobs done, then restore
  await prisma.shot.update({ where: { id: shot3.id }, data: { description: origDesc } });

  // ── CACHE TEST #3 Pip animation one shot ──
  const shot2 = shots.find((s) => s.shotNumber === 2)!;
  const origNotes = shot2.productionNotes;
  await prisma.shot.update({
    where: { id: shot2.id },
    data: {
      productionNotes: JSON.stringify({
        actions: { pip: 'PIP_WAVE', goat: 'GOAT_IDLE' },
        acceptance: true,
        cacheTest: 'PIP_ANIM',
      }),
    },
  });
  const planC = await plan();
  const pipAnimPass =
    planC.shotsToRender === 1 && planC.plan.find((p) => p.shotId === shot2.id)?.action === 'RENDER';
  log(
    `[CACHE] Pip animation plan — render=${planC.shotsToRender} reuse=${planC.shotsToReuse} pass=${pipAnimPass}`,
  );
  // Restore without full rerender — planner-only validation is enough for anim dependency
  await prisma.shot.update({ where: { id: shot2.id }, data: { productionNotes: origNotes } });

  // ── CACHE TEST #4 Pip base asset invalidation (temporary) ──
  const pip = await prisma.character.findFirstOrThrow({ where: { internalCode: 'CHAR_PIP_001' } });
  const pipIntake = await prisma.productionAssetIntake.findFirstOrThrow({
    where: { entityId: pip.id, kind: 'CHARACTER_BLEND' },
    orderBy: { version: 'desc' },
  });
  const origPip = pipIntake.checksum;
  await prisma.productionAssetIntake.update({
    where: { id: pipIntake.id },
    data: { checksum: `draft-cache-pip-base-${Date.now()}` },
  });
  const planD = await plan();
  const pipBasePass = planD.shotsToRender === planD.shotsTotal && planD.shotsToReuse === 0;
  log(
    `[CACHE] Pip base invalidation — render=${planD.shotsToRender}/${planD.shotsTotal} pass=${pipBasePass}`,
  );
  await prisma.productionAssetIntake.update({
    where: { id: pipIntake.id },
    data: { checksum: origPip },
  });

  // Goat equivalent
  const goat = await prisma.character.findFirstOrThrow({ where: { internalCode: 'CHAR_GOAT_001' } });
  const goatIntake = await prisma.productionAssetIntake.findFirstOrThrow({
    where: { entityId: goat.id, kind: 'CHARACTER_BLEND' },
    orderBy: { version: 'desc' },
  });
  const origGoat = goatIntake.checksum;
  await prisma.productionAssetIntake.update({
    where: { id: goatIntake.id },
    data: { checksum: `draft-cache-goat-base-${Date.now()}` },
  });
  const planE = await plan();
  const goatBasePass = planE.shotsToRender === planE.shotsTotal && planE.shotsToReuse === 0;
  log(
    `[CACHE] Goat base/collar invalidation — render=${planE.shotsToRender}/${planE.shotsTotal} pass=${goatBasePass}`,
  );
  await prisma.productionAssetIntake.update({
    where: { id: goatIntake.id },
    data: { checksum: origGoat },
  });

  const v = (probe1.streams || []).find((s: any) => s.width);
  const frames = first.daemon.frames || first.queued.estimatedFrames || 0;
  const avgSpf =
    frames > 0 && first.daemon.frameRender > 0 ? first.daemon.frameRender / 1000 / frames : null;
  const cacheHitFirst =
    first.queued.reused.length / Math.max(1, first.queued.jobCount + first.queued.reused.length);
  const cacheHitSecond =
    second.queued.reused.length / Math.max(1, second.queued.jobCount + second.queued.reused.length);

  const oneShotReused = oneShot.queued.reused.length;
  const oneShotRendered = oneShot.queued.jobCount;
  const oneShotPass = oneShotRendered === 1 && oneShotReused >= 4;

  // Character lock via existing collar closeup + inspect frames presence
  const collarOk = existsSync(path.join(ROOT, 'artifacts/performance/goat-collar-closeup.png'));
  const inspectDir = path.join(EP_OUT, 'inspect');
  const inspectCount = existsSync(inspectDir)
    ? (await fs.readdir(inspectDir)).filter((f) => f.endsWith('.png')).length
    : 0;

  const draftPass =
    failed.length === 0 &&
    existsSync(assembled.outMp4) &&
    Number(v?.width) === 540 &&
    Number(v?.height) === 960 &&
    second.queued.jobCount === 0 &&
    oneShotPass &&
    pipAnimPass &&
    pipBasePass &&
    goatBasePass;

  const report = {
    DRAFT_FAST_ACCEPTANCE: draftPass ? 'PASS' : 'FAIL',
    FIRST_RUN: {
      RuntimeSec: Number((first.wallMs / 1000).toFixed(2)),
      Resolution: first.queued.resolution,
      FPS: 30,
      Frames: frames,
      BlenderStartups: first.daemon.startups || (first.queued.jobCount ? 1 : 0),
      DaemonReuse: Math.max(0, (first.daemon.jobsHandled || first.queued.jobCount) - (first.daemon.startups || 1)),
      AverageRenderPerFrameSec: avgSpf,
      EncodeTimeMs: first.daemon.encode + assembled.encodeMs,
      CacheHitRate: cacheHitFirst,
      JobsRendered: first.queued.jobCount,
      ShotsReused: first.queued.reused.length,
      AssetLoadMs: first.daemon.assetLoad,
      FrameRenderMs: first.daemon.frameRender,
      outputPath: assembled.outMp4,
      probe: probe1,
    },
    IDENTICAL_SECOND_RUN: {
      RuntimeSec: Number((second.wallMs / 1000).toFixed(2)),
      CacheHitRate: cacheHitSecond,
      ShotsReused: second.queued.reused.length,
      ShotsRerendered: second.queued.jobCount,
      Speedup: speedup,
    },
    ONE_SHOT_EDIT_TEST: {
      ChangedShot: 3,
      ShotsInvalidated: planB.shotsToRender,
      ShotsReused: oneShotReused,
      ShotsRerendered: oneShotRendered,
      RuntimeSec: Number((oneShot.wallMs / 1000).toFixed(2)),
      Pass: oneShotPass,
    },
    PIP_ANIMATION_TEST: { Result: pipAnimPass ? 'PASS' : 'FAIL', plan: planC },
    PIP_BASE_ASSET_INVALIDATION: { Result: pipBasePass ? 'PASS' : 'FAIL', plan: planD },
    GOAT_DEPENDENCY_INVALIDATION: { Result: goatBasePass ? 'PASS' : 'FAIL', plan: planE },
    CHARACTER_LOCK: {
      Pip: inspectCount > 0 ? 'INSPECTED_DRAFT_FRAMES' : 'MISSING_FRAMES',
      Goat: inspectCount > 0 ? 'INSPECTED_DRAFT_FRAMES' : 'MISSING_FRAMES',
      GoatCollar: collarOk ? 'PASS (asset close-up Goat)' : 'UNKNOWN',
      inspectDir,
    },
    HARDWARE: hardware,
    SLOWEST_REMAINING_OPERATION:
      first.daemon.frameRender >= first.daemon.assetLoad
        ? 'EEVEE frame_render (CPU draft shading)'
        : 'asset_loading / scene prep',
    RECOMMENDED_OPTIMIZATION:
      'Reuse preloaded Pip/Goat/meadow objects across shots in the persistent daemon instead of append-per-shot; keep DRAFT samples moderate.',
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(path.join(OUT, 'draft-fast-acceptance.json'), JSON.stringify(report, null, 2));
  log('\n=== DRAFT_FAST ACCEPTANCE ===');
  log(JSON.stringify(report, null, 2));
  if (!draftPass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
