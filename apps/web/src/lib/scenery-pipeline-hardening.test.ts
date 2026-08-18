import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertNoTokenReflection,
  assertTokenOnlyFromApprovedHeader,
  assertWriteStaysInApprovedNamespace,
  assessFilenameSafety,
  assessSourceSize,
  BLENDER_INSPECTION_CONTRACT,
  buildIntakeLifecycleEvent,
  classifyContentIdentity,
  classifyRecoveredState,
  createNonExecutingInspectionJob,
  createUploadSession,
  detectDuplicate,
  emptyIntakeCounts,
  evaluateInspectionEligibility,
  evaluateQuarantine,
  evaluateStoredVerification,
  EXPECTED_INSPECTION_CHECKS,
  EXPECTED_SOURCE_COUNT,
  handleSceneryIntakeAction,
  isPrefixEscapeAttempt,
  isSessionExpired,
  isUnicodeConfusableFilename,
  listExpectedSourceFiles,
  loadClientRecoverySnapshots,
  matchClientRecoverySnapshot,
  MemoryMultipartStorage,
  mobileLayoutHints,
  partsStillNeeded,
  PIPELINE_HARDENING_CHECKPOINT,
  announceIntakeState,
  recoveredStateLabel,
  redactStructuredValue,
  resetSceneryIntakeStore,
  reviewOneTapPurchasedSelection,
  runWithBoundedConcurrency,
  saveClientRecoverySnapshot,
  SCENERY_INTAKE_MAX_CONCURRENT_FILES,
  sha256HexChunked,
  shouldExcludeWorldShadersGiveaway,
  syntheticFixtureZip,
} from './scenery/intake';
import { resetIntakeRateLimit } from './scenery/intake/access';
import { evaluateProductionSafety } from './scenery/intake/production-safety';
import { CLIENT_RECOVERY_STORAGE_KEY } from './scenery/intake/client-recovery';
import { getSceneryIntakeStore } from './scenery/intake/store';
import { SCENERY_COPY } from './scenery/copy';

const repoRoot = path.resolve(__dirname, '../../../..');
const configuredEnv = {
  OBJECT_STORAGE_PROVIDER: 'r2',
  OBJECT_STORAGE_BUCKET: 'existing-studio-bucket',
  OBJECT_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'example-access-key',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'example-secret-key',
  OBJECT_STORAGE_REGION: 'auto',
  DATABASE_URL: 'postgresql://doodle:doodle@localhost:5432/doodle_dash',
};
const previewEnv = {
  ...configuredEnv,
  DATABASE_URL: undefined,
  VERCEL_ENV: 'preview',
  TIVVLEJOY_SCENERY_INTAKE_TOKEN: 'preview-studio-token',
};

afterEach(() => {
  resetSceneryIntakeStore();
  resetIntakeRateLimit();
});

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

async function completeVillageUpload(storage = new MemoryMultipartStorage()) {
  const bytes = syntheticFixtureZip('village');
  const sha256 = sha256HexChunked(bytes);
  const created = (await handleSceneryIntakeAction({
    action: 'create-session',
    body: {
      collectionId: 'village',
      filename: 'Village_Blender_4.2.2.zip',
      byteSize: bytes.byteLength,
      sha256,
    },
    env: configuredEnv,
    publicPreview: false,
    storage,
  })) as { session: { sessionId: string; parts: Array<{ partNumber: number }> } };
  const uploadId = [...storage.uploads.keys()][0]!;
  const etag = await storage.putPart(uploadId, 1, bytes);
  const completed = (await handleSceneryIntakeAction({
    action: 'complete',
    body: { sessionId: created.session.sessionId, parts: [{ partNumber: 1, etag }] },
    env: configuredEnv,
    publicPreview: false,
    storage,
  })) as {
    storedSize: number;
    alreadyCompleted?: boolean;
    ambiguousCompletion?: boolean;
    manifest: { verificationState: string; quarantineState: string; inspectionState: string };
    inspectionReadiness: { ready: boolean };
  };
  return { storage, bytes, sha256, created, completed };
}

describe('pipeline hardening inventory', () => {
  it('matches the exact 27 purchased filenames and four collections', () => {
    const expected = listExpectedSourceFiles();
    const review = reviewOneTapPurchasedSelection(
      expected.map((item) => ({ filename: item.expectedFilename, byteSize: 128 })),
    );
    expect(review.overallTotals.expected).toBe(EXPECTED_SOURCE_COUNT);
    expect(review.overallTotals.matched).toBe(27);
    expect(review.overallTotals.missing).toBe(0);
    expect(review.overallTotals.eligible).toBe(27);
    expect(review.collectionTotals.map((item) => `${item.collectionId}:${item.expected}`)).toEqual([
      'village:7',
      'sky-hdri:7',
      'stylized-forest:4',
      'procedural-nature:9',
    ]);
    expect(review.collectionTotals.reduce((sum, item) => sum + item.matched, 0)).toBe(27);
  });

  it('detects a missing file without renaming the others', () => {
    const expected = listExpectedSourceFiles();
    const review = reviewOneTapPurchasedSelection(
      expected.slice(1).map((item) => ({ filename: item.expectedFilename, byteSize: 128 })),
    );
    expect(review.missing).toHaveLength(1);
    expect(review.missing[0]?.expectedFilename).toBe(expected[0]?.expectedFilename);
    expect(review.eligible).toHaveLength(26);
  });

  it('refuses an unexpected file individually', () => {
    const review = reviewOneTapPurchasedSelection([
      { filename: 'Village_Blender_4.2.2.zip', byteSize: 128 },
      { filename: 'notes.txt', byteSize: 128 },
    ]);
    expect(review.unexpected[0]?.filename).toBe('notes.txt');
    expect(review.unexpected[0]?.eligible).toBe(false);
    expect(review.eligible).toHaveLength(1);
  });

  it('refuses a duplicate selected filename individually', () => {
    const review = reviewOneTapPurchasedSelection([
      { filename: 'SkyMachine_V2.zip', byteSize: 128 },
      { filename: 'SkyMachine_V2.zip', byteSize: 256 },
    ]);
    expect(review.duplicates).toHaveLength(1);
    expect(review.eligible).toHaveLength(1);
  });

  it('refuses an incorrect filename and does not silently rename it', () => {
    const review = reviewOneTapPurchasedSelection([{ filename: 'village blender', byteSize: 128 }]);
    expect(review.incorrect[0]?.filename).toBe('village blender');
    expect(review.incorrect[0]?.expectedFilename).toBe('Village_Blender_4.2.2.zip');
    expect(review.eligible).toHaveLength(0);
  });

  it('refuses a zero-byte file', () => {
    const review = reviewOneTapPurchasedSelection([
      { filename: 'Village_Textures.zip', byteSize: 0 },
    ]);
    expect(review.incorrect[0]?.reason).toMatch(/zero_byte/);
    expect(review.eligible).toHaveLength(0);
  });

  it('refuses an incorrectly sized file below the format minimum', () => {
    expect(assessSourceSize({ filename: 'Rock_Models.blend', declaredBytes: 8 }).ok).toBe(false);
    const review = reviewOneTapPurchasedSelection([{ filename: 'Rock_Models.blend', byteSize: 8 }]);
    expect(review.incorrect[0]?.eligible).toBe(false);
    expect(review.eligible).toHaveLength(0);
  });

  it('keeps the World Shaders giveaway outside the purchased 27 unless a manifest includes it', () => {
    expect(shouldExcludeWorldShadersGiveaway({ filename: 'World Shaders.zip' })).toBe(true);
    const review = reviewOneTapPurchasedSelection([
      { filename: 'World Shaders.zip', byteSize: 128 },
    ]);
    expect(review.unexpected[0]?.reason).toMatch(/World Shaders/);
    const included = reviewOneTapPurchasedSelection(
      [{ filename: 'World Shaders.zip', byteSize: 128 }],
      {
        approvedManifestFilenames: ['World Shaders.zip'],
      },
    );
    expect(included.unexpected[0]?.reason).not.toMatch(/World Shaders giveaway is outside/);
  });
});

describe('pipeline hardening duplicates and hashes', () => {
  it('classifies same-name/same-hash, same-name/different-hash, and different-name/same-hash', () => {
    const existing = [
      {
        sourceId: 'SRC_VILLAGE_BLEND_ZIP',
        collectionId: 'village' as const,
        filename: 'Village_Blender_4.2.2.zip',
        objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
        sha256: 'aaa',
        byteSize: 128,
      },
    ];
    expect(
      classifyContentIdentity({ sha256: 'aaa', filename: 'Village_Blender_4.2.2.zip', existing }),
    ).toBe('same_name_same_hash');
    expect(
      classifyContentIdentity({ sha256: 'bbb', filename: 'Village_Blender_4.2.2.zip', existing }),
    ).toBe('same_name_different_hash');
    expect(classifyContentIdentity({ sha256: 'aaa', filename: 'copy.zip', existing })).toBe(
      'different_name_same_hash',
    );
    expect(
      detectDuplicate({
        sha256: 'aaa',
        filename: 'Village_Blender_4.2.2.zip',
        collectionId: 'village',
        existing,
      }).status,
    ).toBe('already_present');
    expect(
      detectDuplicate({
        sha256: 'bbb',
        filename: 'Village_Blender_4.2.2.zip',
        collectionId: 'village',
        existing,
      }).status,
    ).toBe('filename_conflict');
    expect(
      detectDuplicate({ sha256: 'aaa', filename: 'copy.zip', collectionId: 'sky-hdri', existing })
        .status,
    ).toBe('exact_duplicate');
  });

  it('treats a hash mismatch as a verification failure', () => {
    const assessment = evaluateStoredVerification({
      declaredBytes: 128,
      storedBytes: 128,
      objectAvailable: true,
      sha256: 'aa',
      expectedSha256: 'bb',
      filename: 'Village_Blender_4.2.2.zip',
      uploadCompleted: true,
    });
    expect(assessment.ok).toBe(false);
    expect(assessment.reasons).toContain('hash_mismatch');
    expect(assessment.inspectionEligible).toBe(false);
  });
});

describe('pipeline hardening multipart recovery', () => {
  it('resumes an interrupted multipart upload and retries only missing parts', async () => {
    const storage = new MemoryMultipartStorage();
    const bytes = syntheticFixtureZip('sky');
    const created = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        collectionId: 'sky-hdri',
        filename: 'SkyMachine_V2.zip',
        byteSize: bytes.byteLength,
        sha256: sha256HexChunked(bytes),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string; parts: Array<{ partNumber: number }> } };
    await handleSceneryIntakeAction({
      action: 'sign-part',
      body: { sessionId: created.session.sessionId, partNumber: 1 },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    const resumed = (await handleSceneryIntakeAction({
      action: 'resume',
      body: { sessionId: created.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { nextPart: { partNumber: number } | null };
    expect(resumed.nextPart?.partNumber).toBe(1);
    expect(partsStillNeeded({ partCount: 4, uploadedPartNumbers: [1, 3] })).toEqual([2, 4]);
    const retried = await handleSceneryIntakeAction({
      action: 'retry-part',
      body: { sessionId: created.session.sessionId, partNumber: 1 },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(retried.partNumber).toBe(1);
    expect(JSON.stringify(retried)).not.toContain('example-secret-key');
  });

  it('restores refresh metadata without secrets and matches the re-selected file', () => {
    const store = memoryStore();
    saveClientRecoverySnapshot(
      {
        sessionId: 'session-1',
        sourceId: 'SRC_VILLAGE_BLEND_ZIP',
        collectionId: 'village',
        filename: 'Village_Blender_4.2.2.zip',
        byteSize: 128,
        uploadedPartNumbers: [1],
        lastPartNumber: 1,
        transferredBytes: 64,
        storedBytes: null,
        updatedAt: '2026-08-18T00:00:00.000Z',
        status: 'uploading',
      },
      store,
    );
    const loaded = loadClientRecoverySnapshots(store);
    expect(loaded).toHaveLength(1);
    expect(JSON.stringify(loaded)).not.toMatch(/token|secret|X-Amz/i);
    expect(store.getItem(CLIENT_RECOVERY_STORAGE_KEY)).not.toMatch(/token|secret/i);
    expect(
      matchClientRecoverySnapshot(loaded, { name: 'Village_Blender_4.2.2.zip', size: 128 })
        ?.sessionId,
    ).toBe('session-1');
    expect(
      matchClientRecoverySnapshot(loaded, { name: 'Village_Blender_4.2.2.zip', size: 64 }),
    ).toBeNull();
  });

  it('detects an expired upload session', async () => {
    const storage = new MemoryMultipartStorage();
    const created = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        collectionId: 'village',
        filename: 'Village_Textures.zip',
        byteSize: 128,
        sha256: 'ab'.repeat(32),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string } };
    const session = getSceneryIntakeStore().getSession(created.session.sessionId)!;
    session.createdAt = '2020-01-01T00:00:00.000Z';
    session.updatedAt = '2020-01-01T00:00:00.000Z';
    expect(isSessionExpired(session)).toBe(true);
    await expect(
      handleSceneryIntakeAction({
        action: 'sign-part',
        body: { sessionId: created.session.sessionId, partNumber: 1 },
        env: configuredEnv,
        publicPreview: false,
        storage,
      }),
    ).rejects.toThrow(/expired/i);
  });

  it('makes cancel and complete idempotent and recovers an ambiguous completion', async () => {
    const { storage, bytes, created, completed } = await completeVillageUpload();
    expect(completed.alreadyCompleted).toBeUndefined();
    const secondComplete = (await handleSceneryIntakeAction({
      action: 'complete',
      body: { sessionId: created.session.sessionId, parts: [{ partNumber: 1, etag: '"etag-1"' }] },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { alreadyCompleted: boolean };
    expect(secondComplete.alreadyCompleted).toBe(true);

    const abortTarget = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        collectionId: 'sky-hdri',
        filename: 'SkyMachine_V1.zip',
        byteSize: 128,
        sha256: sha256HexChunked(new Uint8Array(128)),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string } };
    const firstAbort = await handleSceneryIntakeAction({
      action: 'abort',
      body: { sessionId: abortTarget.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    const secondAbort = await handleSceneryIntakeAction({
      action: 'abort',
      body: { sessionId: abortTarget.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(firstAbort.aborted).toBe(true);
    expect(secondAbort.alreadyAborted).toBe(true);

    const otherBytes = syntheticFixtureZip('project');
    const ambiguous = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        collectionId: 'village',
        filename: 'Village_Project_File.zip',
        byteSize: otherBytes.byteLength,
        sha256: sha256HexChunked(otherBytes),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string; objectKey: string } };
    const uploadId = [...storage.uploads.entries()].find(
      ([, upload]) => upload.key === ambiguous.session.objectKey,
    )?.[0];
    if (!uploadId) throw new Error('Expected an open multipart upload for the ambiguous session.');
    const etag = await storage.putPart(uploadId, 1, otherBytes);
    await storage.completeMultipartUpload({
      key: ambiguous.session.objectKey,
      uploadId,
      parts: [{ partNumber: 1, etag }],
    });
    const recovered = (await handleSceneryIntakeAction({
      action: 'complete',
      body: { sessionId: ambiguous.session.sessionId, parts: [{ partNumber: 1, etag }] },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { ambiguousCompletion: boolean; storedSize: number };
    expect(recovered.ambiguousCompletion).toBe(true);
    expect(recovered.storedSize).toBe(otherBytes.byteLength);
  });
});

describe('pipeline hardening quarantine and inspection', () => {
  it('keeps corrupt or mismatched objects quarantined and not inspection-ready', () => {
    const quarantine = evaluateQuarantine({
      filename: 'Village_Blender_4.2.2.zip',
      collectionValid: true,
      byteSize: 128,
      sha256: 'aa',
      objectAvailable: true,
      sizeMatchesStored: false,
      unityPreservationOnly: false,
    });
    expect(quarantine.state).toBe('quarantined');
    expect(quarantine.eligibleForInspection).toBe(false);
    const job = createNonExecutingInspectionJob({
      jobId: 'INSPECT_VILLAGE_BLENDER',
      sourceId: 'SRC_VILLAGE_BLEND_ZIP',
      collectionId: 'village',
      originalFilename: 'Village_Blender_4.2.2.zip',
      objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
      byteSize: 128,
      sha256: 'aa'.repeat(32),
      verified: false,
    });
    expect(job.executing).toBe(false);
    expect(job.autoApprove).toBe(false);
    expect(job.queued).toBe(false);
    expect(job.expectedChecks).toEqual(EXPECTED_INSPECTION_CHECKS);
    expect(BLENDER_INSPECTION_CONTRACT.autoApprove).toBe(false);
    expect(BLENDER_INSPECTION_CONTRACT.executeEmbeddedScripts).toBe(false);
  });

  it('gates inspection readiness on completed verification', async () => {
    const { completed } = await completeVillageUpload();
    expect(completed.manifest.verificationState).toBe('size_verified');
    expect(['inspection_ready', 'not_eligible']).toContain(completed.manifest.inspectionState);
    expect(completed.inspectionReadiness.ready).toBe(
      completed.manifest.inspectionState === 'inspection_ready',
    );
    const blocked = evaluateInspectionEligibility({
      schemaVersion: 'TIVVLEJOY_SCENERY_ASSET_INTAKE_V1',
      sourceId: 'SRC_VILLAGE_BLEND_ZIP',
      collectionId: 'village',
      originalFilename: 'Village_Blender_4.2.2.zip',
      normalizedFilename: 'Village_Blender_4.2.2.zip',
      storageObjectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
      byteSize: 128,
      sha256: '',
      mimeType: 'application/zip',
      extension: '.zip',
      uploadState: 'uploading',
      verificationState: 'not_verified',
      quarantineState: 'quarantined',
      inspectionState: 'not_eligible',
      blenderCompatibilityState: 'unknown',
      uploaderSession: {
        sessionId: 's',
        createdAt: '2026-08-18T00:00:00.000Z',
        publicPreview: true,
      },
      createdAt: '2026-08-18T00:00:00.000Z',
      verifiedAt: null,
      provenanceLicenseRef: 'LICENSE_PENDING — attach the purchased license before approval',
      immutableSourceVersion: 1,
      signedUrlStored: false,
      independentServerSha256: 'unavailable_in_this_environment',
      notes: [],
    });
    expect(blocked.ready).toBe(false);
  });
});

describe('pipeline hardening security', () => {
  it('refuses namespace escape, traversal, and Unicode-confusable filenames', () => {
    expect(isPrefixEscapeAttempt('tivvlejoy-assets/../secret.zip')).toBe(true);
    expect(isPrefixEscapeAttempt('other-prefix/source/village/Village_Blender_4.2.2.zip')).toBe(
      true,
    );
    expect(() =>
      assertWriteStaysInApprovedNamespace(
        'tivvlejoy-assets/../source/village/Village_Blender_4.2.2.zip',
      ),
    ).toThrow(/namespace|unsafe/i);
    expect(assessFilenameSafety('../Village_Blender_4.2.2.zip').issues).toContain('path_traversal');
    expect(assessFilenameSafety('/etc/passwd.zip').issues).toContain('prefix_escape');
    expect(isUnicodeConfusableFilename('Vіllage_Blender_4.2.2.zip')).toBe(true);
    const review = reviewOneTapPurchasedSelection([
      { filename: '../Village_Blender_4.2.2.zip', byteSize: 128 },
      { filename: 'Vіllage_Blender_4.2.2.zip', byteSize: 128 },
    ]);
    expect(review.incorrect).toHaveLength(2);
    expect(review.eligible).toHaveLength(0);
    expect(() =>
      createUploadSession({
        collectionId: 'village',
        originalFilename: '../Village_Blender_4.2.2.zip',
        byteSize: 128,
        env: configuredEnv,
      }),
    ).toThrow(/unsafe/i);
  });

  it('requires the Preview token, refuses an invalid token, and never reflects it', async () => {
    const storage = new MemoryMultipartStorage();
    await expect(
      handleSceneryIntakeAction({
        action: 'create-session',
        body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 128 },
        env: previewEnv,
        publicPreview: true,
        studioToken: '',
        storage,
      }),
    ).rejects.toThrow(/authorized TivvleJoy studio/);
    await expect(
      handleSceneryIntakeAction({
        action: 'create-session',
        body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 128 },
        env: previewEnv,
        publicPreview: true,
        studioToken: 'wrong-token',
        storage,
      }),
    ).rejects.toThrow(/authorized TivvleJoy studio/);
    expect(() => assertTokenOnlyFromApprovedHeader({ token: 'preview-studio-token' })).toThrow(
      /approved studio header/,
    );
    const created = await handleSceneryIntakeAction({
      action: 'create-session',
      body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 128 },
      env: previewEnv,
      publicPreview: true,
      studioToken: 'preview-studio-token',
      storage,
    });
    expect(JSON.stringify(created)).not.toContain('preview-studio-token');
    expect(() => assertNoTokenReflection(created, 'preview-studio-token')).not.toThrow();
    const event = buildIntakeLifecycleEvent('scenery.intake.session.created', {
      sessionId: 's',
      sourceId: 'SRC_VILLAGE_BLEND_ZIP',
      collectionId: 'village',
      state: 'created',
      counts: emptyIntakeCounts(),
    });
    const signedMarker = ['X-Amz', 'Signature'].join('-');
    expect(
      JSON.stringify(
        redactStructuredValue({
          ...event,
          signedUrl: `https://example.invalid?${signedMarker}=abc`,
        }),
      ),
    ).not.toContain(signedMarker);
  });

  it('leaves Production configuration untouched and does not commit licensed files', () => {
    const safety = evaluateProductionSafety(repoRoot);
    expect(safety.productionModified).toBe(false);
    expect(safety.existingPreviewR2Modified).toBe(false);
    expect(safety.licensed_files_committed).toBe(false);
    expect(safety.token_printed).toBe(false);
    expect(safety.gitSafetyOk).toBe(true);
    expect(PIPELINE_HARDENING_CHECKPOINT).toBe('TIVVLEJOY_SCENERY_PIPELINE_HARDENING_V1');
  });
});

describe('pipeline hardening ux and accessibility', () => {
  it('keeps mobile layout tokens and does not communicate state by color alone', () => {
    const ui = [
      readFileSync(
        path.join(repoRoot, 'apps/web/src/components/preview/SceneryAssetIntake.tsx'),
        'utf8',
      ),
      readFileSync(path.join(repoRoot, 'apps/web/src/lib/scenery/intake/intake-ux.ts'), 'utf8'),
      readFileSync(path.join(repoRoot, 'apps/web/src/lib/scenery/copy.ts'), 'utf8'),
    ].join('\n');
    for (const hint of mobileLayoutHints()) {
      expect(ui).toContain(hint);
    }
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain('htmlFor="tivvlejoy-scenery-intake-token"');
    expect(ui).toContain(SCENERY_COPY.oneTapSelectUpload);
    expect(ui).toContain('Select and upload all 27 purchased files');
    expect(ui).toContain('motion-safe:transition-all');
    expect(ui).not.toMatch(/DoodleDash|Doodle Dash|\bDDP\b/);
    expect(recoveredStateLabel('quarantined')).toBe('Quarantined');
    expect(
      announceIntakeState({ filename: 'Village_Blender_4.2.2.zip', state: 'stored' }),
    ).toContain('Upload does not mean asset approval');
    expect(
      classifyRecoveredState({
        session: {
          state: 'paused',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    ).toBe('paused');
  });

  it('bounds file concurrency so 27 large files are not all in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 27 }, (_, index) => index);
    await runWithBoundedConcurrency(items, SCENERY_INTAKE_MAX_CONCURRENT_FILES, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(SCENERY_INTAKE_MAX_CONCURRENT_FILES);
    expect(SCENERY_INTAKE_MAX_CONCURRENT_FILES).toBe(2);
  });
});
