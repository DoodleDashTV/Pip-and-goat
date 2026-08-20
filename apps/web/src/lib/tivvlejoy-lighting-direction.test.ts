import { describe, expect, it } from 'vitest';
import {
  LIGHTING_INTENTS,
  VFX_INTENTS,
  evaluateLightingContinuity,
  lightingIntentFor,
  lightingIntents,
  planLightingDirection,
  planVfxDirection,
  vfxForShot,
  vfxIntents,
} from './tivvlejoy-nightshift-production';

describe('lighting and VFX direction', () => {
  for (const intent of LIGHTING_INTENTS) {
    it(`maps ${intent} onto a storybook preset without Gaffer`, () => {
      const plan = planLightingDirection({ shotId: `L_${intent}`, intent });
      expect(plan.gafferRequired).toBe(false);
      expect(plan.physicalStarlightRequired).toBe(false);
      expect(plan.nativeBlenderBaseline).toBe(true);
      expect(plan.faceReadability).toBe(true);
    });
  }

  it('detects lighting jumps but allows deliberate reveals', () => {
    const findings = evaluateLightingContinuity([
      planLightingDirection({ shotId: 'A', intent: 'WARM_INVITING' }),
      planLightingDirection({ shotId: 'B', intent: 'MAGICAL_NIGHT' }),
      planLightingDirection({ shotId: 'C', intent: 'REVEAL_ACCENT' }),
    ]);
    expect(findings.some((item) => item.codes.includes('TIME_OF_DAY_JUMP') || item.codes.includes('EXPOSURE_JUMP'))).toBe(true);
  });

  it('chooses lighting from weather and beat', () => {
    expect(lightingIntentFor({ weather: 'RAIN' })).toBe('RAINY_COZY');
    expect(lightingIntentFor({ beatType: 'REVEAL' })).toBe('REVEAL_ACCENT');
    expect(lightingIntents()).toEqual([...LIGHTING_INTENTS]);
  });

  for (const type of VFX_INTENTS) {
    it(`plans ${type} without executing a simulation`, () => {
      const plan = planVfxDirection({ shotId: 'SHV', type });
      expect(plan.executed).toBe(false);
      expect(plan.safety).toBe('CHILD_SAFE_CARTOON');
      expect(plan.vfxDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('adds rain and forest leaves from story context', () => {
    const events = vfxForShot({ shotId: 'SHX', weather: 'RAIN', location: 'forest', beatType: 'REVEAL' });
    expect(events.map((item) => item.semanticType)).toEqual(expect.arrayContaining(['RAIN', 'LEAF_FALL', 'LIGHT_RAYS']));
    expect(vfxIntents()).toHaveLength(13);
  });
});
