import { describe, expect, it } from 'vitest';
import { compileRigAnimationCompatibilitySuite } from './tivvlejoy-rig-animation-compatibility-suite';
import { compileRigValidationJob } from './tivvlejoy-rig-validation-job-contract';

const VERSION = '33333333-3333-4333-8333-333333333333';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

describe('TivvleJoy rig validation job contract', () => {
  it('compiles all Pip tests into a zero-authority job', () => {
    const result = compileRigValidationJob({ characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: SHA_A, rigReceiptSha256: SHA_B, adapterSha256: SHA_C });
    expect(result.valid).toBe(true);
    expect(result.payload.tests).toHaveLength(13);
    expect(result.payload.bindings.compatibilitySuiteSha256).toBe(compileRigAnimationCompatibilitySuite().suiteSha256);
    expect(result.payload.limits).toMatchObject({ maxGpuSpendUsd: 0, paidExecutionAuthorized: false });
    expect(result.payload.authority).toMatchObject({ canLaunchWorker: false, canCreatePaidPod: false, canWriteProduction: false, canApproveRig: false, requiresExplicitExecutionAuthorization: true, requiresHumanApprovalAfterExecution: true });
    expect(result.jobSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('supports a bounded subset without increasing authority', () => {
    const result = compileRigValidationJob({ characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: SHA_A, rigReceiptSha256: SHA_B, adapterSha256: SHA_C, requestedTestIds: ['GOAT_WALK', 'GOAT_DIALOGUE'] });
    expect(result.valid).toBe(true);
    expect(result.payload.tests.map((test) => test.testId)).toEqual(['GOAT_WALK', 'GOAT_DIALOGUE']);
    expect(result.payload.limits.maxTotalFrames).toBe(168);
    expect(result.payload.authority.canLaunchWorker).toBe(false);
  });

  it('rejects unknown tests and bad binding hashes before execution', () => {
    const result = compileRigValidationJob({ characterId: 'CHAR_GOAT_001', rigVersionId: 'bad', rigSourceSha256: 'bad', rigReceiptSha256: SHA_B, adapterSha256: SHA_C, requestedTestIds: ['NOPE'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['RIG_VALIDATION_JOB_VERSION_ID_INVALID','RIG_VALIDATION_JOB_RIG_SOURCE_SHA_INVALID','RIG_VALIDATION_JOB_UNKNOWN_TEST_ID','RIG_VALIDATION_JOB_NO_TESTS']));
    expect(result.payload.authority.canCreatePaidPod).toBe(false);
  });

  it('writes every validation artifact under the exact character rig version namespace', () => {
    const result = compileRigValidationJob({ characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: SHA_A, rigReceiptSha256: SHA_B, adapterSha256: SHA_C, requestedTestIds: ['PIP_WALK'] });
    expect(result.payload.tests[0]!.output.playblastKey).toContain(`characters/CHAR_PIP_001/rig-deliveries/${VERSION}/validation/PIP_WALK/`);
  });
});
