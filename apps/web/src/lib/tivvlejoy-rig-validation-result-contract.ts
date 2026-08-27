import { createHash } from 'node:crypto';
import { compileRigAnimationCompatibilitySuite } from './tivvlejoy-rig-animation-compatibility-suite';
import type { AdapterCharacterId } from './tivvlejoy-rig-control-adapter';

export const TIVVLEJOY_RIG_VALIDATION_RESULT_SCHEMA = 'TIVVLEJOY_RIG_VALIDATION_RESULT_V1' as const;

export type RigValidationTestResult = {
  testId: string;
  framesRendered: number;
  manifestSha256: string;
  playblastSha256: string;
  metricsSha256: string;
  stillsManifestSha256: string;
  workerReportedPass: boolean;
  metrics: {
    missingControls: string[];
    nonFiniteTransforms: number;
    frameReadErrors: number;
    objectBindingErrors: number;
    constraintErrors: number;
  };
};

export type RigValidationResultInput = {
  characterId: AdapterCharacterId;
  rigVersionId: string;
  rigSourceSha256: string;
  rigReceiptSha256: string;
  adapterSha256: string;
  compatibilitySuiteSha256: string;
  jobSha256: string;
  blenderVersion: string;
  fps: number;
  tests: RigValidationTestResult[];
};

const SHA = /^[a-f0-9]{64}$/i;
const UUID = /^[a-f0-9-]{36}$/i;

export function validateRigValidationResult(input: RigValidationResultInput) {
  const suite = compileRigAnimationCompatibilitySuite();
  const expectedTests = input.characterId === 'CHAR_PIP_001' ? suite.pip : suite.goat;
  const expectedById = new Map(expectedTests.map((test) => [test.id, test]));
  const errors: string[] = [];

  if (!UUID.test(input.rigVersionId)) errors.push('RIG_RESULT_VERSION_ID_INVALID');
  for (const [label, value] of [
    ['RIG_SOURCE', input.rigSourceSha256], ['RIG_RECEIPT', input.rigReceiptSha256],
    ['ADAPTER', input.adapterSha256], ['SUITE', input.compatibilitySuiteSha256], ['JOB', input.jobSha256],
  ] as const) if (!SHA.test(value)) errors.push(`RIG_RESULT_${label}_SHA_INVALID`);
  if (input.compatibilitySuiteSha256.toLowerCase() !== suite.suiteSha256) errors.push('RIG_RESULT_SUITE_SHA_MISMATCH');
  if (input.blenderVersion !== '4.2') errors.push('RIG_RESULT_BLENDER_VERSION_MISMATCH');
  if (input.fps !== 30) errors.push('RIG_RESULT_FPS_MISMATCH');
  if (!Array.isArray(input.tests) || input.tests.length === 0) errors.push('RIG_RESULT_TESTS_REQUIRED');

  const seen = new Set<string>();
  const rows = input.tests.map((result) => {
    const rowErrors: string[] = [];
    const expected = expectedById.get(result.testId);
    if (!expected) rowErrors.push('UNKNOWN_TEST_ID');
    if (seen.has(result.testId)) rowErrors.push('DUPLICATE_TEST_ID');
    seen.add(result.testId);
    if (expected && result.framesRendered !== expected.durationFrames) rowErrors.push('FRAME_COUNT_MISMATCH');
    for (const [label, value] of [
      ['MANIFEST', result.manifestSha256], ['PLAYBLAST', result.playblastSha256],
      ['METRICS', result.metricsSha256], ['STILLS', result.stillsManifestSha256],
    ] as const) if (!SHA.test(value)) rowErrors.push(`${label}_SHA_INVALID`);
    if (!result.metrics || !Array.isArray(result.metrics.missingControls)) rowErrors.push('METRICS_INVALID');
    const metricCounts = result.metrics ? [
      result.metrics.nonFiniteTransforms, result.metrics.frameReadErrors,
      result.metrics.objectBindingErrors, result.metrics.constraintErrors,
    ] : [];
    if (metricCounts.some((count) => !Number.isInteger(count) || count < 0)) rowErrors.push('METRIC_COUNT_INVALID');
    if (result.metrics?.missingControls.length) rowErrors.push('MISSING_CONTROLS_REPORTED');
    if (metricCounts.some((count) => count > 0)) rowErrors.push('TECHNICAL_ERRORS_REPORTED');
    const technicallyClean = Boolean(expected && rowErrors.length === 0 && result.workerReportedPass);
    return { testId: result.testId, technicallyClean, workerReportedPass: Boolean(result.workerReportedPass), errors: rowErrors };
  });

  for (const row of rows) for (const error of row.errors) errors.push(`RIG_RESULT_TEST:${row.testId}:${error}`);
  const allExpectedTestsPresent = input.tests.length === expectedTests.length && expectedTests.every((test) => seen.has(test.id));
  const allTechnicalRowsClean = rows.length > 0 && rows.every((row) => row.technicallyClean);
  const technicalSuiteComplete = errors.length === 0 && allExpectedTestsPresent && allTechnicalRowsClean;

  const normalized = {
    schemaVersion: TIVVLEJOY_RIG_VALIDATION_RESULT_SCHEMA,
    characterId: input.characterId,
    rigVersionId: input.rigVersionId,
    rigSourceSha256: input.rigSourceSha256.toLowerCase(),
    rigReceiptSha256: input.rigReceiptSha256.toLowerCase(),
    adapterSha256: input.adapterSha256.toLowerCase(),
    compatibilitySuiteSha256: input.compatibilitySuiteSha256.toLowerCase(),
    jobSha256: input.jobSha256.toLowerCase(),
    blenderVersion: input.blenderVersion,
    fps: input.fps,
    tests: input.tests,
  };
  const resultSha256 = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return {
    structurallyValid: errors.length === 0,
    technicalSuiteComplete,
    allExpectedTestsPresent,
    allTechnicalRowsClean,
    errors,
    rows,
    resultSha256,
    normalized,
    humanApproved: false as const,
    episodeAdmitted: false as const,
    productionEnabled: false as const,
  };
}
