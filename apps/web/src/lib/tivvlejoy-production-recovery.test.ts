import { describe, expect, it } from 'vitest';
import {
  detectStaleResult,
  evaluateJobRecovery,
  jobIdempotencyKey,
} from './tivvlejoy-production-studio/recovery';
import type { ProductionJob } from './tivvlejoy-production-studio/types';

function job(partial: Partial<ProductionJob> = {}): ProductionJob {
  const base: ProductionJob = {
    jobId: 'JOB_QC_1',
    jobType: 'QC',
    episodeId: 'EP012',
    shotId: 'SH001',
    inputDependencySha256: 'aa'.repeat(32),
    attemptNumber: 1,
    idempotencyKey: '',
    checkpointRef: 'CK1',
    resultReceiptRef: null,
    retryClass: 'SAFE_RETRY',
    authorizationReceiptRef: null,
    ...partial,
  };
  return { ...base, idempotencyKey: base.idempotencyKey || jobIdempotencyKey(base) };
}

describe('production recovery', () => {
  it('reuses a successful result for the same QC input', () => {
    const current = job();
    const report = evaluateJobRecovery(current, {
      idempotencyKey: current.idempotencyKey,
      inputDependencySha256: current.inputDependencySha256,
      resultReceiptRef: 'QC_OK',
      success: true,
    });
    expect(report.decision).toBe('REUSE_EXISTING_RESULT');
    expect(report.schemaVersion).toBe('TIVVLEJOY_PRODUCTION_RECOVERY_V1');
  });

  it('reuses a paid render only when the authorization receipt matches', () => {
    const current = job({
      jobType: 'RENDER',
      retryClass: 'REQUIRES_NEW_AUTHORIZATION',
      authorizationReceiptRef: 'AUTH_1',
    });
    const report = evaluateJobRecovery(current, {
      idempotencyKey: current.idempotencyKey,
      inputDependencySha256: current.inputDependencySha256,
      authorizationReceiptRef: 'AUTH_1',
      resultReceiptRef: 'RENDER_OK',
      success: true,
    });
    expect(report.decision).toBe('REUSE_EXISTING_RESULT');
    expect(report.reason).toMatch(/authorization already succeeded/);
  });

  it('does not duplicate a paid render when the UI retries without authorization', () => {
    const current = job({
      jobType: 'RENDER',
      retryClass: 'REQUIRES_NEW_AUTHORIZATION',
      authorizationReceiptRef: null,
    });
    const report = evaluateJobRecovery(current, {
      idempotencyKey: current.idempotencyKey,
      inputDependencySha256: current.inputDependencySha256,
      authorizationReceiptRef: 'AUTH_1',
      resultReceiptRef: 'RENDER_OK',
      success: true,
    });
    expect(report.decision).toBe('REQUIRES_NEW_AUTHORIZATION');
  });

  it('refuses silent paid retry when no prior result exists', () => {
    const report = evaluateJobRecovery(job({ jobType: 'RENDER', retryClass: 'REQUIRES_NEW_AUTHORIZATION' }), null);
    expect(report.decision).toBe('REQUIRES_NEW_AUTHORIZATION');
  });

  it('detects a stale asset hash', () => {
    expect(detectStaleResult({ previousAssetSha256: '11'.repeat(32), currentAssetSha256: '22'.repeat(32) })).toEqual([
      'asset changed',
    ]);
  });

  it('detects a stale voice receipt', () => {
    expect(detectStaleResult({ previousVoiceSha256: '11'.repeat(32), currentVoiceSha256: '33'.repeat(32) })).toContain(
      'voice changed',
    );
  });

  it('detects a stale shot assembly hash', () => {
    expect(detectStaleResult({ previousShotSha256: '11'.repeat(32), currentShotSha256: '44'.repeat(32) })).toContain(
      'shot changed',
    );
  });

  it('detects a stale visual approval', () => {
    expect(
      detectStaleResult({ previousApprovalSha256: '11'.repeat(32), currentApprovalSha256: '55'.repeat(32) }),
    ).toContain('approval changed');
  });

  it('does not mark unchanged hashes stale', () => {
    expect(
      detectStaleResult({
        previousAssetSha256: '11'.repeat(32),
        currentAssetSha256: '11'.repeat(32),
        previousVoiceSha256: '22'.repeat(32),
        currentVoiceSha256: '22'.repeat(32),
      }),
    ).toEqual([]);
  });

  it('overrides reuse when the result is stale', () => {
    const current = job();
    const report = evaluateJobRecovery(
      current,
      {
        idempotencyKey: current.idempotencyKey,
        inputDependencySha256: current.inputDependencySha256,
        resultReceiptRef: 'OLD',
        success: true,
      },
      detectStaleResult({ previousAssetSha256: '11'.repeat(32), currentAssetSha256: '99'.repeat(32) }),
    );
    expect(report.decision).toBe('STALE_RESULT');
    expect(report.reason).toMatch(/asset changed/);
  });

  it('requires human review when classified that way', () => {
    expect(evaluateJobRecovery(job({ retryClass: 'REQUIRES_HUMAN_REVIEW' }), null).decision).toBe('REQUIRES_HUMAN_REVIEW');
  });

  it('requires revalidation when hashes must be checked again', () => {
    expect(evaluateJobRecovery(job({ retryClass: 'REQUIRES_REVALIDATION' }), null).decision).toBe('REQUIRES_REVALIDATION');
  });

  it('honors DO_NOT_RETRY', () => {
    expect(evaluateJobRecovery(job({ retryClass: 'DO_NOT_RETRY' }), null).decision).toBe('DO_NOT_RETRY');
  });

  it('uses the same idempotency key for the same type, input, and auth', () => {
    expect(jobIdempotencyKey(job())).toBe(jobIdempotencyKey(job({ jobId: 'OTHER', attemptNumber: 9 })));
  });

  it('changes the idempotency key when the input hash changes', () => {
    expect(jobIdempotencyKey(job())).not.toBe(jobIdempotencyKey(job({ inputDependencySha256: 'bb'.repeat(32) })));
  });

  it('changes the idempotency key when authorization changes', () => {
    expect(jobIdempotencyKey(job({ jobType: 'RENDER', authorizationReceiptRef: 'A' }))).not.toBe(
      jobIdempotencyKey(job({ jobType: 'RENDER', authorizationReceiptRef: 'B' })),
    );
  });

  it('does not reuse a failed prior result', () => {
    const current = job();
    expect(
      evaluateJobRecovery(current, {
        idempotencyKey: current.idempotencyKey,
        inputDependencySha256: current.inputDependencySha256,
        resultReceiptRef: 'FAIL',
        success: false,
      }).decision,
    ).toBe('SAFE_RETRY');
  });

  it('does not reuse a result from a different input', () => {
    const current = job();
    expect(
      evaluateJobRecovery(current, {
        idempotencyKey: current.idempotencyKey,
        inputDependencySha256: 'ff'.repeat(32),
        resultReceiptRef: 'OLD',
        success: true,
      }).decision,
    ).toBe('SAFE_RETRY');
  });

  it('simulates a browser restart by reconstructing the same job identity', () => {
    const first = job({ checkpointRef: 'CK_BROWSER' });
    const restarted = job({ jobId: 'JOB_QC_1', checkpointRef: null, attemptNumber: 2 });
    expect(restarted.idempotencyKey).toBe(first.idempotencyKey);
    expect(
      evaluateJobRecovery(restarted, {
        idempotencyKey: first.idempotencyKey,
        inputDependencySha256: first.inputDependencySha256,
        resultReceiptRef: 'SAVED',
        success: true,
      }).decision,
    ).toBe('REUSE_EXISTING_RESULT');
  });

  it('simulates a worker crash with a checkpoint but no result as a safe retry', () => {
    const report = evaluateJobRecovery(job({ checkpointRef: 'PARTIAL', resultReceiptRef: null }), null);
    expect(report.decision).toBe('SAFE_RETRY');
    expect(report.reason).toBe('no prior result');
  });

  it('simulates a duplicated request as reuse', () => {
    const current = job({ attemptNumber: 4 });
    expect(
      evaluateJobRecovery(current, {
        idempotencyKey: current.idempotencyKey,
        inputDependencySha256: current.inputDependencySha256,
        resultReceiptRef: 'DONE',
        success: true,
      }).decision,
    ).toBe('REUSE_EXISTING_RESULT');
  });

  it('simulates a network interruption as safe retry when no receipt exists', () => {
    expect(evaluateJobRecovery(job({ jobType: 'AUDIO_MUX' }), null).decision).toBe('SAFE_RETRY');
  });

  it('does not let a stale voice satisfy a new dependency', () => {
    const current = job({ jobType: 'VOICE_PREP', inputDependencySha256: 'newvoice'.padEnd(64, '0') });
    const stale = detectStaleResult({ previousVoiceSha256: 'old'.padEnd(64, '0'), currentVoiceSha256: current.inputDependencySha256 });
    expect(
      evaluateJobRecovery(
        current,
        {
          idempotencyKey: current.idempotencyKey,
          inputDependencySha256: 'old'.padEnd(64, '0'),
          resultReceiptRef: 'OLD_VOICE',
          success: true,
        },
        stale,
      ).decision,
    ).toBe('STALE_RESULT');
  });

  it('does not issue a real authorization receipt', () => {
    const report = evaluateJobRecovery(job({ jobType: 'RENDER', retryClass: 'REQUIRES_NEW_AUTHORIZATION' }), null);
    expect(JSON.stringify(report)).not.toMatch(/Bearer |sk-|runpod/i);
  });

  it('is deterministic for the same recovery decision', () => {
    const current = job();
    const existing = {
      idempotencyKey: current.idempotencyKey,
      inputDependencySha256: current.inputDependencySha256,
      resultReceiptRef: 'QC_OK',
      success: true,
    };
    expect(evaluateJobRecovery(current, existing).recoverySha256).toBe(evaluateJobRecovery(current, existing).recoverySha256);
  });

  it('keeps attempt number out of the idempotency key', () => {
    expect(jobIdempotencyKey(job({ attemptNumber: 1 }))).toBe(jobIdempotencyKey(job({ attemptNumber: 8 })));
  });

  it('classifies a failed render with a prior auth as reuse only when success is true', () => {
    const current = job({ jobType: 'RENDER', authorizationReceiptRef: 'AUTH_1', retryClass: 'REQUIRES_NEW_AUTHORIZATION' });
    expect(
      evaluateJobRecovery(current, {
        idempotencyKey: current.idempotencyKey,
        inputDependencySha256: current.inputDependencySha256,
        authorizationReceiptRef: 'AUTH_1',
        resultReceiptRef: 'FAIL',
        success: false,
      }).decision,
    ).toBe('REQUIRES_NEW_AUTHORIZATION');
  });

  it('records job identity fields without launching work', () => {
    const current = job({ jobType: 'RENDER_PREFLIGHT' });
    expect(current.jobId).toBeTruthy();
    expect(current.inputDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(current.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
  });
});
