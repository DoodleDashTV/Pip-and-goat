import { describe, expect, it } from 'vitest';
import { canonicalControlsFor } from './tivvlejoy-rig-control-adapter';
import { compileRigAnimationCompatibilitySuite, validateCompatibilityAgainstAdapter } from './tivvlejoy-rig-animation-compatibility-suite';

describe('TivvleJoy rig animation compatibility suite', () => {
  it('locks 13 Pip tests and 11 Goat tests with zero execution authority', () => {
    const suite = compileRigAnimationCompatibilitySuite();
    expect(suite.pip).toHaveLength(13);
    expect(suite.goat).toHaveLength(11);
    expect(suite.totalTests).toBe(24);
    expect(suite).toMatchObject({ blenderTarget: '4.2', fps: 30, testsExecutableWithoutRealRig: false, syntheticPassCannotApprove: true, humanApprovalRequired: true, productionEnabled: false });
    expect(suite.suiteSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('makes every Pip test runnable when all canonical controls are mapped but executes none', () => {
    const controls = canonicalControlsFor('CHAR_PIP_001').map((control) => control.canonicalId);
    const result = validateCompatibilityAgainstAdapter({ characterId: 'CHAR_PIP_001', mappedCanonicalControls: controls });
    expect(result).toMatchObject({ allRunnable: true, runnableCount: 13, totalTests: 13, executedTests: 0, passedTests: 0, humanApproved: false, productionEnabled: false });
  });

  it('reports exact missing controls before the real rig arrives', () => {
    const result = validateCompatibilityAgainstAdapter({ characterId: 'CHAR_GOAT_001', mappedCanonicalControls: ['ROOT', 'MASTER'] });
    expect(result.allRunnable).toBe(false);
    expect(result.runnableCount).toBe(0);
    const dialogue = result.rows.find((row) => row.testId === 'GOAT_DIALOGUE');
    expect(dialogue?.missingControls).toEqual(expect.arrayContaining(['HEAD', 'EYE_AIM', 'BLINK', 'JAW', 'MOUTH']));
  });

  it('requires every canonical role in each character combined-performance stress test', () => {
    const suite = compileRigAnimationCompatibilitySuite();
    const pipFull = suite.pip.find((test) => test.id === 'PIP_FULL_PERFORMANCE')!;
    const goatFull = suite.goat.find((test) => test.id === 'GOAT_FULL_PERFORMANCE')!;
    expect(new Set(pipFull.requiredControls)).toEqual(new Set(canonicalControlsFor('CHAR_PIP_001').map((control) => control.canonicalId)));
    expect(new Set(goatFull.requiredControls)).toEqual(new Set(canonicalControlsFor('CHAR_GOAT_001').map((control) => control.canonicalId)));
  });
});
