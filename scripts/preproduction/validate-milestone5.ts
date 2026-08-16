/**
 * Local validation harness for Studio Milestone 5.
 *
 * Walks the episode-production workflow, compiles local FFmpeg argv, and
 * proves create-episode / generate-final / paid-resource refusals.
 *
 * THIS IS NOT AN ACCEPTANCE RENDER. No paid GPU, no production-library write,
 * no theatrical binding, no Steps 9–16. Draft PR #26 stays unmerged.
 *
 *   pnpm validate:milestone5
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  CANONICAL_STORY_BRIEF,
  FORBIDDEN_FINAL_INTENT,
  PROXY_PIPELINE_BRIEF,
  advanceWorkflow,
  buildEpisode1DraftPackage,
  compileAnimaticAssembly,
  compileAudioMix,
  compileDraftMux,
  evaluateAudioTiming,
  evaluateEpisodeCreateSafety,
  evaluateEpisodeLaunchSafety,
  planSteps9To16Infrastructure,
  summarizeWorkflow,
} from '../../packages/preproduction/src/index';
import { currentStage, evaluateTheatricalGate } from '../../packages/direction/src/index';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/milestone-5-workflow');

type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';
type Check = { name: string; status: CheckStatus; detail: string };
const checks: Check[] = [];

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function write(relative: string, value: unknown): void {
  const target = path.join(OUT_DIR, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function have(bin: string): boolean {
  return spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0;
}

const proxy = advanceWorkflow(PROXY_PIPELINE_BRIEF);
const canonical = advanceWorkflow(CANONICAL_STORY_BRIEF);
const forbiddenLaunch = evaluateEpisodeLaunchSafety({
  command: 'generate-final',
  intent: 'FINAL',
  characterMode: 'PROXY',
  occupants: FORBIDDEN_FINAL_INTENT.occupants,
  allowPaidGpu: true,
  writeProductionLibrary: true,
});
const createProxy = evaluateEpisodeCreateSafety({
  command: 'create-episode',
  characterMode: 'PROXY',
  characterCodes: ['PROXY_NONCANONICAL_BIRD_A'],
});
const createPlain = evaluateEpisodeCreateSafety({
  command: 'create-episode',
  intent: 'DRAFT',
});
const theatrical = evaluateTheatricalGate();

const fontFile = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
].find((candidate) => existsSync(candidate));

const animaticCmd = compileAnimaticAssembly({
  animatic: proxy.bundle.animatic,
  audio: proxy.bundle.audio,
  outputPath: path.join(OUT_DIR, 'proxy-animatic.mp4'),
  fontFile,
});
const mixCmd = compileAudioMix({
  audio: proxy.bundle.audio,
  durationSeconds: proxy.bundle.animatic.totalFrames / proxy.bundle.animatic.fps,
  outputPath: path.join(OUT_DIR, 'proxy-mix.wav'),
});
const muxCmd = compileDraftMux({
  animatic: proxy.bundle.animatic,
  audio: proxy.bundle.audio,
  outputPath: path.join(OUT_DIR, 'proxy-draft.mp4'),
  fontFile,
});
const unmarkedFinal = evaluateEpisodeLaunchSafety({ command: 'generate-final', intent: 'FINAL' });
const episode1 = buildEpisode1DraftPackage();
const closed = planSteps9To16Infrastructure();

write('proxy-workflow.json', summarizeWorkflow(proxy));
write('canonical-workflow.json', summarizeWorkflow(canonical));
write('forbidden-launch.json', forbiddenLaunch);
write('animatic-command.json', animaticCmd);
write('audio-mix-command.json', mixCmd);
write('mux-command.json', muxCmd);
write('episode-1-draft.json', episode1.summary);
write('steps-9-16-closed.json', closed);
write('summary.json', {
  title: 'TIVVLEJOY STUDIO MILESTONE 5 — episode workflow + launch safety',
  acceptanceRender: false,
  theatricalGateAllowed: theatrical.allowed,
  currentDirectionStage: currentStage().id,
  paidGpu: false,
  productionLibraryWritten: false,
  draftPr26Merged: false,
});

record(
  'proxy-workflow',
  proxy.terminal === 'PIPELINE_TEST_COMPLETE' &&
    !proxy.mayContinueToFinal &&
    proxy.bundle.scenePlan === null
    ? 'PASS'
    : 'FAIL',
  `${proxy.terminal} · final=${proxy.mayContinueToFinal} · scenePlan=${proxy.bundle.scenePlan !== null}`,
);
record(
  'canonical-workflow',
  canonical.terminal === 'STORY_PLAN_READY' && canonical.bundle.scenePlan !== null ? 'PASS' : 'FAIL',
  `${canonical.terminal} · scenePlan=${canonical.bundle.scenePlan !== null}`,
);
record(
  'forbidden-terminals',
  proxy.mayContinueToTheatrical === false && proxy.mayPublish === false ? 'PASS' : 'FAIL',
  'workflow cannot reach THEATRICAL or PUBLISHING',
);
record(
  'proxy-create-refused',
  createProxy.allowed ? 'FAIL' : 'PASS',
  createProxy.allowed ? 'create-episode incorrectly allowed a proxy' : createProxy.code,
);
record(
  'plain-create-allowed',
  createPlain.allowed ? 'PASS' : 'FAIL',
  createPlain.reason,
);
record(
  'proxy-final-launch-refused',
  forbiddenLaunch.allowed ? 'FAIL' : 'PASS',
  forbiddenLaunch.allowed ? 'generate-final incorrectly allowed a proxy' : forbiddenLaunch.code,
);
record(
  'unmarked-generate-final-refused',
  unmarkedFinal.allowed ? 'FAIL' : 'PASS',
  unmarkedFinal.allowed ? 'unmarked generate-final bypassed FINAL_RENDER refusal' : unmarkedFinal.code,
);
record(
  'theatrical-still-closed',
  theatrical.allowed ? 'FAIL' : 'PASS',
  theatrical.allowed ? 'theatrical gate opened' : `stage=${currentStage().id}`,
);
record(
  'assembly-compiled',
  animaticCmd.paid === false &&
    animaticCmd.writesProductionLibrary === false &&
    animaticCmd.args.includes('lavfi') &&
    mixCmd.args.includes('lavfi')
    ? 'PASS'
    : 'FAIL',
  `animatic ${animaticCmd.args.length} args · mix ${mixCmd.args.length} args`,
);

function runFfmpeg(name: string, args: readonly string[]): boolean {
  const ffmpegAvailable = have('ffmpeg');
  if (!ffmpegAvailable) {
    record(name, 'SKIPPED', 'ffmpeg not installed; argv written but not executed');
    return false;
  }
  const result = spawnSync('ffmpeg', [...args], { encoding: 'utf8' });
  const stderr = result.stderr || '';
  if (result.status === 0) {
    record(name, 'PASS', 'executed');
    return true;
  }
  if (/font|drawtext/i.test(stderr) && !fontFile) {
    record(name, 'SKIPPED', 'ffmpeg present but no drawtext font in this environment');
    return false;
  }
  record(name, 'FAIL', stderr.slice(0, 240));
  return false;
}

const videoOk = runFfmpeg('ffmpeg-visual-holds', animaticCmd.args);
const audioOk = runFfmpeg('ffmpeg-synthetic-audio', mixCmd.args);
const muxOk = runFfmpeg('ffmpeg-draft-mux', muxCmd.args);

if (muxOk && have('ffprobe')) {
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
      muxCmd.outputPath,
    ],
    { encoding: 'utf8' },
  );
  const info = JSON.parse(probed.stdout || '{}') as {
    format?: { duration?: string; size?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const duration = Number(info.format?.duration ?? 0);
  const size = Number(info.format?.size ?? 0);
  const video = info.streams?.find((stream) => stream.codec_type === 'video');
  const audio = info.streams?.find((stream) => stream.codec_type === 'audio');
  const fileBytes = existsSync(muxCmd.outputPath) ? statSync(muxCmd.outputPath).size : 0;
  const timing = evaluateAudioTiming({
    animatic: proxy.bundle.animatic,
    audio: proxy.bundle.audio,
    measuredDurationSeconds: duration,
  });
  write('draft-mux-probe.json', { info, timing, fileBytes });
  record(
    'draft-mp4-duration',
    timing.withinTolerance ? 'PASS' : 'FAIL',
    `planned=${timing.plannedSeconds.toFixed(3)}s measured=${duration.toFixed(3)}s`,
  );
  record(
    'draft-mp4-resolution',
    video?.width === 360 && video?.height === 640 ? 'PASS' : 'FAIL',
    `${video?.width ?? 0}x${video?.height ?? 0}`,
  );
  record('draft-mp4-audio-stream', audio ? 'PASS' : 'FAIL', audio ? 'audio stream present' : 'missing audio');
  record('draft-mp4-nonzero', fileBytes > 0 && size > 0 ? 'PASS' : 'FAIL', `${fileBytes} bytes`);
} else if (!have('ffprobe')) {
  record('draft-mp4-duration', 'SKIPPED', 'ffprobe not installed');
  record('draft-mp4-resolution', 'SKIPPED', 'ffprobe not installed');
  record('draft-mp4-audio-stream', 'SKIPPED', 'ffprobe not installed');
  record('draft-mp4-nonzero', existsSync(muxCmd.outputPath) && statSync(muxCmd.outputPath).size > 0 ? 'PASS' : 'SKIPPED', 'file check only');
}

record(
  'episode-1-draft-noncanonical',
  episode1.canonical === false && episode1.productionEligible === false ? 'PASS' : 'FAIL',
  episode1.label,
);
record(
  'steps-9-16-still-closed',
  closed.opened === false && closed.gateAllowed === false && closed.currentStage === 'DDP_STEPS_1_8'
    ? 'PASS'
    : 'FAIL',
  `opened=${closed.opened} stage=${closed.currentStage}`,
);
void videoOk;
void audioOk;

const failed = checks.filter((check) => check.status === 'FAIL');
write('checks.json', checks);
if (failed.length > 0) {
  console.error(`Milestone 5 validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log('Milestone 5 validation passed.');
