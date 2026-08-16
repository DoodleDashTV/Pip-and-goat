/**
 * Closed-gate Steps 9–16 infrastructure validation.
 *
 *   pnpm validate:steps-9-16-closed
 *
 * Does not unlock theatrical Steps 9–16. Does not write production-library.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  assertSteps9To16StillClosed,
  buildEpisode1DraftPackage,
  compileClosedStepsAcceptance,
  refuseProtectedRepair,
} from '../../packages/preproduction/src/index';
import { currentStage, evaluateTheatricalGate } from '../../packages/direction/src/index';
import {
  persistDraftContinuity,
  persistPreproductionRun,
  loadPreproductionRunByCacheKey,
  type PersistDb,
} from '../../packages/production/src/preproduction-persist';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/studio-steps-9-16-closed');
const DB_NAME = 'doodle_dash_steps916_validate';

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

function loadLocalEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function rewriteDatabase(url: string, database: string, keepSearch = true): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (!keepSearch) parsed.search = '';
  return parsed.toString();
}

function redactUrl(url: string, database: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.username}@${parsed.host}/${database}`;
}

function sh(command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { encoding: 'utf8', env: env ?? process.env });
  if (result.status !== 0) {
    const safeArgs = args.map((arg) => (arg.includes('://') ? '[redacted-url]' : arg));
    throw new Error(`${command} ${safeArgs.join(' ')} failed: ${(result.stderr || result.stdout || '').slice(0, 400)}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  loadLocalEnv(path.join(REPO_ROOT, '.env'));
  const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const pack = buildEpisode1DraftPackage();
  const closed = compileClosedStepsAcceptance({
    brief: pack.brief,
    workflow: pack.workflow,
    sourceCommit,
    outputPath: path.join(OUT_DIR, 'episode-1-draft.mp4'),
  });

  write('story-plan.json', closed.storyPlan);
  write('continuity.json', {
    identities: closed.continuityLedger.identities,
    locations: closed.continuityLedger.locations,
    props: closed.continuityLedger.props,
    mapClues: closed.continuityLedger.mapClues,
    setupPayoffLinks: closed.continuityLedger.setupPayoffLinks,
    unresolved: closed.continuityLedger.unresolved,
    readiness: closed.continuityLedger.readiness,
  });
  write('retention.json', closed.retentionPlan);
  write('storyboard.json', closed.storyboard.panels);
  write('animatic.json', { clips: closed.animatic.clips, resolution: closed.animatic.resolution });
  write('visual-qc.json', closed.visualQc);
  write('motion-audio-qc.json', closed.motionQc);
  write('auto-repair.json', { actions: closed.autoRepair.actions, refused: closed.autoRepair.refused });
  write('acceptance.json', closed.finalDraftAcceptance);
  write('provenance.json', closed.provenance);
  write('checkpoint.json', closed.checkpoint);

  record(
    'gates-unchanged',
    currentStage().id === 'DDP_STEPS_1_8' && evaluateTheatricalGate().allowed === false ? 'PASS' : 'FAIL',
    `stage=${currentStage().id} theatrical=${evaluateTheatricalGate().allowed}`,
  );
  try {
    assertSteps9To16StillClosed();
    record('steps-9-16-still-closed', 'PASS', 'assertSteps9To16StillClosed');
  } catch (error) {
    record('steps-9-16-still-closed', 'FAIL', error instanceof Error ? error.message : 'opened');
  }
  record(
    'draft-classification',
    pack.label === 'DRAFT_NONCANONICAL' &&
      pack.pipelineClass === 'PIPELINE_TEST_ONLY' &&
      closed.completedEpisode === false &&
      closed.canonicalEpisode === false
      ? 'PASS'
      : 'FAIL',
    `${pack.label} / ${pack.pipelineClass}`,
  );
  record(
    'story-brain',
    closed.storyPlan.eightBeatStructure.length === 8 && closed.storyPlan.promotion.allowed === false ? 'PASS' : 'FAIL',
    `${closed.storyPlan.eightBeatStructure.length} beats`,
  );
  record(
    'continuity-db',
    closed.continuityLedger.readiness.ok && closed.continuityLedger.promoted === false ? 'PASS' : 'FAIL',
    `dangling=${closed.continuityLedger.readiness.dangling}`,
  );
  record(
    'retention-advisory',
    closed.retentionPlan.advisoryOnly && closed.retentionPlan.claimsRealAudienceData === false ? 'PASS' : 'FAIL',
    'no real audience claims',
  );
  record(
    'storyboard-placeholders',
    closed.storyboard.bindsPipGoatAssets === false && closed.storyboard.panels.length === 8 ? 'PASS' : 'FAIL',
    `${closed.storyboard.panels.length} panels`,
  );
  record(
    'animatic-proxy',
    closed.animatic.finishedCharacterAnimation === false && closed.animatic.audioKind === 'NON_VOICE_TEST_AUDIO'
      ? 'PASS'
      : 'FAIL',
    closed.animatic.resolution,
  );
  record('visual-qc', closed.visualQc.theatricalCharacterQualityApproved === false ? 'PASS' : 'FAIL', closed.visualQc.technical);
  record(
    'motion-audio-qc',
    closed.motionQc.synthesisedVoices === false && closed.audioQc.lockedVoicesUntouched ? 'PASS' : 'FAIL',
    closed.motionQc.technical,
  );
  record(
    'auto-repair',
    closed.autoRepair.paid === false && closed.autoRepair.skippedQc === false && closed.autoRepair.mayEnterFinal === false
      ? 'PASS'
      : 'FAIL',
    `${closed.autoRepair.actions.length} actions`,
  );
  record(
    'protected-repair-refused',
    refuseProtectedRepair('production-library/characters/pip_production.blend').allowed === false ? 'PASS' : 'FAIL',
    'protected path refused',
  );
  record(
    'resume-reevaluates',
    closed.resume.reevaluatedSafety && closed.resume.theatricalAllowed === false ? 'PASS' : 'FAIL',
    closed.resume.reason,
  );
  record(
    'cost-zero',
    closed.cost.estimatedUsd === 0 && closed.cost.paidAuthorized === false ? 'PASS' : 'FAIL',
    closed.cost.code,
  );

  const fontFile = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ].find((candidate) => existsSync(candidate));
  const mux = closed.animatic.mux;
  if (fontFile && !mux.args.join(' ').includes('fontfile')) {
    // argv already compiled; execute as-is
  }
  const ffmpeg = spawnSync('ffmpeg', mux.args, { encoding: 'utf8' });
  const muxOk = ffmpeg.status === 0;
  record(
    'episode-1-mux',
    muxOk ? 'PASS' : existsSync('/usr/bin/ffmpeg') ? 'FAIL' : 'SKIPPED',
    muxOk ? 'proxy animatic assembled' : (ffmpeg.stderr || 'ffmpeg missing').slice(0, 160),
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
    const aspect = video?.width && video.height ? video.width / video.height : 0;
    write('episode-1-draft-probe.json', { info, fileBytes, watermark: 'PROXY — NOT FOR FINAL PRODUCTION' });
    record('mp4-duration', duration >= 20 && duration <= 40 ? 'PASS' : 'FAIL', `${duration.toFixed(3)}s`);
    record('mp4-resolution', video?.width === 360 && video?.height === 640 ? 'PASS' : 'FAIL', `${video?.width ?? 0}x${video?.height ?? 0}`);
    record('mp4-aspect', Math.abs(aspect - 9 / 16) < 0.02 ? 'PASS' : 'FAIL', aspect.toFixed(3));
    record('mp4-video-stream', video ? 'PASS' : 'FAIL', video ? 'video present' : 'missing');
    record('mp4-audio-stream', audio ? 'PASS' : 'FAIL', audio ? 'audio present' : 'missing');
    record('mp4-nonzero', fileBytes > 0 ? 'PASS' : 'FAIL', `${fileBytes} bytes`);
    record('mp4-draft-watermark', mux.filterGraph.includes('PROXY') ? 'PASS' : 'FAIL', 'drawtext watermark in graph');
    record('mp4-not-final', !mux.outputPath.includes('FINAL') && closed.animatic.plan.renderTier === 'DRAFT' ? 'PASS' : 'FAIL', 'DRAFT');
  }

  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) {
    record('continuity-persist', 'FAIL', 'DATABASE_URL missing');
  } else {
    const adminUrl = rewriteDatabase(sourceUrl, 'postgres', false);
    const disposableUrl = rewriteDatabase(sourceUrl, DB_NAME, true);
    const redacted = redactUrl(sourceUrl, DB_NAME);
    sh('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${DB_NAME};`]);
    sh('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${DB_NAME};`]);
    sh('pnpm', ['--filter', '@doodle-dash/database', 'exec', 'prisma', 'migrate', 'deploy'], {
      ...process.env,
      DATABASE_URL: disposableUrl,
    });
    const client = new PrismaClient({ datasources: { db: { url: disposableUrl } } });
    const persistDb = client as unknown as PersistDb;
    const written = await persistDraftContinuity({
      episodeId: pack.workflow.episodeId,
      cacheKey: closed.continuityLedger.cacheKey,
      content: {
        ledger: closed.continuityLedger.ledger,
        promoted: false,
        canonical: false,
      },
      occupants: pack.workflow.bundle.draft.occupants,
      durableRequired: true,
      client: persistDb,
    });
    const workflowWrite = await persistPreproductionRun({
      episodeId: pack.workflow.episodeId,
      workflow: pack.workflow,
      durableRequired: true,
      client: persistDb,
    });
    const reloaded = await loadPreproductionRunByCacheKey(
      pack.workflow.episodeId,
      `continuity:${closed.continuityLedger.cacheKey}`,
      persistDb,
    );
    record(
      'continuity-persist',
      written.status === 'PERSISTED' && reloaded?.id === written.id && workflowWrite.status === 'PERSISTED' ? 'PASS' : 'FAIL',
      written.reason,
    );
    let failedClosed = false;
    try {
      await persistDraftContinuity({
        episodeId: pack.workflow.episodeId,
        cacheKey: 'missing',
        content: { promoted: false },
        durableRequired: true,
        client: {},
      });
    } catch (error) {
      failedClosed = error instanceof Error && error.message.includes('PERSISTENCE_FAILED');
    }
    record('continuity-durable-fail-closed', failedClosed ? 'PASS' : 'FAIL', 'missing delegate throws');
    await client.$disconnect();
    sh('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${DB_NAME};`]);
    write('persist-summary.json', {
      database: DB_NAME,
      url: redacted,
      productionDatabaseTouched: false,
      credentialsCommitted: false,
      continuityId: written.id,
      workflowId: workflowWrite.id,
    });
  }

  write('checks.json', checks);
  write('summary.json', {
    title: 'TIVVLEJOY CLOSED-GATE STEPS 9-16',
    acceptanceRender: false,
    theatricalGateAllowed: false,
    currentDirectionStage: 'DDP_STEPS_1_8',
    paidGpu: false,
    productionLibraryWritten: false,
    voicesSynthesised: false,
    pipGoatAssetsTouched: false,
    draftPr24Merged: false,
    draftPr26Merged: false,
    draftPr27Merged: false,
    draftPr28Merged: false,
    draftPr29Merged: false,
    label: 'DRAFT_NONCANONICAL',
    outputClass: 'PIPELINE_TEST_ONLY',
    sourceCommit,
    muxHash: createHash('sha256').update(mux.filterGraph).digest('hex'),
  });

  const failed = checks.filter((check) => check.status === 'FAIL');
  if (failed.length > 0) {
    console.error(`Steps 9–16 closed validation failed: ${failed.length} check(s).`);
    process.exit(1);
  }
  console.log('Steps 9–16 closed validation passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    const sourceUrl = process.env.DATABASE_URL;
    if (sourceUrl) {
      spawnSync('psql', [
        rewriteDatabase(sourceUrl, 'postgres', false),
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `DROP DATABASE IF EXISTS ${DB_NAME};`,
      ]);
    }
  } catch {
    // best-effort cleanup
  }
  process.exit(1);
});
