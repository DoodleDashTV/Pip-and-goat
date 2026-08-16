/**
 * Step 32b — Golden-scene regression framework (synthetic/local only).
 *
 * Does not use Pip, Goat, locked voices, or production-library.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { EPISODE_1_DRAFT_BRIEF } from '../episode1';
import { advanceWorkflow } from '../workflow';
import { compileClosedStepsAcceptance } from '../steps-closed';
import { stamp, DRAFT_NONCANONICAL, PIPELINE_TEST_ONLY } from './labels';

export const GOLDEN_FIXTURE_SEED = 'tivvlejoy-studio-completion-golden-v1' as const;

export function buildGoldenFixture() {
  const brief = {
    ...EPISODE_1_DRAFT_BRIEF,
    seed: GOLDEN_FIXTURE_SEED,
    episodeId: 'E1_GOLDEN_INFRA_TEST',
    title: 'Draft golden fixture — infrastructure only',
    storyApproved: false,
  };
  const workflow = advanceWorkflow(brief);
  const closed = compileClosedStepsAcceptance({
    brief,
    workflow,
    sourceCommit: 'INFRASTRUCTURE_TEST',
    outputPath: 'artifacts/studio-completion-25-32/golden-proxy.mp4',
  });
  return {
    seed: GOLDEN_FIXTURE_SEED,
    label: DRAFT_NONCANONICAL,
    outputClass: PIPELINE_TEST_ONLY,
    usesPipGoat: false as const,
    usesLockedVoices: false as const,
    writesProductionLibrary: false as const,
    structure: {
      beats: workflow.bundle.draft.beats.length,
      panels: workflow.bundle.storyboard.panels.length,
      clips: workflow.bundle.animatic.clips.length,
      terminal: workflow.terminal,
      storyCacheKey: workflow.bundle.draft.cacheKey,
      continuityCacheKey: workflow.bundle.continuity.cacheKey,
      storyboardCacheKey: workflow.bundle.storyboard.cacheKey,
      animaticCacheKey: workflow.bundle.animatic.cacheKey,
      qcTechnical: closed.visualQc.technical,
      repairPaid: closed.autoRepair.paid,
      provenanceIncludesPipGoat: closed.provenance.includesPipGoatAssets,
    },
    expectedHash: createHash('sha256')
      .update(
        JSON.stringify({
          seed: GOLDEN_FIXTURE_SEED,
          beats: workflow.bundle.draft.beats.length,
          story: workflow.bundle.draft.cacheKey,
          continuity: workflow.bundle.continuity.cacheKey,
          storyboard: workflow.bundle.storyboard.cacheKey,
          animatic: workflow.bundle.animatic.cacheKey,
        }),
      )
      .digest('hex'),
  };
}

export function detectGoldenRegression(
  expected: ReturnType<typeof buildGoldenFixture>,
  actual: ReturnType<typeof buildGoldenFixture>,
): { regressed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!actual) reasons.push('missing output');
  if (actual.structure.beats !== expected.structure.beats) reasons.push('structural regression: beats');
  if (actual.structure.panels !== expected.structure.panels) reasons.push('structural regression: panels');
  if (actual.structure.clips !== expected.structure.clips) reasons.push('structural regression: clips');
  if (actual.expectedHash !== expected.expectedHash) reasons.push('deterministic hash mismatch');
  if (actual.structure.qcTechnical !== expected.structure.qcTechnical) reasons.push('gate change: QC');
  if (actual.usesPipGoat || actual.writesProductionLibrary) reasons.push('protected-path write or Pip/Goat binding');
  if (actual.label !== DRAFT_NONCANONICAL || actual.outputClass !== PIPELINE_TEST_ONLY) {
    reasons.push('forbidden label');
  }
  return { regressed: reasons.length > 0, reasons };
}

export function compileGoldenSceneReport() {
  const expected = buildGoldenFixture();
  const actual = buildGoldenFixture();
  const regression = detectGoldenRegression(expected, actual);
  return stamp({
    seed: GOLDEN_FIXTURE_SEED,
    expectedHash: expected.expectedHash,
    actualHash: actual.expectedHash,
    structure: actual.structure,
    regression,
    tolerance: 'Exact hashes for planner documents. Media mux bytes may vary by ffmpeg build.',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.golden,
  });
}
