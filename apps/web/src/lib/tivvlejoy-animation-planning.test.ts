import { describe, expect, it } from 'vitest';
import {
  LOCOMOTION_CLASSES,
  accessoryRemovalAllowed,
  buildBodyActingPlan,
  buildContactPlan,
  buildLocomotionPlan,
  classifyLocomotion,
  detectContactDefects,
  identityAccessories,
  intentFromBeat,
  locomotionStressDefects,
} from './tivvlejoy-character-animation';

describe('body acting locomotion and contact', () => {
  it('keeps Pip explorer-like and Goat warm', () => {
    const pip = buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'PIP' }));
    const goat = buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'GOAT' }));
    expect(pip.personality).toContain('curious');
    expect(pip.personality).toContain('explorer-like');
    expect(goat.personality).toContain('warm');
    expect(goat.personality).toContain('adventurous');
  });

  it('does not rewrite character identity', () => {
    expect(buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'PIP' })).personality).not.toMatch(/replace|redesign/);
  });

  it('tilts the head more when curious', () => {
    const curious = buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'PIP', emotion: 'curious' }));
    const happy = buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'PIP', emotion: 'happy' }));
    expect(curious.headTilt).toBeGreaterThan(happy.headTilt);
  });

  it('classifies locomotion labels symbolically', () => {
    expect(classifyLocomotion('walk')).toBe('WALK');
    expect(classifyLocomotion('fast walk')).toBe('FAST_WALK');
    expect(classifyLocomotion('run')).toBe('RUN');
    expect(classifyLocomotion('jump')).toBe('JUMP');
    expect(classifyLocomotion('turn left')).toBe('TURN');
    expect(classifyLocomotion(undefined)).toBe('STATIONARY');
  });

  for (const speedClass of LOCOMOTION_CLASSES) {
    it(`plans ${speedClass} in normalized units`, () => {
      const plan = buildLocomotionPlan({
        shotId: 'S1',
        characterId: speedClass === 'RUN' ? 'GOAT' : 'PIP',
        speedClass,
        durationMs: 2000,
        startAnchor: 'A',
        endAnchor: 'B',
      });
      expect(plan.units).toBe('NORMALIZED_SYMBOLIC');
      expect(plan.locomotionPlanSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('omits contact timing while stationary', () => {
    expect(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'STATIONARY', durationMs: 1000 }).contactTiming).toEqual([]);
  });

  it('alternates symbolic foot plants while walking', () => {
    const plan = buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'WALK', durationMs: 2400 });
    expect(plan.contactTiming.some((item) => item.foot === 'LEFT' && item.event === 'PLANT')).toBe(true);
    expect(plan.contactTiming.some((item) => item.foot === 'RIGHT' && item.event === 'LIFT')).toBe(true);
  });

  it('tracks Pip hallux and Goat hoof symbolically', () => {
    const pip = buildContactPlan(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'WALK', durationMs: 2000 }));
    const goat = buildContactPlan(buildLocomotionPlan({ shotId: 'S1', characterId: 'GOAT', speedClass: 'RUN', durationMs: 1600 }));
    expect(pip.rearHallux).toContain('symbolic-hallux-support');
    expect(goat.hoof).toContain('symbolic-hoof-contact');
    expect(pip.groundReference).toBe('SYMBOLIC_GROUND');
  });

  it('detects injected contact defects', () => {
    const defects = locomotionStressDefects();
    expect(defects.slide).toContain('UNEXPLAINED_FOOT_SLIDE');
    expect(defects.flying).toContain('DOUBLE_FLOATING_CONTACT');
    expect(defects.speed).toContain('IMPOSSIBLE_SPEED_CHANGE');
    expect(defects.teleport).toContain('TELEPORTING_CONTACT');
    expect(defects.penetration).toContain('GROUND_PENETRATION');
  });

  it('returns no defects for a clean contact plan', () => {
    expect(detectContactDefects({})).toEqual([]);
  });

  it('forbids removing identity accessories', () => {
    expect(accessoryRemovalAllowed()).toBe(false);
    expect(identityAccessories('PIP').map((item) => item.itemId)).toEqual(['scarf', 'backpack', 'straps', 'copper spiral']);
    expect(identityAccessories('GOAT').map((item) => item.itemId)).toEqual(['collar', 'round Goat tag']);
    expect(identityAccessories('PIP').every((item) => item.removable === false)).toBe(true);
  });

  it('hashes body acting deterministically', () => {
    const intent = intentFromBeat({ shotId: 'S9', characterId: 'GOAT', speaking: true });
    expect(buildBodyActingPlan(intent).bodyActingPlanSha256).toBe(buildBodyActingPlan(intent).bodyActingPlanSha256);
  });

  it('scales Pip gestures larger than Goat', () => {
    const pip = buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'PIP' }));
    const goat = buildBodyActingPlan(intentFromBeat({ shotId: 'S1', characterId: 'GOAT' }));
    expect(pip.gestureScale).toBeGreaterThan(goat.gestureScale);
  });

  it('adds a turn key during TURN locomotion', () => {
    expect(buildLocomotionPlan({ shotId: 'S1', characterId: 'GOAT', speedClass: 'TURN', durationMs: 1200 }).turnTiming).toHaveLength(1);
  });

  it('uses arrival settle only when the character is moving', () => {
    expect(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'WALK', durationMs: 1000 }).arrivalSettle).toBeGreaterThan(0);
    expect(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'STATIONARY', durationMs: 1000 }).arrivalSettle).toBe(0);
  });

  const labels = ['WALK_SLOW', 'approach now', 'depart', 'land softly', 'idle'];
  for (const label of labels) {
    it(`classifies ${label} without world-space measurements`, () => {
      const speed = classifyLocomotion(label);
      const plan = buildLocomotionPlan({ shotId: label, characterId: 'PIP', speedClass: speed, durationMs: 800 });
      expect(plan.units).toBe('NORMALIZED_SYMBOLIC');
    });
  }

  it('zero sliding tolerance is explicit', () => {
    expect(buildContactPlan(buildLocomotionPlan({ shotId: 'S1', characterId: 'PIP', speedClass: 'WALK', durationMs: 900 })).slidingTolerance).toBe(
      'ZERO_UNEXPLAINED_SLIDE',
    );
  });
});
