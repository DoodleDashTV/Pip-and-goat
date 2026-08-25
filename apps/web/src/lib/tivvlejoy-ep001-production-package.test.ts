import { describe, expect, it } from 'vitest';
import { ACTION_IDS } from './tivvlejoy-character-animation';
import {
  EP001_DIALOGUE_LINES,
  EP001_EPISODE_ID,
  EP001_FPS,
  EP001_PRODUCTION_PACKAGE_SCHEMA,
  EP001_SHOT_BLUEPRINTS,
  EP001_TOTAL_FRAMES,
  compileEp001ProductionPackage,
  evaluateEp001Readiness,
} from './tivvlejoy-ep001-production-package';

function compileDefault() {
  return compileEp001ProductionPackage();
}

describe('TIVVLEJOY_EP001_PRODUCTION_PACKAGE_V1', () => {
  it('compiles a deterministic zero-cost Episode 1 package', () => {
    const first = compileDefault();
    const second = compileDefault();
    expect(first.schemaVersion).toBe(EP001_PRODUCTION_PACKAGE_SCHEMA);
    expect(first.episodeId).toBe(EP001_EPISODE_ID);
    expect(first.workingTitle).toBe('Meadow Map Mystery');
    expect(first.packageSha256).toBe(second.packageSha256);
    expect(first.packageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.classification).toBe('DRAFT_NONCANONICAL');
    expect(first.pipelineClass).toBe('ZERO_COST_PREPRODUCTION_ONLY');
  });

  it('locks the requested 60-second vertical format', () => {
    const compiled = compileDefault();
    expect(compiled.format).toMatchObject({
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      fps: EP001_FPS,
      durationSeconds: 60,
      totalFrames: EP001_TOTAL_FRAMES,
    });
    expect(compiled.editorial.totalFrames).toBe(EP001_TOTAL_FRAMES);
  });

  it('has one contiguous timeline with no gaps or overlaps', () => {
    const shots = compileDefault().shots;
    expect(shots[0]?.inFrame).toBe(0);
    expect(shots.at(-1)?.outFrame).toBe(EP001_TOTAL_FRAMES);
    expect(shots.reduce((sum, shot) => sum + shot.durationFrames, 0)).toBe(EP001_TOTAL_FRAMES);
    for (let index = 0; index < shots.length; index += 1) {
      expect(shots[index]!.durationFrames).toBe(shots[index]!.outFrame - shots[index]!.inFrame);
      if (index > 0) expect(shots[index]!.inFrame).toBe(shots[index - 1]!.outFrame);
    }
  });

  it('contains a complete hook-to-button story arc', () => {
    const beats = compileDefault().shots.map((shot) => shot.beat);
    expect(beats).toEqual(
      expect.arrayContaining([
        'HOOK',
        'DISCOVERY',
        'QUESTION',
        'DECISION',
        'MOVEMENT',
        'TENSION',
        'PAYOFF',
        'REVEAL',
        'BUTTON',
      ]),
    );
    expect(beats[0]).toBe('HOOK');
    expect(beats.at(-1)).toBe('BUTTON');
  });

  it('uses only established home and enchanted-outskirts locations', () => {
    const compiled = compileDefault();
    expect(new Set(compiled.shots.map((shot) => shot.locationId))).toEqual(
      new Set(['bakery', 'main_street', 'forest_exit']),
    );
    expect(new Set(compiled.shots.map((shot) => shot.worldNode))).toEqual(
      new Set(['HOME_NEIGHBORHOOD', 'ENCHANTED_OUTSKIRTS']),
    );
    expect(
      compiled.sceneryBindings.every(
        (binding) => binding.bindingState === 'LOGICAL_ROLES_ONLY_AWAITING_APPROVED_RESOLUTION',
      ),
    ).toBe(true);
    expect(compiled.sceneryBindings.every((binding) => binding.sourceBytesIncluded === false)).toBe(
      true,
    );
  });

  it('keeps every dialogue line inside its bound shot', () => {
    for (const line of EP001_DIALOGUE_LINES) {
      const shot = EP001_SHOT_BLUEPRINTS.find((candidate) => candidate.shotId === line.shotId)!;
      expect(line.startFrame).toBeGreaterThanOrEqual(shot.inFrame);
      expect(line.endFrame).toBeLessThanOrEqual(shot.outFrame);
      expect(shot.dialogueLineIds).toContain(line.lineId);
    }
  });

  it('passes deterministic caption timing and readability QC', () => {
    const compiled = compileDefault();
    expect(compiled.captionQc).toEqual({ findings: [], passed: true });
    expect(compiled.captions).toHaveLength(EP001_DIALOGUE_LINES.length);
    expect(compiled.captions.every((caption) => caption.readingSpeed <= 4)).toBe(true);
    expect(compiled.captions.every((caption) => caption.maxLines === 2)).toBe(true);
  });

  it('binds all dialogue references while leaving exact audio receipts absent', () => {
    const compiled = compileDefault();
    expect(
      compiled.dialogue.every(
        (line) => line.voiceReceiptRef === null && line.audioIncluded === false,
      ),
    ).toBe(true);
    const voiceReason = compiled.productionPacket.reasons.find((reason) => reason.key === 'voice');
    expect(voiceReason?.blocksRealProduction).toBe(true);
    for (const line of EP001_DIALOGUE_LINES) expect(voiceReason?.reason).toContain(line.lineId);
    expect(compiled.audio.exactVoiceReceiptsBound).toBe(false);
    expect(compiled.audio.voiceAudioIncluded).toBe(false);
  });

  it('creates semantic Pip and Goat animation plans without admitting either rig', () => {
    const plans = compileDefault().animation.plans;
    expect(plans).toHaveLength(20);
    expect(plans.every((plan) => plan.semanticPlanOnly && !plan.executable && !plan.admitted)).toBe(
      true,
    );
    expect(plans.every((plan) => plan.rigId === 'UNRESOLVED_PRODUCTION_RIG')).toBe(true);
    expect(
      plans.every((plan) =>
        plan.clip.actions.every((action) => action.support === 'RIG_NOT_ADMITTED'),
      ),
    ).toBe(true);
    expect(
      plans.every((plan) => plan.manifest.shotAnimationDependencySha256.match(/^[a-f0-9]{64}$/)),
    ).toBe(true);
  });

  it('uses only declared semantic character actions', () => {
    const allowed = new Set<string>(ACTION_IDS);
    for (const shot of compileDefault().shots) {
      for (const cue of Object.values(shot.performance)) {
        expect(cue?.intendedActions.every((action) => allowed.has(action))).toBe(true);
      }
    }
  });

  it('preserves the locked character identity accessories', () => {
    const plans = compileDefault().animation.plans;
    const pip = plans.find((plan) => plan.characterId === 'PIP')!;
    const goat = plans.find((plan) => plan.characterId === 'GOAT')!;
    expect(pip.accessories.map((item) => item.itemId)).toEqual([
      'scarf',
      'backpack',
      'straps',
      'copper spiral',
    ]);
    expect(goat.accessories.map((item) => item.itemId)).toEqual(['collar', 'round Goat tag']);
    expect(
      plans.flatMap((plan) => plan.accessories).every((item) => item.removable === false),
    ).toBe(true);
  });

  it('authors no transforms or bone curves before approved rigs arrive', () => {
    const compiled = compileDefault();
    expect(compiled.animation.transformsAuthored).toBe(false);
    expect(compiled.animation.boneCurvesAuthored).toBe(false);
    expect(JSON.stringify(compiled.animation)).not.toMatch(/keyframe_insert|bpy\.|pose\.bones/);
  });

  it('keeps the production packet fail-closed on character, voice, render, and QC', () => {
    const reasons = compileDefault()
      .productionPacket.reasons.filter((reason) => reason.blocksRealProduction)
      .map((reason) => reason.key);
    expect(reasons).toEqual(expect.arrayContaining(['character', 'voice', 'render', 'qc']));
    expect(compileDefault().productionPacket.readiness).not.toBe('REAL_PRODUCTION_READY');
  });

  it('reports every default external blocker and waits for character rigs first', () => {
    const readiness = compileDefault().readiness;
    expect(readiness.state).toBe('WAITING_FOR_CHARACTER_RIGS');
    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'PIP_APPROVED_RIG_REQUIRED',
      'GOAT_APPROVED_RIG_REQUIRED',
      'APPROVED_SCENERY_BINDINGS_REQUIRED',
      'EXACT_VOICE_RECEIPTS_REQUIRED',
      'HUMAN_STORY_APPROVAL_REQUIRED',
      'HUMAN_VISUAL_APPROVAL_REQUIRED',
      'PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED',
    ]);
  });

  it('never turns readiness evidence into mutation authority', () => {
    const readiness = evaluateEp001Readiness({
      pipRigApproved: true,
      goatRigApproved: true,
      sceneryBindingsApproved: true,
      exactVoiceReceiptsBound: true,
      humanStoryApproval: true,
      humanVisualApproval: true,
      paidFinalRenderAuthorized: true,
    });
    expect(readiness.state).toBe('CONTROLLED_EXECUTION_PREFLIGHT_READY');
    expect(readiness.blockers).toEqual([]);
    expect(readiness.controlledPreflightAllowed).toBe(true);
    expect(readiness.launchAllowed).toBe(false);
    expect(readiness.characterAnimationExecutionAllowed).toBe(false);
    expect(readiness.paidComputeAllowed).toBe(false);
    expect(readiness.productionWritesAllowed).toBe(false);
    expect(readiness.autoApprovalAllowed).toBe(false);
  });

  it('allows readiness to advance one explicit dependency at a time', () => {
    expect(evaluateEp001Readiness({ pipRigApproved: true, goatRigApproved: true }).state).toBe(
      'WAITING_FOR_SCENERY_BINDINGS',
    );
    expect(
      evaluateEp001Readiness({
        pipRigApproved: true,
        goatRigApproved: true,
        sceneryBindingsApproved: true,
      }).state,
    ).toBe('WAITING_FOR_VOICE_RECEIPTS');
    expect(
      evaluateEp001Readiness({
        pipRigApproved: true,
        goatRigApproved: true,
        sceneryBindingsApproved: true,
        exactVoiceReceiptsBound: true,
      }).state,
    ).toBe('WAITING_FOR_HUMAN_STORY_APPROVAL');
  });

  it('performs no paid, network, source, production, voice, or theatrical action', () => {
    const safety = compileDefault().safety;
    expect(safety.planningCostUsd).toBe(0);
    expect(safety.externalNetworkCalls).toBe(0);
    expect(safety.gpuLaunched).toBe(false);
    expect(safety.voiceProviderContacted).toBe(false);
    expect(safety.finalRenderStarted).toBe(false);
    expect(safety.sourceStorageMutations).toBe(0);
    expect(safety.productionStorageMutations).toBe(0);
    expect(safety.theatricalGateOpened).toBe(false);
  });
});
