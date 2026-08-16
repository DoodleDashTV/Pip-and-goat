/**
 * Milestone 5 hardening + character-independent continuation.
 *
 * Proves real launch paths fail closed, persistence statuses are explicit,
 * and the next safe studio work stays DRAFT / noncanonical / ungated.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_STORY_BRIEF,
  FORBIDDEN_FINAL_INTENT,
  FORBIDDEN_WORKFLOW_TERMINALS,
  LOCKED_VOICE_IDS,
  PROXY_PIPELINE_BRIEF,
  PROXY_VOICE_PLACEHOLDER,
  advanceWorkflow,
  assertSteps9To16StillClosed,
  buildAuditEvidence,
  buildEpisode1DraftPackage,
  compileDraftMux,
  evaluateAudioTiming,
  evaluateCanonPromotion,
  evaluateEpisodeLaunchSafety,
  evaluatePaidResourcePolicy,
  evaluateProductionOutputGate,
  isForbiddenWorkflowTerminal,
  planCrashRecovery,
  planPartialRerender,
  planSteps9To16Infrastructure,
  planStory,
  specifyReusableLibrary,
  voiceIdForOccupant,
} from '@doodle-dash/preproduction';
import { currentStage, evaluateTheatricalGate, FINAL_1080P_ACCEPTANCE } from '@doodle-dash/direction';
import {
  assertDurableWorkflowPersisted,
  assertProductionLaunchSafe,
  persistPreproductionRun,
} from '@doodle-dash/production';

const repoRoot = path.resolve(__dirname, '../../../..');
const proxy = advanceWorkflow(PROXY_PIPELINE_BRIEF);
const canonical = advanceWorkflow(CANONICAL_STORY_BRIEF);

describe('enforced launch paths', () => {
  it('refuses unmarked generate-final, proxy FINAL, paid, library, voices, theatrical, publishing', () => {
    const unmarked = evaluateEpisodeLaunchSafety({ command: 'generate-final', intent: 'FINAL' });
    expect(unmarked.allowed).toBe(false);
    expect(unmarked.code).toBe('FINAL_RENDER_REFUSED');

    const proxyFinal = evaluateEpisodeLaunchSafety({
      command: 'generate-final',
      intent: 'FINAL',
      characterMode: 'PROXY',
      occupants: FORBIDDEN_FINAL_INTENT.occupants,
    });
    expect(proxyFinal.allowed).toBe(false);
    expect(proxyFinal.blockers.join(' ')).toMatch(/Proxy|FINAL/);

    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true }).allowed).toBe(false);
    expect(evaluatePaidResourcePolicy({ cloudRenderEnabled: true }).allowed).toBe(false);
    expect(
      evaluateEpisodeLaunchSafety({
        command: 'generate-final',
        writeProductionLibrary: true,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateEpisodeLaunchSafety({
        command: 'generate-final',
        synthesizeLockedVoice: true,
      }).code,
    ).toBe('LOCKED_VOICE_SYNTHESIS_REFUSED');
    expect(
      evaluateEpisodeLaunchSafety({
        command: 'generate-final',
        intent: 'THEATRICAL',
      }).allowed,
    ).toBe(false);
    expect(
      evaluateEpisodeLaunchSafety({
        command: 'generate-final',
        intent: 'PUBLISH',
        publish: true,
      }).code,
    ).toBe('PUBLISHING_REFUSED');
  });

  it('assertProductionLaunchSafe throws on the unmarked FINAL path', async () => {
    await expect(
      assertProductionLaunchSafe({
        command: 'generate-final',
        intent: 'FINAL',
        env: { ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' },
      }),
    ).rejects.toMatchObject({ code: 'FINAL_RENDER_REFUSED' });
  });

  it('keeps PROXY_PAID_LAUNCH_REFUSED inside requiredForReady and on real callers', () => {
    const preflight = readFileSync(path.join(repoRoot, 'packages/production/src/cloud/preflight.ts'), 'utf8');
    const launchPrep = readFileSync(path.join(repoRoot, 'packages/production/src/launch-prep.ts'), 'utf8');
    const episodeRender = readFileSync(path.join(repoRoot, 'packages/production/src/episode-render.ts'), 'utf8');
    const productionIndex = readFileSync(path.join(repoRoot, 'packages/production/src/index.ts'), 'utf8');
    expect(preflight).toMatch(/requiredForReady = \[[\s\S]*PROXY_PAID_LAUNCH_REFUSED/);
    expect(launchPrep).toContain('assertProductionLaunchSafe');
    expect(episodeRender).toContain('assertProductionLaunchSafe');
    expect(productionIndex).toContain('assertProductionLaunchSafe');
  });
});

describe('regression: closed gates and fingerprints', () => {
  it('cannot put a proxy in FINAL_RENDER or production-library', () => {
    const gate = evaluateProductionOutputGate(FORBIDDEN_FINAL_INTENT);
    expect(gate.allowed).toBe(false);
    expect(gate.codes).toEqual(
      expect.arrayContaining(['PROXY_IN_FINAL_RENDER', 'PROXY_IN_PRODUCTION_LIBRARY', 'PROXY_IN_PAID_LAUNCH']),
    );
    expect(proxy.mayContinueToFinal).toBe(false);
    expect(proxy.bundle.library.writesProductionLibrary).toBe(false);
    expect(() =>
      compileDraftMux({
        animatic: proxy.bundle.animatic,
        audio: proxy.bundle.audio,
        outputPath: 'production-library/characters/leak.mp4',
      }),
    ).toThrow(/production-library/);
  });

  it('cannot start paid execution or synthesise locked voices', () => {
    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 }).allowed).toBe(false);
    expect(LOCKED_VOICE_IDS).toEqual(['pip_default_v1', 'goat_default_v1']);
    expect(voiceIdForOccupant('PROXY_NONCANONICAL_BIRD_A')).toBe(PROXY_VOICE_PLACEHOLDER);
    expect(proxy.bundle.audio.lockedVoicesUntouched).toBe(true);
    expect(proxy.bundle.audio.tracks.every((track) => track.requiresPaidProvider === false)).toBe(true);
    const mux = compileDraftMux({
      animatic: proxy.bundle.animatic,
      audio: proxy.bundle.audio,
      outputPath: 'artifacts/milestone-5-workflow/test-mux.mp4',
    });
    expect(mux.args.join(' ')).toContain('anullsrc');
    expect(mux.args.join(' ')).not.toContain('pip_default_v1');
    expect(mux.args.join(' ')).not.toContain('goat_default_v1');
  });

  it('cannot auto-promote a draft story or reach THEATRICAL / PUBLISHING', () => {
    const planned = planStory({ ...PROXY_PIPELINE_BRIEF, storyApproved: true });
    expect(planned.draft.storyApproved).toBe(false);
    expect(evaluateCanonPromotion(proxy.bundle.draft).allowed).toBe(false);
    expect(evaluateCanonPromotion(canonical.bundle.draft).allowed).toBe(false);
    expect(evaluateCanonPromotion(canonical.bundle.draft).code).toBe('DRAFT_CANNOT_AUTO_PROMOTE');
    expect(isForbiddenWorkflowTerminal('THEATRICAL')).toBe(true);
    expect(isForbiddenWorkflowTerminal('PUBLISHING')).toBe(true);
    expect(FORBIDDEN_WORKFLOW_TERMINALS).toEqual(['FINAL_RENDER', 'THEATRICAL', 'PUBLISHING']);
    expect(proxy.mayContinueToTheatrical).toBe(false);
    expect(proxy.mayPublish).toBe(false);
  });

  it('leaves currentStage and theatrical gate unchanged', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    assertSteps9To16StillClosed();
    expect(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint).toBe(
      '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
    );
    expect(FINAL_1080P_ACCEPTANCE.acceptedArtifactSha256).toBe(
      'aefdd0b05881d336c489ba984a891f04eec0a44e889c6b3b3f61002554655458',
    );
  });
});

describe('persistence statuses', () => {
  it('labels fixture runs EPHEMERAL_TEST_ONLY and never claims persisted', async () => {
    const result = await persistPreproductionRun({
      episodeId: proxy.episodeId,
      workflow: proxy,
      ephemeralTestOnly: true,
    });
    expect(result.status).toBe('EPHEMERAL_TEST_ONLY');
    expect(result.persisted).toBe(false);
  });

  it('fails closed when durable persistence is required and the write cannot happen', () => {
    expect(() =>
      assertDurableWorkflowPersisted({
        status: 'PERSISTENCE_FAILED',
        persisted: false,
        reason: 'Prisma model preproductionRun is not available.',
      }),
    ).toThrow(/must persist durably/);
  });
});

describe('character-independent continuation', () => {
  it('keeps Steps 9–16 infrastructure closed', () => {
    const plan = planSteps9To16Infrastructure();
    expect(plan.opened).toBe(false);
    expect(plan.gateAllowed).toBe(false);
    expect(plan.currentStage).toBe('DDP_STEPS_1_8');
    expect(plan.workstreams.every((stream) => stream.status === 'BLOCKED')).toBe(true);
  });

  it('builds a DRAFT noncanonical Episode 1 package', () => {
    const pack = buildEpisode1DraftPackage();
    expect(pack.label).toBe('DRAFT_NONCANONICAL');
    expect(pack.canonical).toBe(false);
    expect(pack.productionEligible).toBe(false);
    expect(pack.storyApproved).toBe(false);
    expect(pack.workflow.bundle.draft.occupants.join(' ')).not.toMatch(/CHAR_PIP|CHAR_GOAT/);
    expect(pack.workflow.mayContinueToFinal).toBe(false);
  });

  it('plans local cache, recovery, audio timing, reusable specs, and audit evidence', () => {
    const cache = planPartialRerender({
      animatic: proxy.bundle.animatic,
      orchestration: proxy.bundle.orchestration,
      dirtyClipIds: [proxy.bundle.animatic.clips[0]!.clipId],
    });
    expect(cache.paidRetry).toBe(false);
    expect(cache.rerenderLocal).toHaveLength(1);
    expect(planCrashRecovery(proxy.bundle.orchestration).paidRetryAllowed).toBe(false);
    expect(evaluateAudioTiming({ animatic: proxy.bundle.animatic, audio: proxy.bundle.audio }).paid).toBe(
      false,
    );
    expect(specifyReusableLibrary(proxy.bundle.draft).writesProductionLibrary).toBe(false);
    const audit = buildAuditEvidence(proxy);
    expect(audit.mayContinueToFinal).toBe(false);
    expect(audit.paidGpu).toBe(false);
  });
});
