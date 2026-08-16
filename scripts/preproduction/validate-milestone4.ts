/**
 * Local validation harness for Studio Milestone 4.
 *
 * Runs the proxy pipeline fixture and the canonical story fixture, writes
 * evidence, and proves the proxy output gate refuses final production intents.
 *
 * THIS IS NOT AN ACCEPTANCE RENDER. No paid GPU, no production-library write,
 * no theatrical binding, no Steps 9–16.
 *
 *   pnpm validate:milestone4
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_STORY_BRIEF,
  FORBIDDEN_FINAL_INTENT,
  PROXY_PIPELINE_BRIEF,
  evaluateProductionOutputGate,
  runPreproduction,
} from '../../packages/preproduction/src/index';
import { currentStage, evaluateTheatricalGate } from '../../packages/direction/src/index';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/milestone-4-preproduction');

type CheckStatus = 'PASS' | 'FAIL';
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

const proxy = runPreproduction(PROXY_PIPELINE_BRIEF);
const canonical = runPreproduction(CANONICAL_STORY_BRIEF);
const forbidden = evaluateProductionOutputGate(FORBIDDEN_FINAL_INTENT);
const theatrical = evaluateTheatricalGate();

write('proxy-bundle.json', {
  episodeId: proxy.draft.episodeId,
  outputClass: proxy.outputClass,
  occupants: proxy.draft.occupants,
  status: proxy.status,
  cacheKey: proxy.cacheKey,
  scenePlanEmitted: proxy.scenePlan !== null,
  qc: proxy.qc,
  gate: proxy.gate,
  issues: proxy.issues,
});
write('canonical-bundle.json', {
  episodeId: canonical.draft.episodeId,
  outputClass: canonical.outputClass,
  occupants: canonical.draft.occupants,
  status: canonical.status,
  cacheKey: canonical.cacheKey,
  scenePlanEmitted: canonical.scenePlan !== null,
  delivery: canonical.scenePlan?.delivery,
  issues: canonical.issues,
});
write('forbidden-final-gate.json', forbidden);
write('summary.json', {
  title: 'TIVVLEJOY STUDIO MILESTONE 4 — character-independent pre-production',
  acceptanceRender: false,
  theatricalGateAllowed: theatrical.allowed,
  currentDirectionStage: currentStage().id,
  paidGpu: false,
  productionLibraryWritten: false,
});

record(
  'proxy-pipeline',
  proxy.status === 'PASS' && proxy.outputClass === 'PIPELINE_TEST' && proxy.scenePlan === null ? 'PASS' : 'FAIL',
  `${proxy.status} · ${proxy.outputClass} · scenePlan=${proxy.scenePlan !== null}`,
);
record(
  'canonical-scene-plan',
  canonical.status === 'PASS' && canonical.scenePlan !== null ? 'PASS' : 'FAIL',
  `${canonical.status} · scenePlan=${canonical.scenePlan !== null}`,
);
record(
  'proxy-final-refused',
  forbidden.allowed ? 'FAIL' : 'PASS',
  forbidden.allowed ? 'gate incorrectly allowed FINAL' : forbidden.codes.join(', '),
);
record(
  'theatrical-still-closed',
  theatrical.allowed ? 'FAIL' : 'PASS',
  theatrical.allowed ? 'theatrical gate opened' : `stage=${currentStage().id}`,
);
record(
  'determinism',
  runPreproduction(PROXY_PIPELINE_BRIEF).cacheKey === proxy.cacheKey ? 'PASS' : 'FAIL',
  'proxy fixture cache key is stable',
);

const failed = checks.filter((check) => check.status === 'FAIL');
write('checks.json', checks);
if (failed.length > 0) {
  console.error(`Milestone 4 validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log('Milestone 4 validation passed.');
