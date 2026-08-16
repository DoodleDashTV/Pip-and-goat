/**
 * Studio Milestone 5 — episode workflow, local assembly, launch safety.
 *
 * Pure package tests plus source-wiring assertions. No paid provider. Draft
 * PR #26 stays unmerged. Pip / Goat / production-library / theatrical binding
 * stay untouched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_STORY_BRIEF,
  FORBIDDEN_FINAL_INTENT,
  FORBIDDEN_WORKFLOW_TERMINALS,
  PROXY_PIPELINE_BRIEF,
  PROXY_WATERMARK,
  WORKFLOW_STAGES,
  advanceWorkflow,
  compileAnimaticAssembly,
  compileAudioMix,
  evaluateEpisodeCreateSafety,
  evaluateEpisodeLaunchSafety,
  evaluatePaidResourcePolicy,
  evaluateWorkflowReadiness,
  isForbiddenWorkflowTerminal,
  summarizeWorkflow,
} from '@doodle-dash/preproduction';
import { currentStage, evaluateTheatricalGate, FINAL_1080P_ACCEPTANCE } from '@doodle-dash/direction';

const repoRoot = path.resolve(__dirname, '../../../..');

const proxy = advanceWorkflow(PROXY_PIPELINE_BRIEF);
const canonical = advanceWorkflow(CANONICAL_STORY_BRIEF);

describe('Milestone 5 isolation and protections', () => {
  it('stacks on Milestone 4 and keeps the accepted studio baseline', () => {
    const progress = readFileSync(path.join(repoRoot, 'TRIVVLEJOY_PROGRESS.md'), 'utf8');
    expect(progress).toContain('cursor/trivvlejoy-milestone-3-1ebc');
    expect(progress).toContain('character-independent');
    expect(progress).toContain('Do not continue the paused Pip conversion');
    expect(progress).toContain('Milestone 5');
    expect(progress).toContain('Draft PR #26');
  });

  it('leaves the theatrical / Steps 9–16 gate closed', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(proxy.mayContinueToTheatrical).toBe(false);
    expect(proxy.mayContinueToFinal).toBe(false);
    expect(proxy.mayPublish).toBe(false);
  });

  it('preserves the accepted FINAL_1080P fingerprint constants', () => {
    expect(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint).toBe(
      '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
    );
  });

  it('does not write production-library from workflow or assembly', () => {
    const workflow = readFileSync(path.join(repoRoot, 'packages/preproduction/src/workflow/index.ts'), 'utf8');
    const assembly = readFileSync(path.join(repoRoot, 'packages/preproduction/src/assembly/index.ts'), 'utf8');
    expect(workflow).not.toContain('node:fs');
    expect(workflow).not.toContain('writeFileSync');
    expect(assembly).not.toContain('node:fs');
    expect(assembly).not.toContain('writeFileSync');
    expect(assembly).not.toContain('node:child_process');
    expect(assembly).not.toContain('spawnSync');
    expect(proxy.bundle.library.writesProductionLibrary).toBe(false);
    expect(() =>
      compileAnimaticAssembly({
        animatic: proxy.bundle.animatic,
        audio: proxy.bundle.audio,
        outputPath: 'production-library/characters/proxy.mp4',
      }),
    ).toThrow(/production-library/);
  });
});

describe('episode workflow engine', () => {
  it('walks every stage and stops at a proxy pipeline-test terminal', () => {
    expect(WORKFLOW_STAGES).toEqual([
      'BRIEF',
      'STORY',
      'CONTINUITY',
      'STORYBOARD',
      'ANIMATIC',
      'SHOTS',
      'LIBRARY',
      'AUDIO',
      'ORCHESTRATION',
      'QC',
      'OUTPUT_GATE',
    ]);
    expect(proxy.stages).toHaveLength(WORKFLOW_STAGES.length);
    expect(proxy.stages.every((stage) => stage.status === 'DONE')).toBe(true);
    expect(proxy.terminal).toBe('PIPELINE_TEST_COMPLETE');
    expect(proxy.bundle.scenePlan).toBeNull();
    expect(proxy.bundle.draft.occupants.join(' ')).not.toMatch(/CHAR_PIP|CHAR_GOAT/);
    expect(summarizeWorkflow(proxy).qcArtistic).toBe('NOT_RENDERED');
  });

  it('lets an approved canonical story reach STORY_PLAN_READY only', () => {
    expect(canonical.terminal).toBe('STORY_PLAN_READY');
    expect(canonical.bundle.scenePlan).not.toBeNull();
    expect(canonical.bundle.scenePlan?.delivery.renderTier).toBe('DRAFT');
    expect(canonical.mayContinueToFinal).toBe(false);
    expect(canonical.mayContinueToTheatrical).toBe(false);
  });

  it('cannot name FINAL_RENDER, THEATRICAL, or PUBLISHING as a terminal', () => {
    expect(FORBIDDEN_WORKFLOW_TERMINALS).toEqual(['FINAL_RENDER', 'THEATRICAL', 'PUBLISHING']);
    expect(isForbiddenWorkflowTerminal(proxy.terminal)).toBe(false);
    expect(isForbiddenWorkflowTerminal('FINAL_RENDER')).toBe(true);
    expect(evaluateWorkflowReadiness({
      characterMode: 'PROXY',
      outputClass: 'PIPELINE_TEST',
      qcTechnical: 'PASS',
      qcArtistic: 'NOT_RENDERED',
      scenePlanEmitted: false,
    })).toMatchObject({
      canLaunchFinal: false,
      canLaunchPaidGpu: false,
      canOpenTheatrical: false,
    });
  });

  it('is deterministic', () => {
    expect(advanceWorkflow(PROXY_PIPELINE_BRIEF).cacheKey).toBe(proxy.cacheKey);
  });
});

describe('local FFmpeg assembly compiler', () => {
  it('compiles a 9:16 lavfi animatic with the proxy watermark', () => {
    const command = compileAnimaticAssembly({
      animatic: proxy.bundle.animatic,
      audio: proxy.bundle.audio,
      outputPath: 'artifacts/milestone-5-workflow/test-animatic.mp4',
    });
    expect(command.kind).toBe('ANIMATIC');
    expect(command.width).toBe(360);
    expect(command.height).toBe(640);
    expect(command.fps).toBe(30);
    expect(command.paid).toBe(false);
    expect(command.writesProductionLibrary).toBe(false);
    expect(command.args.join(' ')).toContain('lavfi');
    expect(command.filterGraph).toContain('drawbox');
    expect(command.filterGraph).toContain(PROXY_WATERMARK);
    expect(command.watermark).toBe(PROXY_WATERMARK);
  });

  it('compiles a synthetic mix that leaves locked voices untouched', () => {
    const command = compileAudioMix({
      audio: proxy.bundle.audio,
      durationSeconds: 30,
      outputPath: 'artifacts/milestone-5-workflow/test-mix.wav',
    });
    expect(command.kind).toBe('AUDIO_MIX');
    expect(command.args.join(' ')).toContain('anullsrc');
    expect(command.args.join(' ')).toContain('sine');
    expect(proxy.bundle.audio.lockedVoicesUntouched).toBe(true);
    expect(proxy.bundle.audio.tracks.every((track) => track.requiresPaidProvider === false)).toBe(true);
  });
});

describe('create-episode and generate-final safety', () => {
  it('allows the existing DRAFT create-episode body and refuses proxies / paid / final', () => {
    expect(evaluateEpisodeCreateSafety({ command: 'create-episode', intent: 'DRAFT' }).allowed).toBe(true);
    expect(
      evaluateEpisodeCreateSafety({
        command: 'create-episode',
        characterMode: 'PROXY',
        characterCodes: ['PROXY_NONCANONICAL_BIRD_A'],
      }).allowed,
    ).toBe(false);
    expect(
      evaluateEpisodeCreateSafety({
        command: 'create-episode',
        intent: 'FINAL',
      }).allowed,
    ).toBe(false);
    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true }).allowed).toBe(false);
    expect(evaluatePaidResourcePolicy({ estimateUsd: 0.01 }).allowed).toBe(false);
  });

  it('refuses generate-final when the episode is a proxy or paid launch', () => {
    const safety = evaluateEpisodeLaunchSafety({
      command: 'generate-final',
      intent: 'FINAL',
      characterMode: 'PROXY',
      occupants: FORBIDDEN_FINAL_INTENT.occupants,
      allowPaidGpu: true,
      writeProductionLibrary: true,
    });
    expect(safety.allowed).toBe(false);
    expect(safety.blockers.length).toBeGreaterThan(0);
    const unmarked = evaluateEpisodeLaunchSafety({
      command: 'generate-final',
      intent: 'FINAL',
    });
    expect(unmarked.allowed).toBe(false);
    expect(unmarked.code).toBe('FINAL_RENDER_REFUSED');
  });

  it('wires create-episode and generate-final to the safety helpers', () => {
    const createEpisode = readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/studio/create-episode/route.ts'),
      'utf8',
    );
    const launch = readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/production/launch/route.ts'),
      'utf8',
    );
    const preflight = readFileSync(
      path.join(repoRoot, 'packages/production/src/cloud/preflight.ts'),
      'utf8',
    );
    const launchPrep = readFileSync(
      path.join(repoRoot, 'packages/production/src/launch-prep.ts'),
      'utf8',
    );
    expect(createEpisode).toContain('[15, 30, 45, 60]');
    expect(createEpisode).toContain('evaluateEpisodeCreateSafety');
    expect(launch).toContain('evaluateEpisodeLaunchSafety');
    expect(launch).toContain("action: z.literal('generate-final')");
    expect(preflight).toContain('PROXY_PAID_LAUNCH_REFUSED');
    expect(preflight).toContain('requiredForReady');
    expect(preflight).toMatch(/requiredForReady = \[[\s\S]*PROXY_PAID_LAUNCH_REFUSED/);
    expect(launch).toContain('readLaunchEnvFlags');
    expect(launchPrep).toContain('assertProductionLaunchSafe');
  });
});
