import { describe, expect, it } from 'vitest';
import {
  ACTION_IDS,
  actionCount,
  buildPerformanceIntent,
  defaultActionsForBeat,
  intentFromBeat,
  isKnownAction,
  resolveCharacterAction,
  syntheticGoatContract,
  syntheticPipContract,
} from './tivvlejoy-character-animation';

describe('performance intent and action resolver', () => {
  it('hashes identical intents the same way', () => {
    const first = intentFromBeat({ shotId: 'S1', characterId: 'PIP', speaking: true, partner: 'GOAT' });
    const second = intentFromBeat({ shotId: 'S1', characterId: 'PIP', speaking: true, partner: 'GOAT' });
    expect(first.intentSha256).toBe(second.intentSha256);
  });

  it('keeps Pip curious and Goat warm by default', () => {
    expect(intentFromBeat({ shotId: 'S1', characterId: 'PIP' }).emotion).toBe('curious');
    expect(intentFromBeat({ shotId: 'S1', characterId: 'GOAT' }).emotion).toBe('warm');
  });

  it('raises urgency for a run', () => {
    expect(intentFromBeat({ shotId: 'S1', characterId: 'PIP', locomotion: 'run' }).urgency).toBeGreaterThan(0.7);
  });

  it('does not execute animation from intent', () => {
    const intent = buildPerformanceIntent({
      shotId: 'S1',
      characterId: 'PIP',
      emotion: 'curious',
      emotionIntensity: 0.5,
      storyGoal: 'find map',
      attentionTarget: 'STORY_PROP',
      movementIntent: 'walk',
      dialogueIntent: 'speak',
      gestureIntent: 'wing accent',
      poseEnergy: 0.6,
      urgency: 0.4,
      confidence: 0.7,
      reactionType: 'none',
      entranceIntent: 'enter',
      exitIntent: 'hold',
      propIntent: 'map',
      relationshipIntent: 'attend GOAT',
    });
    expect(intent.schemaVersion).toBe('TIVVLEJOY_PERFORMANCE_INTENT_V1');
    expect(JSON.stringify(intent)).not.toMatch(/bpy|keyframe_insert/);
  });

  it('counts the semantic vocabulary', () => {
    expect(actionCount()).toBe(42);
    expect(isKnownAction('POINT')).toBe(true);
    expect(isKnownAction('FINGER_GUN')).toBe(false);
  });

  it('refuses actions when the rig is not admitted', () => {
    expect(resolveCharacterAction({ characterId: 'PIP', actionId: 'WALK_FORWARD' }).support).toBe('RIG_NOT_ADMITTED');
  });

  it('resolves Pip POINT as a composite wing plus gaze action', () => {
    const result = resolveCharacterAction({
      characterId: 'PIP',
      actionId: 'POINT',
      contract: syntheticPipContract(),
      admitted: true,
    });
    expect(result.support).toBe('SUPPORTED_COMPOSITE');
    expect(result.note).toContain('wing');
    expect(result.usedFamilies).toEqual(expect.arrayContaining(['ARM_OR_WING_LEFT', 'HEAD', 'EYE_AIM']));
  });

  it('does not silently invent a finger control for Pip POINT', () => {
    const result = resolveCharacterAction({
      characterId: 'PIP',
      actionId: 'POINT',
      contract: syntheticPipContract(),
      admitted: true,
    });
    expect(result.note).toMatch(/no finger-like pointing/i);
  });

  it('marks Goat ear reaction as limited when only face expression exists', () => {
    expect(
      resolveCharacterAction({
        characterId: 'GOAT',
        actionId: 'GOAT_EAR_REACTION',
        contract: syntheticGoatContract(),
        admitted: true,
      }).support,
    ).toBe('SUPPORTED_WITH_LIMITATION');
  });

  it('rejects Pip wing actions on Goat', () => {
    expect(
      resolveCharacterAction({
        characterId: 'GOAT',
        actionId: 'PIP_WING_FLUTTER',
        contract: syntheticGoatContract(),
        admitted: true,
      }).support,
    ).toBe('UNSUPPORTED');
  });

  it('supports walk directly when legs and root exist', () => {
    expect(
      resolveCharacterAction({
        characterId: 'PIP',
        actionId: 'WALK_FORWARD',
        contract: syntheticPipContract(),
        admitted: true,
      }).support,
    ).toBe('SUPPORTED_DIRECTLY');
  });

  it('supports beak open directly for Pip', () => {
    expect(
      resolveCharacterAction({
        characterId: 'PIP',
        actionId: 'BEAK_OR_MOUTH_OPEN',
        contract: syntheticPipContract(),
        admitted: true,
      }).support,
    ).toBe('SUPPORTED_DIRECTLY');
  });

  it('returns unsupported when required families are absent', () => {
    const empty = { ...syntheticPipContract(), capabilities: [] };
    expect(
      resolveCharacterAction({
        characterId: 'PIP',
        actionId: 'WALK_FORWARD',
        contract: empty,
        admitted: true,
      }).support,
    ).toBe('UNSUPPORTED');
  });

  it('returns limited support when only some walk families exist', () => {
    const partial = {
      ...syntheticPipContract(),
      capabilities: syntheticPipContract().capabilities.filter((item) => item.family === 'LEG_LEFT'),
    };
    expect(
      resolveCharacterAction({
        characterId: 'PIP',
        actionId: 'WALK_FORWARD',
        contract: partial,
        admitted: true,
      }).support,
    ).toBe('SUPPORTED_WITH_LIMITATION');
  });

  const admittedActions = ACTION_IDS.filter((id) => id !== 'POINT' && id !== 'GOAT_EAR_REACTION' && !id.startsWith('PIP_WING'));
  for (const actionId of admittedActions.slice(0, 24)) {
    it(`resolves ${actionId} without a silent fallback code`, () => {
      const result = resolveCharacterAction({
        characterId: 'PIP',
        actionId,
        contract: syntheticPipContract(),
        admitted: true,
      });
      expect(['SUPPORTED_DIRECTLY', 'SUPPORTED_COMPOSITE', 'SUPPORTED_WITH_LIMITATION', 'UNSUPPORTED']).toContain(result.support);
      expect(result.support).not.toBe('RIG_NOT_ADMITTED');
    });
  }

  it('builds default beat actions for a speaking walk with a pickup', () => {
    expect(defaultActionsForBeat({ characterId: 'PIP', speaking: true, locomotion: 'walk', prop: 'PICK_UP' })).toEqual(
      expect.arrayContaining(['IDLE_CURIOUS', 'BEAK_OR_MOUTH_OPEN', 'WALK_FORWARD', 'PICK_UP', 'PIP_WING_GESTURE_SMALL']),
    );
  });

  it('maps Goat beat actions to head bob rather than wing gestures', () => {
    expect(defaultActionsForBeat({ characterId: 'GOAT', speaking: false, locomotion: 'run' })).toEqual(
      expect.arrayContaining(['IDLE_HAPPY', 'RUN', 'GOAT_HEAD_BOB']),
    );
  });
});
