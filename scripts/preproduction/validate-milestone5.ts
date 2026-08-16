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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  CANONICAL_STORY_BRIEF,
  FORBIDDEN_FINAL_INTENT,
  PROXY_PIPELINE_BRIEF,
  advanceWorkflow,
  compileAnimaticAssembly,
  compileAudioMix,
  evaluateEpisodeCreateSafety,
  evaluateEpisodeLaunchSafety,
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

write('proxy-workflow.json', summarizeWorkflow(proxy));
write('canonical-workflow.json', summarizeWorkflow(canonical));
write('forbidden-launch.json', forbiddenLaunch);
write('animatic-command.json', animaticCmd);
write('audio-mix-command.json', mixCmd);
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

const ffmpegAvailable = have('ffmpeg');
if (!ffmpegAvailable) {
  record('ffmpeg-animatic', 'SKIPPED', 'ffmpeg not installed; argv written but not executed');
} else {
  const result = spawnSync('ffmpeg', animaticCmd.args, { encoding: 'utf8' });
  const stderr = result.stderr || '';
  if (result.status === 0) {
    record('ffmpeg-animatic', 'PASS', 'local draft animatic assembled');
  } else if (/font|drawtext/i.test(stderr) && !fontFile) {
    record('ffmpeg-animatic', 'SKIPPED', 'ffmpeg present but no drawtext font in this environment');
  } else {
    record('ffmpeg-animatic', 'FAIL', stderr.slice(0, 240));
  }
}

const failed = checks.filter((check) => check.status === 'FAIL');
write('checks.json', checks);
if (failed.length > 0) {
  console.error(`Milestone 5 validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log('Milestone 5 validation passed.');
