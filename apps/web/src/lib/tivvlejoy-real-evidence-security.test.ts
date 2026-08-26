import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './tivvlejoy-production-persistence';
import { inspectZipArchive, buildStoredZip } from './tivvlejoy-real-scenery-inspection';
import {
  admitRigMetadata,
  assertNoSecrets,
  persistRealEvidence,
  verifySourceHash,
  compileFirstEpisodePreflight,
  bindEp012VoiceReceipts,
  RIG_MAX_BYTES,
} from './tivvlejoy-real-input-convergence';

describe('real evidence security', () => {
  it('rejects secret-bearing payloads', () => {
    expect(() => assertNoSecrets({ DATABASE_URL: 'postgres://user:pass@host/db' })).toThrow(/Secret-bearing/);
    expect(() => assertNoSecrets({ url: 'https://x?X-Amz-Signature=preview-placeholder' })).toThrow(/Secret-bearing/);
    expect(() => assertNoSecrets({ note: 'safe' })).not.toThrow();
  });

  it('fails closed on tampered hashes and oversized rigs', async () => {
    const hash = await verifySourceHash({
      sourceId: 'SRC',
      objectIdentity: 'obj',
      bytes: new TextEncoder().encode('abc'),
      expectedSha256: 'ff'.repeat(32),
    });
    expect(hash.state).toBe('HASH_MISMATCH');
    expect(
      admitRigMetadata({
        characterId: 'PIP',
        byteSize: RIG_MAX_BYTES + 1,
        extension: '.blend',
        sha256: 'ab'.repeat(32),
        evidenceClass: 'REAL_RIG_INTAKE',
      }).blocker,
    ).toBe('RIG_TOO_LARGE');
  });

  it('quarantines malicious archives and does not execute them', () => {
    const report = inspectZipArchive(buildStoredZip([{ name: '../secret.blend', data: 'x' }]));
    expect(report.state).toBe('ARCHIVE_UNSAFE_PATH');
    expect(report.executedEmbeddedScripts).toBe(false);
  });

  it('refuses to persist credential injection', () => {
    const store = createMemoryStore({ workspaceId: 'ws_sec' });
    expect(() =>
      persistRealEvidence({
        store,
        voice: {
          ...bindEp012VoiceReceipts(),
          bindings: [
            {
              dialogueRef: 'DL_HOOK_01',
              characterId: 'PIP',
              receiptRef: 'r',
              receiptSha256: null,
              timingReality: 'MISSING_REAL_AUDIO',
              realReceipt: false,
              syntheticOnly: true,
              blocker: 'ELEVENLABS key sk-testleak',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('does not let synthetic scenery or voice satisfy real preflight', () => {
    const preflight = compileFirstEpisodePreflight({
      voice: bindEp012VoiceReceipts(),
      candidates: [
        {
          assetCandidateId: 'cand:synthetic',
          sourceId: 'SRC_FAKE',
          sourceSha256: 'aa'.repeat(32),
          roles: ['BUILDING_HERO'],
          quality: ['HERO'],
          depth: ['FOREGROUND'],
          style: 'UNKNOWN',
          styleConfidence: 'LOW',
          heroCandidate: true,
          interiorCandidate: false,
          mountainCandidate: false,
          propCandidate: false,
          readyForVisualReview: true,
          technicallyBlocked: false,
          worldBuilderFeed: 'AVAILABLE_FOR_REVIEW',
          selectableApprovedAsset: false,
          humanApproved: false,
          evidenceRefs: ['geom'],
        },
      ],
      realApprovedLogicalAssets: 0,
      humanApprovals: 0,
      blenderAvailable: false,
      paidRenderAuthorized: false,
      realMediaReceipts: 0,
    });
    expect(preflight.subsystems.find((item) => item.subsystem === 'SCENERY')?.state).not.toBe('REAL_READY');
    expect(preflight.subsystems.find((item) => item.subsystem === 'VOICE')?.state).toBe('SYNTHETIC_ONLY');
    expect(preflight.realReadyShots).toBe(0);
  });
});
