/**
 * Local validation harness for DDP Steps 1-8.
 *
 * Plans the bundled 12-second validation scene and writes the evidence a reviewer
 * needs to believe the eight systems work: the blueprint, the shot_meta each shot
 * would hand Blender, the manifest state bags, per-shot QC, a determinism proof, a
 * targeted-invalidation proof, and an FFmpeg mix that is actually executed.
 *
 * THIS IS NOT AN ACCEPTANCE RENDER. It is a capability fixture at draft resolution
 * (360x640). The closed FINAL_1080P acceptance is separate, historical, and nothing
 * here re-derives or replaces it.
 *
 * Free and offline by construction:
 *
 * - the eight planners are pure functions, so planning costs nothing;
 * - the audio mix uses lavfi generators, so no voice is synthesised and no library
 *   asset is fetched;
 * - the optional Blender pass is draft resolution, runs locally, and is skipped with
 *   a recorded SKIPPED status when Blender is absent rather than pretending to pass;
 * - no provider, no GPU, no network.
 *
 *   pnpm validate:steps1-8            plan, QC, determinism, invalidation, audio mix
 *   pnpm validate:steps1-8 --render   also render one draft still if Blender exists
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  FINAL_1080P_ACCEPTANCE,
  SUBSYSTEM_VERSIONS,
  VALIDATION_SCENE_PLAN,
  buildFfmpegAnalysisCommand,
  buildFfmpegMixCommand,
  diffBlueprints,
  parseLoudnormMeasurement,
  direct,
  projectBlueprintForRender,
  stableHash,
  type DirectorOverride,
} from '../../packages/direction/src/index';
import { computeRenderAssetFingerprint } from '../../packages/production/src/cloud/worker-provenance';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/steps-1-8-validation');
const RENDER_REQUESTED = process.argv.includes('--render');

type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';
type Check = { name: string; status: CheckStatus; detail: string };
const checks: Check[] = [];

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  const mark = status === 'PASS' ? 'PASS' : status === 'SKIPPED' ? 'SKIP' : 'FAIL';
  console.log(`[${mark}] ${name} — ${detail}`);
}

function write(relative: string, value: unknown): void {
  const target = path.join(OUT_DIR, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function have(binary: string): boolean {
  return spawnSync('which', [binary], { encoding: 'utf8' }).status === 0;
}

/** Single-pass loudnorm lands close to target but not exactly on it. */
const LOUDNESS_TOLERANCE_LU = 2;

/**
 * Measure an assembled mix with EBU R128, the same standard the loudness targets are
 * expressed in. Reads the produced file, so it cannot inherit an error from the
 * filter graph that produced it.
 */
function measureLoudness(filePath: string): {
  integratedLufs: number | null;
  truePeakDb: number | null;
} {
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostdin', '-i', filePath, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const stderr = String(result.stderr ?? '');
  // The Summary block at the end is the integrated measurement for the whole file;
  // the streaming lines above it are momentary values and would be misleading.
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(summary);
  const peak = /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(summary);
  return {
    integratedLufs: integrated ? Number(integrated[1]) : null,
    truePeakDb: peak ? Number(peak[1]) : null,
  };
}

function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('DDP Steps 1-8 — local validation scene');
  console.log('Draft resolution capability fixture. NOT a FINAL_1080P acceptance render.\n');

  // ---------------------------------------------------------------- Step 1-8 plan
  const first = direct(VALIDATION_SCENE_PLAN);
  const blueprint = first.blueprint;
  const content = blueprint.content;
  write('blueprint.json', blueprint);

  record(
    'plan validates',
    content.validation.status === 'PASS' ? 'PASS' : 'FAIL',
    `${content.validation.status}: ${content.validation.errorCount} error(s), ` +
      `${content.validation.warningCount} warning(s) across ${content.totals.shotCount} shot(s)`,
  );
  if (content.validation.status !== 'PASS') {
    for (const issue of content.issues.filter((i) => i.severity === 'ERROR')) {
      console.log(`        ${issue.code} [${issue.system}] ${issue.message}`);
    }
  }

  record(
    'scene is 10-15s at draft resolution',
    content.totals.durationSeconds >= 10 &&
      content.totals.durationSeconds <= 15 &&
      VALIDATION_SCENE_PLAN.delivery.resolution === '360x640'
      ? 'PASS'
      : 'FAIL',
    `${content.totals.durationSeconds}s at ${VALIDATION_SCENE_PLAN.delivery.resolution} ` +
      `(9:16, ${VALIDATION_SCENE_PLAN.delivery.fps}fps)`,
  );

  // Every one of the eight systems has to have actually contributed to every shot.
  // A silently empty plan would otherwise read as a pass.
  const perSystem = {
    director: content.shots.length,
    emotion: content.shots.reduce((n, s) => n + Object.keys(s.emotion).length, 0),
    acting: content.shots.reduce((n, s) => n + s.acting.length, 0),
    face: content.shots.reduce((n, s) => n + s.face.length, 0),
    camera: content.shots.filter((s) => s.camera.composition).length,
    lighting: content.shots.filter((s) => s.lighting.recipe).length,
    vfx: content.shots.reduce((n, s) => n + s.vfx.instances.length, 0),
    sound: content.shots.reduce((n, s) => n + s.audio.tracks.length, 0),
  };
  write('systems.json', { versions: SUBSYSTEM_VERSIONS, contributions: perSystem });
  record(
    'all eight systems contributed',
    Object.values(perSystem).every((n) => n > 0) ? 'PASS' : 'FAIL',
    Object.entries(perSystem)
      .map(([system, n]) => `${system}=${n}`)
      .join(' '),
  );

  record(
    'both locked characters are present in every shot',
    content.shots.every((shot) => shot.acting.length === 2 && shot.face.length === 2) ? 'PASS' : 'FAIL',
    `Pip and Goat planned in all ${content.shots.length} shots`,
  );

  // -------------------------------------------------------------------- projection
  const projection = projectBlueprintForRender(blueprint);
  write('render-projection.json', projection);
  for (const shot of projection.shots) {
    write(`shot_meta/${shot.shotId}.json`, shot.shotMeta);
    write(`manifest_state/${shot.shotId}.json`, shot.manifestState);
    write(`audio/${shot.shotId}.json`, shot.audio);
  }
  record(
    'projects to shot_meta and manifest state bags',
    projection.shots.length === content.shots.length ? 'PASS' : 'FAIL',
    `${projection.shots.length} shot_meta + manifest state documents written`,
  );

  // ---------------------------------------------------------------------------- QC
  const qc = content.shots.map((shot) => ({
    shotId: shot.shotId,
    beatId: shot.beatId,
    status: shot.qc.status,
    motion: shot.qc.motion,
    facial: shot.qc.facial,
    sound: shot.qc.sound,
  }));
  write('qc.json', qc);
  const failedChecks = qc.flatMap((shot) =>
    [...shot.motion, ...shot.facial, ...shot.sound]
      .filter((m) => m.status === 'FAIL')
      .map((m) => `${shot.shotId}:${m.check}`),
  );
  const measurementCount = qc.reduce(
    (n, shot) => n + shot.motion.length + shot.facial.length + shot.sound.length,
    0,
  );
  record(
    'motion, facial and sound QC',
    failedChecks.length === 0 ? 'PASS' : 'FAIL',
    failedChecks.length === 0
      ? `${measurementCount} measurements, all within tolerance`
      : `failed: ${failedChecks.join(', ')}`,
  );

  // -------------------------------------------------------------------- determinism
  const second = direct(VALIDATION_SCENE_PLAN);
  const firstHash = stableHash(first.blueprint.content);
  const secondHash = stableHash(second.blueprint.content);
  const projectionHash = stableHash(projection);
  const secondProjectionHash = stableHash(projectBlueprintForRender(second.blueprint));
  write('determinism.json', {
    note: 'Two independent planning runs of the same scene plan, hashed.',
    contentHash: content.contentHash,
    run1: firstHash,
    run2: secondHash,
    projectionRun1: projectionHash,
    projectionRun2: secondProjectionHash,
    identical: firstHash === secondHash && projectionHash === secondProjectionHash,
  });
  record(
    'deterministic output for identical input',
    firstHash === secondHash && projectionHash === secondProjectionHash ? 'PASS' : 'FAIL',
    `blueprint and projection hashes identical across two runs (${firstHash.slice(0, 16)}…)`,
  );

  // A different seed must produce a different plan, or "deterministic" would just
  // mean "constant" and the seed would be decoration.
  const reseeded = direct({ ...VALIDATION_SCENE_PLAN, seed: 'a-different-seed-v1' });
  record(
    'seed actually drives the plan',
    stableHash(reseeded.blueprint.content) !== firstHash ? 'PASS' : 'FAIL',
    'a different seed produces a different blueprint',
  );

  // ------------------------------------------------------------ targeted invalidation
  const override: DirectorOverride = {
    path: 'lighting.recipe',
    shotId: content.shots[1].shotId,
    value: 'DAY_SOFT',
    by: 'validation-harness',
    reason: 'prove a one-shot lighting change invalidates one shot',
  };
  const overridden = direct(VALIDATION_SCENE_PLAN, { overrides: [override] });
  const diff = diffBlueprints(blueprint, overridden.blueprint);
  write('invalidation.json', {
    note: 'A lighting override on one shot must invalidate that shot and no other.',
    override,
    invalidatedShotIds: diff.invalidatedShotIds,
    reusableShotIds: diff.reusableShotIds,
    changedSystems: diff.changedSystems,
    episodeKeyChanged: diff.episodeKeyChanged,
  });
  const targeted =
    diff.invalidatedShotIds.length === 1 &&
    diff.invalidatedShotIds[0] === content.shots[1].shotId &&
    diff.reusableShotIds.length === content.shots.length - 1;
  record(
    'targeted invalidation',
    targeted ? 'PASS' : 'FAIL',
    `lighting override invalidated ${diff.invalidatedShotIds.length} of ${content.shots.length} shots ` +
      `(${diff.invalidatedShotIds.join(', ') || 'none'}), ${diff.reusableShotIds.length} reusable`,
  );

  // ------------------------------------------------------------- FFmpeg assembly
  const mixDir = path.join(OUT_DIR, 'mix');
  mkdirSync(mixDir, { recursive: true });
  const ffmpegAvailable = have('ffmpeg');
  const mixRecords: unknown[] = [];
  const clippedMixes: string[] = [];
  const offTargetMixes: string[] = [];
  let mixFailures = 0;

  for (const shot of projection.shots) {
    const outputPath = path.join(mixDir, `${shot.shotId}.wav`);

    // Two-pass loudness: measure the mix, then apply one fixed correction. Adaptive
    // single-pass normalisation cannot converge on a shot a few seconds long.
    let measurement = undefined;
    if (ffmpegAvailable) {
      const analysis = spawnSync(
        'ffmpeg',
        buildFfmpegAnalysisCommand(shot.audio, { sourceMode: 'synthetic' }).args,
        { encoding: 'utf8' },
      );
      measurement = parseLoudnormMeasurement(String(analysis.stderr ?? '')) ?? undefined;
    }

    const command = buildFfmpegMixCommand(shot.audio, {
      outputPath,
      sourceMode: 'synthetic',
      measurement,
    });
    const entry: Record<string, unknown> = {
      shotId: shot.shotId,
      mixConfigKey: shot.audio.mixConfigKey,
      mixBusTrimDb: shot.audio.mixBusTrimDb,
      trackCount: shot.audio.tracks.length,
      durationSeconds: command.durationSeconds,
      filterGraph: command.filterGraph,
      inputs: command.inputs,
      // Synthetic sources: no voice synthesis, no library fetch, no paid provider.
      sourceMode: 'synthetic',
      loudnormPasses: measurement ? 2 : 1,
      analysisMeasurement: measurement ?? null,
    };
    if (!ffmpegAvailable) {
      entry.executed = false;
      mixRecords.push(entry);
      continue;
    }
    const result = spawnSync('ffmpeg', command.args, { encoding: 'utf8' });
    entry.executed = true;
    entry.exitCode = result.status;
    if (result.status !== 0) {
      mixFailures += 1;
      entry.stderrTail = String(result.stderr ?? '').split('\n').slice(-12).join('\n');
    } else {
      // Measure the file that came out rather than trusting the filter's own
      // report. This is what turns "the command ran" into "the mix hits its target
      // and does not clip".
      const measurement = measureLoudness(outputPath);
      entry.measuredIntegratedLufs = measurement.integratedLufs;
      entry.measuredTruePeakDb = measurement.truePeakDb;
      entry.targetLufs = shot.audio.loudness.targetLufs;
      entry.truePeakCeilingDb = shot.audio.loudness.truePeakDb;
      entry.outputExists = existsSync(outputPath);
      if (measurement.truePeakDb != null && measurement.truePeakDb > shot.audio.loudness.truePeakDb) {
        clippedMixes.push(
          `${shot.shotId} peaked at ${measurement.truePeakDb}dB over a ${shot.audio.loudness.truePeakDb}dB ceiling`,
        );
      }
      if (
        measurement.integratedLufs != null &&
        Math.abs(measurement.integratedLufs - shot.audio.loudness.targetLufs) > LOUDNESS_TOLERANCE_LU
      ) {
        offTargetMixes.push(
          `${shot.shotId} measured ${measurement.integratedLufs} LUFS against a ${shot.audio.loudness.targetLufs} target`,
        );
      }
    }
    mixRecords.push(entry);
  }
  write('mix/assembly.json', mixRecords);
  record(
    'FFmpeg assembly executes',
    !ffmpegAvailable ? 'SKIPPED' : mixFailures === 0 ? 'PASS' : 'FAIL',
    !ffmpegAvailable
      ? 'ffmpeg not installed; graphs written but not executed'
      : mixFailures === 0
        ? `${projection.shots.length} shot mixes assembled from synthetic sources`
        : `${mixFailures} shot mix(es) failed`,
  );

  // Clipping prevention and child-appropriate loudness, measured on the artifact.
  record(
    'assembled mix does not clip',
    !ffmpegAvailable ? 'SKIPPED' : clippedMixes.length === 0 ? 'PASS' : 'FAIL',
    !ffmpegAvailable
      ? 'ffmpeg not installed'
      : clippedMixes.length === 0
        ? 'every mix measured at or below its true-peak ceiling'
        : clippedMixes.join('; '),
  );
  record(
    'assembled mix hits its loudness target',
    !ffmpegAvailable ? 'SKIPPED' : offTargetMixes.length === 0 ? 'PASS' : 'FAIL',
    !ffmpegAvailable
      ? 'ffmpeg not installed'
      : offTargetMixes.length === 0
        ? `every mix within ${LOUDNESS_TOLERANCE_LU} LU of target (EBU R128 integrated)`
        : offTargetMixes.join('; '),
  );

  /**
   * Individual track replacement.
   *
   * Two properties, and it is worth being precise about which is which. A track is
   * addressable if its id is unique within its shot — that is what lets one track be
   * swapped. Its *source* cache key is deliberately not unique: the same ambience bed
   * or the same Goat foley used in four shots is one artifact, and sharing the key is
   * the cache doing its job. What must hold is that a shared key always means an
   * identical artifact, or reuse would serve the wrong audio.
   */
  const sourcesByCacheKey = new Map<string, Set<string>>();
  let duplicateTrackIds = 0;
  for (const shot of projection.shots) {
    const idsInShot = new Set<string>();
    for (const track of shot.audio.tracks) {
      if (idsInShot.has(track.trackId)) duplicateTrackIds += 1;
      idsInShot.add(track.trackId);
      const descriptors = sourcesByCacheKey.get(track.source.cacheKey) ?? new Set<string>();
      descriptors.add(stableHash(track.source));
      sourcesByCacheKey.set(track.source.cacheKey, descriptors);
    }
  }
  const collidingKeys = [...sourcesByCacheKey.entries()].filter(([, set]) => set.size > 1);
  const trackCount = projection.shots.reduce((n, shot) => n + shot.audio.tracks.length, 0);
  const sharedKeys = [...sourcesByCacheKey.values()].length;
  write('audio/cache-keys.json', {
    note: 'A shared source cache key must always mean a byte-identical artifact.',
    trackCount,
    distinctSourceKeys: sharedKeys,
    reusedArtifacts: trackCount - sharedKeys,
    collidingKeys: collidingKeys.map(([key]) => key),
  });
  record(
    'individual tracks are independently replaceable',
    duplicateTrackIds === 0 && collidingKeys.length === 0 ? 'PASS' : 'FAIL',
    `${trackCount} tracks addressable by unique id within their shot; ` +
      `${sharedKeys} distinct artifacts, ${trackCount - sharedKeys} reused across shots, ` +
      `${collidingKeys.length} key collisions`,
  );

  // -------------------------------------------------------- no paid provider needed
  const voiceRequests = projection.shots.flatMap((shot) => shot.audio.voiceRequests);
  record(
    'no paid provider required',
    voiceRequests.every((request) => request.requiresPaidProvider === false) ? 'PASS' : 'FAIL',
    `${voiceRequests.length} voice requests, none requiring a paid provider`,
  );
  record(
    'cloud render remains unauthorized',
    process.env.CLOUD_RENDER_ENABLED !== 'true' && process.env.ALLOW_PAID_GPU_LAUNCH !== 'true'
      ? 'PASS'
      : 'FAIL',
    'CLOUD_RENDER_ENABLED and ALLOW_PAID_GPU_LAUNCH are not "true"',
  );

  // ------------------------------------------------------ approved assets unchanged
  const assets = computeRenderAssetFingerprint(REPO_ROOT);
  write('asset-fingerprints.json', {
    note: 'Approved .blend assets, measured. Must equal the accepted FINAL_1080P pin.',
    measured: assets.fingerprint,
    acceptedPin: FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint,
    files: assets.files,
  });
  record(
    'approved Pip/Goat assets unchanged',
    assets.fingerprint === FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint ? 'PASS' : 'FAIL',
    `${assets.fingerprint.slice(0, 16)}… matches the accepted pin`,
  );

  const gitStatus = execFileSync('git', ['status', '--porcelain', '--', 'production-library'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  record(
    'production-library untouched',
    gitStatus === '' ? 'PASS' : 'FAIL',
    gitStatus === '' ? 'no modifications' : `unexpected changes: ${gitStatus}`,
  );

  // ------------------------------------------------------------- optional draft render
  if (!RENDER_REQUESTED) {
    record('draft Blender render', 'SKIPPED', 'not requested; pass --render to attempt it');
  } else if (!have('blender')) {
    record('draft Blender render', 'SKIPPED', 'Blender is not installed in this environment');
  } else {
    const shot = projection.shots[0];
    const renderDir = path.join(OUT_DIR, 'render');
    const metaPath = path.join(renderDir, 'shot_meta.json');
    const assetsPath = path.join(renderDir, 'assets.json');
    mkdirSync(renderDir, { recursive: true });
    writeFileSync(metaPath, `${JSON.stringify(shot.shotMeta, null, 2)}\n`);
    const library = path.join(REPO_ROOT, 'production-library');
    writeFileSync(
      assetsPath,
      `${JSON.stringify(
        [
          { id: 'meadow', role: 'meadow', localPath: path.join(library, 'environments/meadow_production.blend') },
          { id: 'map', role: 'map', localPath: path.join(library, 'props/adventure_map.blend') },
          { id: 'pip', role: 'pip', localPath: path.join(library, 'characters/pip_production.blend') },
          { id: 'goat', role: 'goat', localPath: path.join(library, 'characters/goat_production.blend') },
        ],
        null,
        2,
      )}\n`,
    );
    const result = spawnSync(
      'blender',
      [
        '-b',
        '-noaudio',
        '--python',
        path.join(REPO_ROOT, 'scripts/blender/assemble_scene.py'),
        '--',
        '--scene-id',
        shot.shotId,
        '--shot-meta',
        metaPath,
        '--assets-json-file',
        assetsPath,
        '--resolution',
        VALIDATION_SCENE_PLAN.delivery.resolution,
        '--fps',
        String(VALIDATION_SCENE_PLAN.delivery.fps),
        '--samples',
        '8',
        '--start-frame',
        '1',
        '--end-frame',
        '1',
        '--camera-preset',
        String((shot.shotMeta as { cameraPreset?: string }).cameraPreset ?? 'WIDE'),
        '--output-dir',
        renderDir,
      ],
      { encoding: 'utf8', env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', GALLIUM_DRIVER: 'llvmpipe' } },
    );
    write('render/blender.json', {
      exitCode: result.status,
      stderrTail: String(result.stderr ?? '').split('\n').slice(-25).join('\n'),
    });
    record(
      'draft Blender render',
      result.status === 0 ? 'PASS' : 'FAIL',
      `draft ${VALIDATION_SCENE_PLAN.delivery.resolution} still, 8 samples, local EEVEE (exit ${result.status})`,
    );
  }

  // ------------------------------------------------------------------------ summary
  const failed = checks.filter((c) => c.status === 'FAIL');
  const skipped = checks.filter((c) => c.status === 'SKIPPED');
  const summary = {
    harness: 'ddp-steps-1-8-local-validation',
    isAcceptanceRender: false,
    disclaimer:
      'Draft-resolution capability fixture for DDP Steps 1-8. NOT a FINAL_1080P ' +
      'acceptance render. The closed FINAL_1080P acceptance is separate, historical ' +
      'and untouched by this harness.',
    scene: {
      episodeId: content.episodeId,
      episodeTitle: VALIDATION_SCENE_PLAN.episodeTitle,
      seed: content.seed,
      shots: content.totals.shotCount,
      durationSeconds: content.totals.durationSeconds,
      resolution: VALIDATION_SCENE_PLAN.delivery.resolution,
      fps: VALIDATION_SCENE_PLAN.delivery.fps,
    },
    contentHash: content.contentHash,
    cacheKey: content.cacheKey,
    subsystemVersions: SUBSYSTEM_VERSIONS,
    estimatedCloudCostUsdIfEverAuthorized: content.totals.estimatedCloudCostUsd,
    paidProviderUsed: false,
    gpuLaunched: false,
    environment: {
      ffmpeg: have('ffmpeg'),
      blender: have('blender'),
      cloudRenderEnabled: process.env.CLOUD_RENDER_ENABLED === 'true',
      paidGpuLaunchAllowed: process.env.ALLOW_PAID_GPU_LAUNCH === 'true',
    },
    checks,
    totals: {
      passed: checks.filter((c) => c.status === 'PASS').length,
      failed: failed.length,
      skipped: skipped.length,
    },
  };
  write('summary.json', summary);

  console.log(
    `\n${summary.totals.passed} passed, ${summary.totals.failed} failed, ${summary.totals.skipped} skipped`,
  );
  console.log(`Evidence: ${path.relative(REPO_ROOT, OUT_DIR)}/`);
  console.log('Reminder: capability fixture at draft resolution, not an acceptance render.');
  if (failed.length > 0) process.exitCode = 1;
}

main();
