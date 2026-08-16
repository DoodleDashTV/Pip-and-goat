/**
 * Local validation for character-independent studio hardening 17–24.
 *
 *   pnpm validate:studio-hardening
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildEpisode1DraftPackage,
  buildProvenance,
  checkpointWorkflow,
  compileDraftMux,
  detectCorruption,
  draftAnalytics,
  estimateDraftCost,
  invalidateShots,
  listDraftReferenceProvenance,
  planPartialRerender,
  profileLocalWorkflow,
  restoreCachedPlan,
  resumeFromCheckpoint,
  rollbackArtifact,
  trackShotDependencies,
} from '../../packages/preproduction/src/index';
import { currentStage as directionStage, evaluateTheatricalGate as theatricalGate } from '../../packages/direction/src/index';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/studio-hardening-17-24');

type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';
const checks: Array<{ name: string; status: CheckStatus; detail: string }> = [];

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function write(relative: string, value: unknown): void {
  const target = path.join(OUT_DIR, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const pack = buildEpisode1DraftPackage();
const deps = trackShotDependencies({
  draft: pack.workflow.bundle.draft,
  storyboard: pack.workflow.bundle.storyboard,
  animatic: pack.workflow.bundle.animatic,
  shotPlan: pack.workflow.bundle.shotPlan,
});
const invalidated = invalidateShots(deps.dependencies, {
  kind: 'BEAT',
  id: pack.workflow.bundle.draft.beats[0]!.beatId,
});
const cache = planPartialRerender({
  animatic: pack.workflow.bundle.animatic,
  orchestration: pack.workflow.bundle.orchestration,
  shotPlan: pack.workflow.bundle.shotPlan,
  dirtyClipIds: pack.workflow.bundle.animatic.clips[0] ? [pack.workflow.bundle.animatic.clips[0].clipId] : [],
});
const reuseId = cache.reuse[0];
const restored = restoreCachedPlan({
  cacheKey: reuseId ? cache.cacheKeys[reuseId]! : 'none',
  plan: pack.workflow.bundle.shotPlan,
});
const profile = profileLocalWorkflow(pack.brief);
const provenance = buildProvenance({
  sourceCommit,
  episodeId: pack.workflow.episodeId,
  cacheKey: pack.workflow.cacheKey,
  inputs: { seed: pack.brief.seed, occupants: pack.workflow.bundle.draft.occupants },
  mediaCommandHash: sha256(pack.mux.filterGraph),
  qcHash: pack.workflow.bundle.qc.cacheKey,
});
const cost = estimateDraftCost({ estimateUsd: 4 });
const analytics = draftAnalytics(pack.workflow);
const checkpoint = checkpointWorkflow(pack.workflow);
const resume = resumeFromCheckpoint({ checkpoint, run: pack.workflow });
const rolled = rollbackArtifact(pack.versions[0]!, 1);

write('episode-1-package.json', {
  label: pack.label,
  canonical: pack.canonical,
  occupants: pack.workflow.bundle.draft.occupants,
  continuityOk: pack.continuity.ok,
  canonAllowed: pack.canon.allowed,
  shotCount: pack.dependencies.dependencies.length,
  storyNotes: pack.storyNotes,
  validation: pack.validation,
});
write('manifests.json', pack.manifests);
write('provenance.json', provenance);
write('analytics.json', analytics);
write('checkpoint.json', checkpoint);
write('profile.json', profile);
write('dependencies.json', {
  dependencies: deps.dependencies,
  invalidated,
  paidRerender: invalidated.paidRerender,
});
write('cache-plan.json', {
  reuse: cache.reuse,
  rerenderLocal: cache.rerenderLocal,
  cacheKeys: cache.cacheKeys,
  maySkipQc: cache.maySkipQc,
  mayEnterFinal: cache.mayEnterFinal,
});

record(
  'gates-unchanged',
  directionStage().id === 'DDP_STEPS_1_8' && theatricalGate().allowed === false ? 'PASS' : 'FAIL',
  `stage=${directionStage().id} theatrical=${theatricalGate().allowed}`,
);
record(
  'episode-1-draft',
  pack.label === 'DRAFT_NONCANONICAL' && pack.canonical === false && pack.canon.allowed === false ? 'PASS' : 'FAIL',
  pack.label,
);
record(
  'episode-1-continuity-deps',
  pack.validation.continuityOk && pack.validation.missingLinks === 0 && pack.validation.canonAllowed === false
    ? 'PASS'
    : 'FAIL',
  `dangling=${pack.validation.dangling} missingLinks=${pack.validation.missingLinks}`,
);
record(
  'versioning-rollback-not-canon',
  rolled.current.canonical === false && rolled.current.label === 'DRAFT_NONCANONICAL' ? 'PASS' : 'FAIL',
  `version=${rolled.current.version}`,
);
record(
  'shot-invalidation',
  invalidated.dirtyShotIds.length > 0 && invalidated.paidRerender === false ? 'PASS' : 'FAIL',
  `${invalidated.dirtyShotIds.length} dirty`,
);
record(
  'cache-restore-reevaluates',
  restored.mustReevaluateQc && restored.mustReevaluateSafety && restored.mayEnterFinal === false ? 'PASS' : 'FAIL',
  'restore cannot skip QC/safety',
);
record('profile-local', profile.paid === false ? 'PASS' : 'FAIL', `${profile.elapsedMs}ms`);
record(
  'provenance',
  provenance.includesPipGoatAssets === false && provenance.sourceCommit === sourceCommit ? 'PASS' : 'FAIL',
  provenance.provenanceHash.slice(0, 12),
);
record('cost-refuses-spend', cost.estimatedUsd === 0 && cost.paidAuthorized === false && cost.refused ? 'PASS' : 'FAIL', cost.code);
record(
  'recovery-reevaluates',
  resume.reevaluatedSafety && resume.theatricalAllowed === false && resume.paidRetryAllowed === false ? 'PASS' : 'FAIL',
  resume.reason,
);
record(
  'corruption-clean',
  detectCorruption(checkpoint, pack.workflow).corrupt === false ? 'PASS' : 'FAIL',
  'payload hash matches',
);
record(
  'references-no-production-library',
  listDraftReferenceProvenance().every((entry) => entry.productionLibraryPath === null) ? 'PASS' : 'FAIL',
  'planning labels only',
);

const fontFile = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
].find((candidate) => existsSync(candidate));
const mux = compileDraftMux({
  animatic: pack.workflow.bundle.animatic,
  audio: pack.workflow.bundle.audio,
  outputPath: path.join(OUT_DIR, 'episode-1-draft.mp4'),
  fontFile,
});
const ffmpeg = spawnSync('ffmpeg', mux.args, { encoding: 'utf8' });
const muxOk = ffmpeg.status === 0;
record(
  'episode-1-mux',
  muxOk ? 'PASS' : existsSync('/usr/bin/ffmpeg') ? 'FAIL' : 'SKIPPED',
  muxOk ? 'revised proxy animatic assembled' : (ffmpeg.stderr || 'ffmpeg missing').slice(0, 160),
);

if (muxOk) {
  const probed = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size',
      '-show_entries',
      'stream=codec_type,width,height',
      '-of',
      'json',
      mux.outputPath,
    ],
    { encoding: 'utf8' },
  );
  const info = JSON.parse(probed.stdout || '{}') as {
    format?: { duration?: string; size?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const duration = Number(info.format?.duration ?? 0);
  const video = info.streams?.find((stream) => stream.codec_type === 'video');
  const audio = info.streams?.find((stream) => stream.codec_type === 'audio');
  const fileBytes = existsSync(mux.outputPath) ? statSync(mux.outputPath).size : 0;
  write('episode-1-draft-probe.json', { info, fileBytes });
  record(
    'episode-1-mp4-duration',
    duration >= 20 && duration <= 40 ? 'PASS' : 'FAIL',
    `${duration.toFixed(3)}s`,
  );
  record(
    'episode-1-mp4-resolution',
    video?.width === 360 && video?.height === 640 ? 'PASS' : 'FAIL',
    `${video?.width ?? 0}x${video?.height ?? 0}`,
  );
  record('episode-1-mp4-audio-stream', audio ? 'PASS' : 'FAIL', audio ? 'audio stream present' : 'missing audio');
  record('episode-1-mp4-nonzero', fileBytes > 0 ? 'PASS' : 'FAIL', `${fileBytes} bytes`);
}

write('checks.json', checks);
const failed = checks.filter((check) => check.status === 'FAIL');
if (failed.length > 0) {
  console.error(`Studio hardening validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log('Studio hardening validation passed.');
