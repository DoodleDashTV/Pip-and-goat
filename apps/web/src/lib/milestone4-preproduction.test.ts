/**
 * Studio Milestone 4 — character-independent pre-production.
 *
 * Pure package tests: no database, no network, no paid provider. The proxy
 * fixture is the pipeline-test path. The canonical fixture may emit a DRAFT
 * ScenePlan. Neither path may write production-library, open Steps 9–16, or
 * label a master.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_STORY_BRIEF,
  CHILD_SAFE_REFUSALS,
  FORBIDDEN_FINAL_INTENT,
  LOCKED_VOICE_IDS,
  PREPRODUCTION_SCHEMA_VERSION,
  PROXY_LABEL,
  PROXY_PIPELINE_BRIEF,
  PROXY_VOICE_PLACEHOLDER,
  PROXY_WATERMARK,
  VERTICAL_CAMERA_RULES,
  assertNoProxyInFinalOutput,
  evaluateLocalSpend,
  evaluateProductionOutputGate,
  isProxyCode,
  mayEmitScenePlan,
  planStory,
  runPreproduction,
  voiceIdForOccupant,
} from '@doodle-dash/preproduction';
import {
  currentStage,
  direct,
  evaluateTheatricalGate,
  FINAL_1080P_ACCEPTANCE,
} from '@doodle-dash/direction';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { assertManifestSafeForFinal } from '@doodle-dash/production';

const repoRoot = path.resolve(__dirname, '../../..');

const proxyBundle = runPreproduction(PROXY_PIPELINE_BRIEF);
const canonicalBundle = runPreproduction(CANONICAL_STORY_BRIEF);

describe('Milestone 4 isolation and protections', () => {
  it('does not use empty main or PR #24 as a base', () => {
    const progress = readFileSync(path.join(repoRoot, 'TRIVVLEJOY_PROGRESS.md'), 'utf8');
    expect(progress).toContain('cursor/trivvlejoy-milestone-3-1ebc');
    expect(progress).toContain('character-independent');
    expect(progress).toContain('Do not continue the paused Pip conversion');
  });

  it('leaves the theatrical / Steps 9–16 gate closed', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(proxyBundle.gate.codes).toContain('THEATRICAL_GATE_STILL_CLOSED');
    expect(proxyBundle.gate.codes).toContain('STEPS_9_16_STILL_BLOCKED');
  });

  it('preserves the accepted FINAL_1080P fingerprint constants', () => {
    expect(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint).toBe(
      '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
    );
    expect(FINAL_1080P_ACCEPTANCE.acceptedArtifactSha256).toBe(
      'aefdd0b05881d336c489ba984a891f04eec0a44e889c6b3b3f61002554655458',
    );
  });

  it('does not write production-library from the preproduction package', () => {
    const pipeline = readFileSync(path.join(repoRoot, 'packages/preproduction/src/pipeline.ts'), 'utf8');
    expect(pipeline).not.toContain('node:fs');
    expect(pipeline).not.toContain('production-library');
    expect(proxyBundle.library.writesProductionLibrary).toBe(false);
    expect(canonicalBundle.library.writesProductionLibrary).toBe(false);
  });
});

describe('proxy registry labeling', () => {
  it('labels every proxy as noncanonical and ineligible for production', () => {
    expect(isProxyCode('PROXY_NONCANONICAL_BIRD_A')).toBe(true);
    expect(isProxyCode('PROXY_NONCANONICAL_QUADRUPED_A')).toBe(true);
    expect(isProxyCode(FOUNDING_CODES.PIP)).toBe(false);
    expect(isProxyCode(FOUNDING_CODES.GOAT)).toBe(false);
    expect(PROXY_LABEL).toBe('NONCANONICAL_PROXY');
    expect(PROXY_WATERMARK).toContain('NOT FOR FINAL PRODUCTION');
  });

  it('refuses to name a proxy Pip or Goat', () => {
    expect(proxyBundle.draft.occupants.join(' ')).not.toMatch(/CHAR_PIP|CHAR_GOAT/);
    expect(proxyBundle.draft.title.toLowerCase()).not.toContain('pip');
  });
});

describe('story / continuity / storyboard / animatic', () => {
  it('plans a deterministic proxy story', () => {
    const again = runPreproduction(PROXY_PIPELINE_BRIEF);
    expect(again.cacheKey).toBe(proxyBundle.cacheKey);
    expect(again.draft.cacheKey).toBe(proxyBundle.draft.cacheKey);
    expect(proxyBundle.outputClass).toBe('PIPELINE_TEST');
    expect(proxyBundle.draft.beats).toHaveLength(8);
    expect(proxyBundle.draft.beats[0]?.purpose).toBe('HOOK');
  });

  it('refuses child-unsafe briefs instead of rewriting them', () => {
    const planned = planStory({
      ...PROXY_PIPELINE_BRIEF,
      logline: 'The friends find a weapon and try violence.',
    });
    expect(planned.issues.some((issue) => issue.code === 'STORY_CHILD_SAFE_REFUSAL')).toBe(true);
    expect(CHILD_SAFE_REFUSALS).toContain('violence');
  });

  it('refuses to mark a proxy story as production-approved', () => {
    const planned = planStory({ ...PROXY_PIPELINE_BRIEF, storyApproved: true });
    expect(planned.issues.some((issue) => issue.code === 'PROXY_STORY_CANNOT_BE_PRODUCTION_APPROVED')).toBe(
      true,
    );
    expect(planned.draft.storyApproved).toBe(false);
  });

  it('watermarks every proxy storyboard panel and animatic clip', () => {
    expect(proxyBundle.storyboard.aspect).toBe('9:16');
    expect(proxyBundle.storyboard.panels.every((panel) => panel.watermark === PROXY_WATERMARK)).toBe(true);
    expect(proxyBundle.animatic.aspect).toBe('9:16');
    expect(proxyBundle.animatic.fps).toBe(30);
    expect(proxyBundle.animatic.renderTier).toBe('DRAFT');
    expect(proxyBundle.animatic.clips.every((clip) => clip.watermark === PROXY_WATERMARK)).toBe(true);
  });

  it('keeps continuity refs from dangling', () => {
    const dangling = proxyBundle.issues.filter((issue) => issue.code === 'CONTINUITY_DANGLING_REF');
    expect(dangling).toHaveLength(0);
  });
});

describe('9:16 shot planning', () => {
  it('frames every shot for vertical delivery', () => {
    expect(proxyBundle.shotPlan.aspect).toBe('9:16');
    expect(proxyBundle.shotPlan.deliveryResolution).toBe('1080x1920');
    expect(proxyBundle.shotPlan.planningResolution).toBe('360x640');
    expect(proxyBundle.shotPlan.shots).toHaveLength(proxyBundle.draft.beats.length);
    for (const shot of proxyBundle.shotPlan.shots) {
      expect(shot.headroomRatio).toBeGreaterThanOrEqual(VERTICAL_CAMERA_RULES.minHeadroomRatio);
      expect(shot.footRoomRatio).toBeGreaterThanOrEqual(VERTICAL_CAMERA_RULES.minFootRoomRatio);
      expect(shot.captionSafe).toBe(true);
      expect(shot.renderTier).toBe('DRAFT');
      expect(shot.watermark).toBe(PROXY_WATERMARK);
    }
  });
});

describe('library, audio, orchestration, QC', () => {
  it('references existing lighting and VFX recipes without writing assets', () => {
    expect(proxyBundle.library.lightingRecipe).toMatch(/MEADOW|DISCOVERY/);
    expect(proxyBundle.library.vfxIds.every((id) => id.startsWith('vfx_'))).toBe(true);
    expect(proxyBundle.library.writesProductionLibrary).toBe(false);
  });

  it('does not clone or reassign locked voices', () => {
    expect(LOCKED_VOICE_IDS).toEqual(['pip_default_v1', 'goat_default_v1']);
    expect(voiceIdForOccupant('PROXY_NONCANONICAL_BIRD_A')).toBe(PROXY_VOICE_PLACEHOLDER);
    expect(voiceIdForOccupant(FOUNDING_CODES.PIP)).toBe('pip_default_v1');
    for (const track of proxyBundle.audio.tracks) {
      if (track.occupant && isProxyCode(track.occupant)) {
        expect(track.voiceId).toBe(PROXY_VOICE_PLACEHOLDER);
        expect(track.kind).toBe('PLACEHOLDER');
      }
      expect(track.requiresPaidProvider).toBe(false);
    }
    expect(proxyBundle.audio.lockedVoicesUntouched).toBe(true);
    expect(proxyBundle.audio.mixTargetLufs).toBe(-16);
  });

  it('refuses paid spend and keeps retry local', () => {
    expect(proxyBundle.orchestration.spend.cloudRenderEnabled).toBe(false);
    expect(proxyBundle.orchestration.spend.allowPaidGpuLaunch).toBe(false);
    expect(proxyBundle.orchestration.retry.paidRetryAllowed).toBe(false);
    expect(evaluateLocalSpend(0).allowed).toBe(true);
    expect(evaluateLocalSpend(0.01).allowed).toBe(false);
  });

  it('passes proxy QC without claiming artistic approval', () => {
    expect(proxyBundle.qc.technical).toBe('PASS');
    expect(proxyBundle.qc.artistic).toBe('NOT_RENDERED');
    expect(proxyBundle.qc.checks.find((check) => check.item === 'PROXY_WATERMARK')?.status).toBe('PASS');
    expect(proxyBundle.qc.checks.find((check) => check.item === 'NO_FINAL_CLAIM')?.status).toBe('PASS');
  });
});

describe('proxy output gates', () => {
  it('allows the proxy draft path and refuses ScenePlan emission', () => {
    expect(proxyBundle.gate.allowed).toBe(true);
    expect(proxyBundle.scenePlan).toBeNull();
    expect(
      mayEmitScenePlan({
        characterMode: 'PROXY',
        storyApproved: false,
        occupants: proxyBundle.draft.occupants,
        issues: [],
      }).allowed,
    ).toBe(false);
  });

  it('fails closed on every final-production intent involving proxies', () => {
    const gate = evaluateProductionOutputGate(FORBIDDEN_FINAL_INTENT);
    expect(gate.allowed).toBe(false);
    expect(gate.codes).toEqual(
      expect.arrayContaining([
        'PROXY_IN_FINAL_RENDER',
        'PROXY_IN_THEATRICAL_BINDING',
        'PROXY_IN_PRODUCTION_LIBRARY',
        'PROXY_IN_MASTER_LABEL',
        'PROXY_IN_PAID_LAUNCH',
        'PROXY_IN_STORY_APPROVED_SCENE_PLAN',
        'PROXY_VOICE_AS_LOCKED_IDENTITY',
      ]),
    );
    expect(() =>
      assertNoProxyInFinalOutput(['PROXY_NONCANONICAL_BIRD_A'], 'FINAL'),
    ).toThrow(/forbidden in final production output/);
    expect(() =>
      assertManifestSafeForFinal({
        occupants: ['PROXY_NONCANONICAL_BIRD_A'],
        renderTier: 'FINAL',
      }),
    ).toThrow();
  });

  it('lets a canonical approved story emit a DRAFT ScenePlan the director can consume', () => {
    expect(canonicalBundle.outputClass).toBe('STORY_APPROVED_PLAN');
    expect(canonicalBundle.scenePlan).not.toBeNull();
    expect(canonicalBundle.scenePlan?.delivery.aspect).toBe('9:16');
    expect(canonicalBundle.scenePlan?.delivery.renderTier).toBe('DRAFT');
    expect(canonicalBundle.scenePlan?.delivery.assetQuality).toBe('PROTOTYPE');
    const planned = direct(canonicalBundle.scenePlan!);
    expect(planned.blueprint.content.acceptance.artistic).toBe('NOT_RENDERED');
    expect(planned.blueprint.content.issues.filter((issue) => issue.severity === 'ERROR')).toHaveLength(0);
  });
});

describe('schema version', () => {
  it('pins the preproduction bundle version', () => {
    expect(PREPRODUCTION_SCHEMA_VERSION).toBe('ddp-preproduction-bundle-v1');
    expect(proxyBundle.schemaVersion).toBe(PREPRODUCTION_SCHEMA_VERSION);
  });
});
