import { describe, expect, it } from 'vitest';
import { compileRigAnimationCompatibilitySuite } from './tivvlejoy-rig-animation-compatibility-suite';
import { validateRigValidationResult, type RigValidationResultInput } from './tivvlejoy-rig-validation-result-contract';

const VERSION = '55555555-5555-4555-8555-555555555555';
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function cleanResult(characterId: 'CHAR_PIP_001' | 'CHAR_GOAT_001'): RigValidationResultInput {
  const suite = compileRigAnimationCompatibilitySuite();
  const tests = characterId === 'CHAR_PIP_001' ? suite.pip : suite.goat;
  return {
    characterId,
    rigVersionId: VERSION,
    rigSourceSha256: A,
    rigReceiptSha256: B,
    adapterSha256: C,
    compatibilitySuiteSha256: suite.suiteSha256,
    jobSha256: D,
    blenderVersion: '4.2',
    fps: 30,
    tests: tests.map((test, index) => ({
      testId: test.id,
      framesRendered: test.durationFrames,
      manifestSha256: (index % 2 ? A : B),
      playblastSha256: C,
      metricsSha256: D,
      stillsManifestSha256: A,
      workerReportedPass: true,
      metrics: { missingControls: [], nonFiniteTransforms: 0, frameReadErrors: 0, objectBindingErrors: 0, constraintErrors: 0 },
    })),
  };
}

describe('rig validation result contract', () => {
  it('accepts a technically clean complete Pip suite but grants no human or production approval', () => {
    const result = validateRigValidationResult(cleanResult('CHAR_PIP_001'));
    expect(result).toMatchObject({ structurallyValid: true, technicalSuiteComplete: true, allExpectedTestsPresent: true, allTechnicalRowsClean: true, humanApproved: false, episodeAdmitted: false, productionEnabled: false });
    expect(result.rows).toHaveLength(13);
    expect(result.resultSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires every expected Goat test before declaring technical suite complete', () => {
    const input = cleanResult('CHAR_GOAT_001');
    input.tests.pop();
    const result = validateRigValidationResult(input);
    expect(result.structurallyValid).toBe(true);
    expect(result.allExpectedTestsPresent).toBe(false);
    expect(result.technicalSuiteComplete).toBe(false);
    expect(result.humanApproved).toBe(false);
  });

  it('rejects worker pass claims when metrics report errors or missing controls', () => {
    const input = cleanResult('CHAR_PIP_001');
    input.tests[0]!.metrics.constraintErrors = 1;
    input.tests[1]!.metrics.missingControls = ['WING_L'];
    const result = validateRigValidationResult(input);
    expect(result.structurallyValid).toBe(false);
    expect(result.technicalSuiteComplete).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      `RIG_RESULT_TEST:${input.tests[0]!.testId}:TECHNICAL_ERRORS_REPORTED`,
      `RIG_RESULT_TEST:${input.tests[1]!.testId}:MISSING_CONTROLS_REPORTED`,
    ]));
  });

  it('rejects Blender/fps/suite identity drift and wrong frame counts', () => {
    const input = cleanResult('CHAR_GOAT_001');
    input.blenderVersion = '4.3';
    input.fps = 24;
    input.compatibilitySuiteSha256 = A;
    input.tests[0]!.framesRendered += 1;
    const result = validateRigValidationResult(input);
    expect(result.structurallyValid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['RIG_RESULT_SUITE_SHA_MISMATCH','RIG_RESULT_BLENDER_VERSION_MISMATCH','RIG_RESULT_FPS_MISMATCH',`RIG_RESULT_TEST:${input.tests[0]!.testId}:FRAME_COUNT_MISMATCH`]));
  });

  it('rejects duplicate and unknown test IDs', () => {
    const input = cleanResult('CHAR_GOAT_001');
    input.tests[1]!.testId = input.tests[0]!.testId;
    input.tests[2]!.testId = 'GOAT_UNKNOWN';
    const result = validateRigValidationResult(input);
    expect(result.structurallyValid).toBe(false);
    expect(result.errors.some((value) => value.endsWith(':DUPLICATE_TEST_ID'))).toBe(true);
    expect(result.errors).toContain('RIG_RESULT_TEST:GOAT_UNKNOWN:UNKNOWN_TEST_ID');
  });
});
