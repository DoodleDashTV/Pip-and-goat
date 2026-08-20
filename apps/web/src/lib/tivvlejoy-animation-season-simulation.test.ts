import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVED_ELEVENLABS_MODEL } from './voice-production/approved-voice-settings';
import {
  ANIMATION_SAFETY,
  SYNTHETIC_BANNER,
  buildAnimationConsoleModel,
  detectContactDefects,
  evaluateRigAdmission,
  planCharacterShot,
  simulateAnimationSeason,
  simulateRigArrivalFlip,
  syntheticPipContract,
  syntheticGoatContract,
} from './tivvlejoy-character-animation';

describe('60-episode animation simulation and stress tests', () => {
  const season = simulateAnimationSeason();

  it('simulates 60 episodes and 720 shots', () => {
    expect(season.totalEpisodes).toBe(60);
    expect(season.totalShots).toBe(720);
  });

  it('keeps synthetic rigs unapproved and not real', () => {
    expect(season.syntheticRigsHumanApproved).toBe(false);
    expect(season.realProductionRig).toBe(false);
    expect(season.banner).toBe(SYNTHETIC_BANNER);
  });

  it('reports Pip and Goat dependent shot counts', () => {
    expect(season.pipDependentShots).toBeGreaterThan(500);
    expect(season.goatDependentShots).toBeGreaterThan(500);
  });

  it('covers dialogue locomotion and prop interaction', () => {
    expect(season.dialogueShots).toBeGreaterThan(0);
    expect(season.locomotionShots).toBeGreaterThan(0);
    expect(season.propInteractionShots).toBeGreaterThan(0);
  });

  it('marks low-confidence visemes when phonemes are absent', () => {
    expect(season.lowConfidenceVisemeShots).toBeGreaterThan(0);
  });

  it('blocks real animation on missing Pip and Goat rigs', () => {
    expect(season.shotsBlockedByPipRig).toBe(season.pipDependentShots);
    expect(season.shotsBlockedByGoatRig).toBe(season.goatDependentShots);
    expect(season.animationQcBlockers).toBeGreaterThan(0);
  });

  it('still produces plan-ready semantic shots', () => {
    expect(season.shotsPlanReady).toBe(720);
    expect(season.reusableActionPlanCount).toBeGreaterThan(1);
    expect(season.batchCount).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    expect(simulateAnimationSeason().simulationSha256).toBe(season.simulationSha256);
  });

  it('flips from unresolved rigs to approved-like fixtures without calling them real', () => {
    const flip = simulateRigArrivalFlip();
    expect(flip.initialStudio).toBe('WAITING_FOR_CHARACTER_RIGS');
    expect(flip.unresolved.pip).toBe('RIG_NOT_PRESENT');
    expect(flip.approvedLike.calledRealApproved).toBe(false);
    expect(flip.approvedLike.pipApproved).toBe(false);
    expect(flip.afterCandidateFlip.sceneryInvalidated).toBe(false);
    expect(flip.afterCandidateFlip.voiceReceiptsInvalidated).toBe(false);
    expect(flip.afterCandidateFlip.realProductionRig).toBe(false);
  });

  it('does not globally invalidate voice or scenery after a candidate flip', () => {
    const flip = simulateRigArrivalFlip();
    expect(flip.afterCandidateFlip.goatEligibleNext).toContain('READY_FOR_CHARACTER_ANIMATION_ASSEMBLY');
    expect(flip.syntheticCannotApprove).toBe(true);
  });

  it('invalidates only Pip animation when Pip V1 becomes V2', () => {
    const pipV1 = planCharacterShot({ shotId: 'S1', characterId: 'PIP', contract: syntheticPipContract('V1') });
    const pipV2 = planCharacterShot({ shotId: 'S1', characterId: 'PIP', contract: syntheticPipContract('V2') });
    const goat = planCharacterShot({ shotId: 'S1', characterId: 'GOAT', contract: syntheticGoatContract('V1') });
    const goatAgain = planCharacterShot({ shotId: 'S1', characterId: 'GOAT', contract: syntheticGoatContract('V1') });
    expect(pipV1.manifest.shotAnimationDependencySha256).not.toBe(pipV2.manifest.shotAnimationDependencySha256);
    expect(goat.manifest.shotAnimationDependencySha256).toBe(goatAgain.manifest.shotAnimationDependencySha256);
  });

  it('invalidates only the changed voice line', () => {
    const changed = planCharacterShot({
      shotId: 'TALK',
      characterId: 'PIP',
      speaking: true,
      voice: { audioReceiptRef: 'NEW', audioSha256: 'dd'.repeat(32), durationMs: 900 },
    });
    const untouched = planCharacterShot({ shotId: 'IDLE', characterId: 'GOAT' });
    const untouchedAgain = planCharacterShot({ shotId: 'IDLE', characterId: 'GOAT' });
    expect(changed.timing.audioReceiptRef).toBe('NEW');
    expect(untouched.manifest.shotAnimationDependencySha256).toBe(untouchedAgain.manifest.shotAnimationDependencySha256);
  });

  it('plans a dialogue performance with speaker and listener roles', () => {
    const pipSpeaks = planCharacterShot({
      shotId: 'D1',
      characterId: 'PIP',
      speaking: true,
      partner: 'GOAT',
      locomotion: 'walk',
      voice: { audioReceiptRef: 'P', audioSha256: 'ee'.repeat(32), durationMs: 1600 },
    });
    const goatListens = planCharacterShot({
      shotId: 'D1',
      characterId: 'GOAT',
      speaking: false,
      partner: 'PIP',
      locomotion: 'walk',
    });
    expect(pipSpeaks.gaze.primary).toBe('OTHER_CHARACTER');
    expect(goatListens.gaze.primary).toBe('OTHER_CHARACTER');
    expect(pipSpeaks.viseme.adapter).toBe('PIP_BEAK');
    expect(goatListens.body.reaction).toBeGreaterThan(pipSpeaks.body.reaction);
    expect(pipSpeaks.blink.events.length).toBeGreaterThan(0);
  });

  it('plans Goat speaking while Pip reacts', () => {
    const goatSpeaks = planCharacterShot({
      shotId: 'D2',
      characterId: 'GOAT',
      speaking: true,
      partner: 'PIP',
      voice: { audioReceiptRef: 'G', audioSha256: '11'.repeat(32), durationMs: 1400 },
    });
    const pipReacts = planCharacterShot({ shotId: 'D2', characterId: 'PIP', speaking: false, partner: 'GOAT' });
    expect(goatSpeaks.viseme.adapter).toBe('GOAT_JAW');
    expect(pipReacts.intent.dialogueIntent).toBe('listen');
  });

  it('catches locomotion stress defects', () => {
    expect(detectContactDefects({ sliding: true, floating: true, teleport: true, speedJump: true }).length).toBe(4);
  });

  it('builds a friendly operator console model', () => {
    const model = buildAnimationConsoleModel();
    expect(model.pip.statusLabel).toMatch(/Waiting for approved Pip production rig/);
    expect(model.goat.statusLabel).toMatch(/Waiting for approved Goat production rig/);
    expect(model.studioReadiness).toBe('WAITING_FOR_CHARACTER_RIGS');
    expect(model.softwareLayer).toBe('CHARACTER_ANIMATION_PIPELINE_OPERATIONAL');
    expect(model.nextSafeActions[0]).toMatch(/Pip production rig/);
  });

  it('does not change approved voice IDs', () => {
    expect(APPROVED_ELEVENLABS_MODEL).toBe('eleven_multilingual_v2');
    const dir = path.resolve(__dirname, './tivvlejoy-character-animation');
    const sources = readdirSync(dir)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(path.join(dir, name), 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/93w5H37WdqeS6HoyL5cV|SbxjwBKw2PefbSupcoXV/);
    expect(sources).not.toMatch(/child_process|spawnSync|blender -b|bpy\./);
    expect(sources).not.toMatch(/runpod\.io/);
    expect(sources).not.toMatch(/gpuLaunched:\s*true/);
    expect(sources).not.toMatch(/autoApproveRigs:\s*true/);
  });

  it('does not mutate production-library or authorize paid compute', () => {
    expect(ANIMATION_SAFETY.paidComputeUsd).toBe(0);
    expect(evaluateRigAdmission({ characterId: 'PIP', contract: syntheticPipContract() }).approvedForAnimation).toBe(false);
  });

  for (const count of [1, 10, 30] as const) {
    it(`can simulate ${count} episode(s) without claiming completion`, () => {
      const slice = simulateAnimationSeason({ episodeCount: count, shotsPerEpisode: 12 });
      expect(slice.totalEpisodes).toBe(count);
      expect(slice.realProductionRig).toBe(false);
    });
  }

  it('counts shots needing voice timing', () => {
    expect(season.shotsNeedingVoiceTiming).toBeGreaterThan(0);
  });

  it('exposes cache hit estimates without reusing full performances', () => {
    expect(season.cacheHitEstimate).toBeGreaterThanOrEqual(0);
  });

  it('reports continuity warnings as a number, not a visual pass', () => {
    expect(season.continuityWarnings).toBeGreaterThanOrEqual(0);
  });

  it('never marks synthetic admission as approved during the season', () => {
    expect(evaluateRigAdmission({ characterId: 'GOAT', contract: syntheticGoatContract() }).approvedForAnimation).toBe(false);
  });

  const kinds = ['walk', 'run', 'jump', 'turn', 'stationary'] as const;
  for (const kind of kinds) {
    it(`plans a ${kind} dialogue-adjacent shot without executing geometry`, () => {
      const plan = planCharacterShot({
        shotId: `LOC_${kind}`,
        characterId: 'PIP',
        locomotion: kind,
        speaking: kind === 'stationary',
        partner: 'GOAT',
      });
      expect(plan.locomotion.units).toBe('NORMALIZED_SYMBOLIC');
      expect(plan.admitted).toBe(false);
    });
  }

  it('keeps interior and exterior location tokens out of the animation dependency', () => {
    const bakery = planCharacterShot({ shotId: 'EP001_SH01', characterId: 'PIP' });
    const forest = planCharacterShot({ shotId: 'EP001_SH02', characterId: 'PIP' });
    expect(bakery.manifest.shotAnimationDependencySha256).not.toBe(forest.manifest.shotAnimationDependencySha256);
    expect(JSON.stringify(bakery.manifest.rig)).not.toMatch(/bakery\.blend|forest\.blend/);
  });
});
