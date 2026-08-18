import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAllowedExtension,
  assertInventoryCounts,
  assertSafeRelativeArchivePath,
  assertSingleTextureTierMaterialized,
  buildMinimalZip,
  clientHashUsesChunkedReads,
  createQueuedInspectionJobs,
  createUploadSession,
  describeSceneryStorageConfiguration,
  detectDuplicate,
  evaluateInspectionEligibility,
  evaluateQuarantine,
  EXPECTED_COLLECTION_COUNT,
  EXPECTED_SOURCE_COUNT,
  handleSceneryIntakeAction,
  inventoryZipBytes,
  listExpectedSourceFiles,
  MemoryMultipartStorage,
  ONE_TAP_UPLOAD_CHECKPOINT,
  reviewOneTapPurchasedSelection,
  planHashChunks,
  planMultipartParts,
  publicIntakeSnapshot,
  resetSceneryIntakeStore,
  getSceneryIntakeStore,
  resolveImmutableWrite,
  sanitizeFilename,
  sceneryObjectKey,
  sha256HexChunked,
  sha256HexStreaming,
  syntheticExecutableZip,
  syntheticFixtureZip,
  syntheticTraversalZip,
  validateSourceObjectManifest,
} from './scenery/intake';
import { resetIntakeRateLimit } from './scenery/intake/access';
import { SCENERY_INTAKE_SCHEMA_VERSION } from './scenery/intake/config';
import { createEmptyManifestRecord } from './scenery/intake/manifest';
import { scanTrackedAndStagedFiles } from './scenery/intake/git-safety';
import {
  BLENDER_INSPECTION_CONTRACT,
  describeBlenderAvailability,
} from './scenery/intake/blender-contract';
import { buildPublicScenerySnapshot } from './scenery/snapshot';
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

afterEach(() => {
  resetSceneryIntakeStore();
  resetIntakeRateLimit();
});

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('scenery storage configuration', () => {
  it('reports unavailable when existing R2 credentials are absent', () => {
    const status = describeSceneryStorageConfiguration({});
    expect(status.state).toBe('unavailable');
    expect(status.configured).toBe(false);
    expect(JSON.stringify(status)).not.toMatch(/example-secret-key/);
  });

  it('reports partially_configured when only some existing vars are present', () => {
    const status = describeSceneryStorageConfiguration({
      R2_BUCKET: 'existing-studio-bucket',
      R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    });
    expect(status.state).toBe('partially_configured');
    expect(status.reusedExistingProvider).toBe(true);
    expect(status.prefix).toBe('tivvlejoy-assets');
  });

  it('reports configured when existing R2 aliases are complete, without printing secrets', () => {
    const status = describeSceneryStorageConfiguration(configuredEnv);
    expect(status.state).toBe('configured');
    expect(status.durable).toBe(true);
    expect(status.bucketPresent).toBe(true);
    expect(JSON.stringify(status)).not.toContain(configuredEnv.OBJECT_STORAGE_SECRET_ACCESS_KEY);
    expect(JSON.stringify(status)).not.toContain(configuredEnv.OBJECT_STORAGE_ACCESS_KEY_ID);
  });

  it('reports invalid when provider is s3-compatible but incomplete', () => {
    expect(
      describeSceneryStorageConfiguration({
        OBJECT_STORAGE_PROVIDER: 's3',
        OBJECT_STORAGE_BUCKET: '',
      }).state,
    ).toBe('invalid');
  });
});

describe('object keys, filenames, and allowlists', () => {
  it('sanitizes filenames and builds source keys under the private prefix', () => {
    expect(sanitizeFilename('Village Blender 4.2.2.zip')).toBe('Village Blender 4.2.2.zip');
    expect(
      sceneryObjectKey({
        prefix: 'tivvlejoy-assets',
        kind: 'source',
        collection: 'village',
        filename: 'Village_Blender_4.2.2.zip',
      }),
    ).toBe('tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip');
    expect(() => sanitizeFilename('../secret.zip')).not.toThrow();
    expect(sanitizeFilename('../secret.zip')).toBe('secret.zip');
    expect(() => assertAllowedExtension('payload.exe')).toThrow(/Unsupported executable/);
    expect(assertAllowedExtension('Village - Built-in.unitypackage.gz')).toBe('.unitypackage.gz');
    expect(() => assertAllowedExtension('unrelated-archive.gz')).toThrow(
      /Unsupported scenery file extension/,
    );
    expect(() => assertSafeRelativeArchivePath('../escape/file.blend')).toThrow(/traversal/);
    expect(() => assertSafeRelativeArchivePath('/abs/file.blend')).toThrow(/absolute/);
    expect(() =>
      sceneryObjectKey({
        prefix: 'tivvlejoy-assets',
        kind: 'source',
        collection: 'not-a-collection',
        filename: 'Village_Blender_4.2.2.zip',
      }),
    ).toThrow(/Unknown scenery collection/);
  });

  it('keeps the expected inventory at 27 files and 4 collections', () => {
    expect(assertInventoryCounts()).toEqual({
      sourceCount: EXPECTED_SOURCE_COUNT,
      collectionCount: EXPECTED_COLLECTION_COUNT,
    });
    expect(listExpectedSourceFiles()).toHaveLength(27);
  });
});

describe('one-tap purchased selection review', () => {
  it('auto-maps the exact saved filenames and known download-name variants', () => {
    const review = reviewOneTapPurchasedSelection([
      { filename: 'Extra Update 1.zip', byteSize: 10_659_392 },
      { filename: 'SkyMachineV1.zip', byteSize: 46_914_963 },
      { filename: 'SkyMachineV2.zip', byteSize: 51_240_289 },
      { filename: 'HDRI_Part_2.zip', byteSize: 107_061_098 },
    ]);
    expect(review.eligible).toHaveLength(4);
    expect(review.eligible.slice(0, 3).every((item) => item.collectionId === 'sky-hdri')).toBe(
      true,
    );
    expect(review.eligible[3]?.collectionId).toBe('stylized-forest');
  });

  it('maps mixed exact filenames into all four collections and refuses others individually', () => {
    const review = reviewOneTapPurchasedSelection([
      { filename: 'Village_Blender_4.2.2.zip', byteSize: 1024 },
      { filename: 'SkyMachine_V2.zip', byteSize: 1024 },
      { filename: 'Stylized_Forest_Nature_Kit.zip', byteSize: 1024 },
      { filename: 'Rock_Models.blend', byteSize: 128 },
      { filename: 'Village_Blender_4.2.2.zip', byteSize: 1024 },
      { filename: 'village blender', byteSize: 1024 },
      { filename: 'not-a-purchased-file.exe', byteSize: 1024 },
      { filename: 'Flora_Mat&GN&Models.blend.zip', byteSize: 1024 },
    ]);
    expect(review.checkpoint).toBe(ONE_TAP_UPLOAD_CHECKPOINT);
    expect(review.expectedCount).toBe(27);
    expect(new Set(review.matched.map((item) => item.collectionId))).toEqual(
      new Set(['village', 'sky-hdri', 'stylized-forest', 'procedural-nature']),
    );
    expect(review.eligible).toHaveLength(5);
    expect(review.duplicates).toHaveLength(1);
    expect(review.incorrect[0]?.filename).toBe('village blender');
    expect(review.unexpected[0]?.filename).toBe('not-a-purchased-file.exe');
    expect(review.eligible.every((item) => item.eligible)).toBe(true);
    expect(review.unexpected[0]?.eligible).toBe(false);
    expect(review.incorrect[0]?.eligible).toBe(false);
    expect(review.duplicates[0]?.eligible).toBe(false);
    expect(review.missing).toHaveLength(22);
    expect(review.collectionTotals.map((item) => item.collectionId)).toEqual([
      'village',
      'sky-hdri',
      'stylized-forest',
      'procedural-nature',
    ]);
    expect(review.collectionTotals.find((item) => item.collectionId === 'village')?.matched).toBe(
      1,
    );
    expect(
      review.collectionTotals.find((item) => item.collectionId === 'procedural-nature')?.bytes,
    ).toBe(1152);
    expect(review.overallTotals.expected).toBe(27);
    expect(review.overallTotals.eligible).toBe(5);
  });
});

describe('multipart session workflow', () => {
  it('plans large-file chunks and creates a connection-ready session without credentials', async () => {
    const parts = planMultipartParts(700 * 1024 * 1024, 16 * 1024 * 1024);
    expect(parts[0]?.start).toBe(0);
    expect(parts.at(-1)?.end).toBe(700 * 1024 * 1024);
    expect(parts.length).toBeGreaterThan(40);
    const created = createUploadSession({
      collectionId: 'village',
      originalFilename: 'Village_Blender_4.2.2.zip',
      byteSize: 128,
      env: { DATABASE_URL: configuredEnv.DATABASE_URL },
    });
    expect(created.session.connectionReadyOnly).toBe(true);
    expect(created.session.publicAcl).toBe(false);
    const result = await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        collectionId: 'village',
        filename: 'Village_Blender_4.2.2.zip',
        byteSize: 128,
      },
      env: { DATABASE_URL: configuredEnv.DATABASE_URL },
      publicPreview: false,
    });
    expect(result.connectionReadyOnly).toBe(true);
  });

  it('creates, signs, completes, resumes, and aborts mocked multipart uploads', async () => {
    const storage = new MemoryMultipartStorage();
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
    })) as {
      session: {
        sessionId: string;
        parts: Array<{ partNumber: number; start: number; end: number }>;
      };
    };

    const signed = await handleSceneryIntakeAction({
      action: 'sign-part',
      body: { sessionId: created.session.sessionId, partNumber: 1 },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(signed.signedUrl).toContain('memory://sign/');

    const etag = await storage.putPart(
      [...storage.uploads.values()][0] ? [...storage.uploads.keys()][0]! : '',
      1,
      bytes,
    );
    const completed = (await handleSceneryIntakeAction({
      action: 'complete',
      body: {
        sessionId: created.session.sessionId,
        parts: [{ partNumber: 1, etag }],
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { storedSize: number; manifest: { verificationState: string } };
    expect(completed.storedSize).toBe(bytes.byteLength);
    expect(completed.manifest.verificationState).toBe('size_verified');

    const second = createUploadSession({
      collectionId: 'village',
      originalFilename: 'Village_Blender_4.2.2.zip',
      byteSize: bytes.byteLength,
      sha256,
      existingIndex: getSceneryIntakeStore().index(),
      env: configuredEnv,
    });
    const resumed = await handleSceneryIntakeAction({
      action: 'resume',
      body: { sessionId: created.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(resumed.session).toBeTruthy();
    const abortTarget = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        collectionId: 'sky-hdri',
        filename: 'SkyMachine_V2.zip',
        byteSize: 64,
        sha256: sha256HexChunked(new Uint8Array(64)),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string } };
    const aborted = await handleSceneryIntakeAction({
      action: 'abort',
      body: { sessionId: abortTarget.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(aborted.aborted).toBe(true);
    expect(second.session.state).toBe('already_present');
  });

  it('refuses public-preview mutations and client-selected credentials', async () => {
    await expect(
      handleSceneryIntakeAction({
        action: 'create-session',
        body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 10 },
        env: {},
        publicPreview: true,
      }),
    ).rejects.toThrow(/authorized TivvleJoy studio/);
    await expect(
      handleSceneryIntakeAction({
        action: 'create-session',
        body: {
          collectionId: 'village',
          filename: 'Village_Blender_4.2.2.zip',
          byteSize: 10,
          secretAccessKey: 'nope',
        },
        env: configuredEnv,
        publicPreview: false,
      }),
    ).rejects.toThrow(/credentials/);
  });

  it('allows a matching Preview studio token and refuses Production or a wrong token', async () => {
    const storage = new MemoryMultipartStorage();
    const previewEnv = {
      ...configuredEnv,
      DATABASE_URL: undefined,
      TIVVLEJOY_SCENERY_INTAKE_TOKEN: 'preview-studio-token',
      VERCEL_ENV: 'preview',
    };
    await expect(
      handleSceneryIntakeAction({
        action: 'create-session',
        body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 10 },
        env: previewEnv,
        publicPreview: true,
        studioToken: 'wrong-token',
        storage,
      }),
    ).rejects.toThrow(/authorized TivvleJoy studio/);
    await expect(
      handleSceneryIntakeAction({
        action: 'create-session',
        body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 10 },
        env: { ...previewEnv, VERCEL_ENV: 'production' },
        publicPreview: true,
        studioToken: 'preview-studio-token',
        storage,
      }),
    ).rejects.toThrow(/Production/);
    const created = await handleSceneryIntakeAction({
      action: 'create-session',
      body: { collectionId: 'village', filename: 'Village_Blender_4.2.2.zip', byteSize: 10 },
      env: previewEnv,
      publicPreview: true,
      studioToken: 'preview-studio-token',
      storage,
    });
    expect(created.session).toBeTruthy();
  });
});

describe('hashing, duplicates, and immutability', () => {
  it('hashes large buffers in chunks and matches node crypto', () => {
    const bytes = new Uint8Array(1024 * 80);
    bytes.set([1, 2, 3, 9, 8, 7]);
    const expected = createHash('sha256').update(bytes).digest('hex');
    expect(sha256HexChunked(bytes, 1024)).toBe(expected);
    expect(sha256HexStreaming(bytes, 2048)).toBe(expected);
    expect(planHashChunks(700_000_000, 4_000_000).length).toBeGreaterThan(100);
    expect(clientHashUsesChunkedReads()).toBe(true);
  });

  it('detects same-hash duplicates and same-name conflicts', () => {
    const existing = [
      {
        sourceId: 'SRC_VILLAGE_BLEND_ZIP',
        collectionId: 'village' as const,
        filename: 'Village_Blender_4.2.2.zip',
        objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
        sha256: 'abc',
        byteSize: 10,
      },
    ];
    expect(
      detectDuplicate({
        sha256: 'abc',
        filename: 'Village_Blender_4.2.2.zip',
        collectionId: 'village',
        existing,
      }).status,
    ).toBe('already_present');
    expect(
      detectDuplicate({
        sha256: 'abc',
        filename: 'copy.zip',
        collectionId: 'sky-hdri',
        existing,
      }).status,
    ).toBe('exact_duplicate');
    expect(
      detectDuplicate({
        sha256: 'def',
        filename: 'Village_Blender_4.2.2.zip',
        collectionId: 'village',
        existing,
      }).status,
    ).toBe('filename_conflict');
    expect(
      resolveImmutableWrite({
        existing: { sha256: 'abc', byteSize: 10, objectKey: existing[0]!.objectKey },
        incomingSha256: 'def',
        incomingByteSize: 11,
      }),
    ).toBe('reject');
    expect(
      resolveImmutableWrite({
        existing: { sha256: 'abc', byteSize: 10, objectKey: existing[0]!.objectKey },
        incomingSha256: 'abc',
        incomingByteSize: 10,
      }),
    ).toBe('reuse');
  });
});

describe('archive inventory, quarantine, and manifests', () => {
  it('lists archive contents without extracting and rejects traversal or executables', () => {
    const ok = inventoryZipBytes(syntheticFixtureZip('village'));
    expect(ok.fileCount).toBe(2);
    expect(ok.executedAgainstStoredBytes).toBe(true);
    expect(ok.jpgFiles.length).toBe(1);
    expect(() =>
      inventoryZipBytes(syntheticTraversalZip()).findings.some(
        (item) => item.code === 'ARCHIVE_PATH_TRAVERSAL',
      ),
    ).not.toThrow();
    expect(
      inventoryZipBytes(syntheticTraversalZip()).findings.some(
        (item) => item.code === 'ARCHIVE_PATH_TRAVERSAL',
      ),
    ).toBe(true);
    expect(
      inventoryZipBytes(syntheticExecutableZip()).findings.some(
        (item) => item.code === 'PROHIBITED_EXTENSION',
      ),
    ).toBe(true);
    const nested = inventoryZipBytes(
      buildMinimalZip([{ path: 'inner.zip', content: new Uint8Array([1, 2, 3]) }]),
    );
    expect(nested.nestedArchives).toEqual(['inner.zip']);
  });

  it('validates intake manifests and inspection eligibility', () => {
    const manifest = createEmptyManifestRecord({
      sourceId: 'SRC_VILLAGE_BLEND_ZIP',
      collectionId: 'village',
      originalFilename: 'Village_Blender_4.2.2.zip',
      normalizedFilename: 'Village_Blender_4.2.2.zip',
      objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
      byteSize: 12,
      sha256: 'aa'.repeat(32),
      mimeType: 'application/zip',
      extension: '.zip',
      now: '2026-08-18T00:00:00.000Z',
    });
    expect(validateSourceObjectManifest(manifest).signedUrlStored).toBe(false);
    expect(evaluateInspectionEligibility(manifest).ready).toBe(false);
    const ready = evaluateInspectionEligibility({
      ...manifest,
      uploadState: 'completed',
      verificationState: 'size_verified',
      quarantineState: 'not_quarantined',
    });
    expect(ready.ready).toBe(true);
    const jobs = createQueuedInspectionJobs([
      {
        ...manifest,
        uploadState: 'completed',
        verificationState: 'size_verified',
        quarantineState: 'not_quarantined',
        inspectionState: 'inspection_ready',
      },
    ]);
    expect(jobs).toHaveLength(10);
    expect(jobs.find((job) => job.jobId === 'INSPECT_VILLAGE_BLENDER')?.ready).toBe(true);
    expect(
      jobs.find((job) => job.jobId === 'INSPECT_VILLAGE_BLENDER')?.dryRunReport?.realExecution,
    ).toBe('not_run');
    expect(
      evaluateQuarantine({
        filename: 'payload.exe',
        collectionValid: true,
        byteSize: 1,
        sha256: 'aa',
        objectAvailable: true,
        sizeMatchesStored: true,
        unityPreservationOnly: false,
      }).state,
    ).toBe('quarantined');
    expect(assertSingleTextureTierMaterialized(['2048'])).toBe('2048');
    expect(() => assertSingleTextureTierMaterialized(['1024', '4096'])).toThrow(/one texture tier/);
  });
});

describe('workspace readiness and git safety', () => {
  it('keeps software foundation separate from real asset readiness', () => {
    const snapshot = publicIntakeSnapshot([]);
    expect(snapshot.softwareFoundation.available).toBe(true);
    expect(snapshot.softwareFoundation.previewPlanningEnabled).toBe(true);
    expect(snapshot.realAssetReadiness.expectedFiles).toBe(27);
    expect(snapshot.realAssetReadiness.uploadedFiles).toBe(0);
    expect(snapshot.realAssetReadiness.verifiedFiles).toBe(0);
    expect(snapshot.realAssetReadiness.inspectedFiles).toBe(0);
    expect(snapshot.realAssetReadiness.realSceneryProductionReady).toBe(false);
    expect(snapshot.warning).toContain('Upload does not mean asset approval');
    expect(buildPublicScenerySnapshot().intake.realAssetReadiness.purchasedBytesInspected).toBe(
      false,
    );
    expect(describeBlenderAvailability().available).toBe(false);
    expect(BLENDER_INSPECTION_CONTRACT.paidGpu).toBe(false);
    expect(BLENDER_INSPECTION_CONTRACT.normalizationBoundary.allowed).toBe(false);
    expect(SCENERY_INTAKE_SCHEMA_VERSION).toBe('TIVVLEJOY_SCENERY_ASSET_INTAKE_V1');
    expect(SCENERY_COPY.intakeTitle).toContain('Preview Only Scenery Asset Intake');
    expect(snapshot.authorization.mutationsRequireStudioSession).toBe(true);
    expect(snapshot.bytesPath).toBe('client-to-signed-r2');
  });

  it('keeps TivvleJoy intake copy in the scenery workspace and omits licensed binaries from Git', () => {
    const studio = readRepo('apps/web/src/components/preview/SceneryStudio.tsx');
    const intake = readRepo('apps/web/src/components/preview/SceneryAssetIntake.tsx');
    expect(studio).toContain('SceneryAssetIntake');
    expect(studio).toContain('softwareFoundation');
    expect(intake).toContain('SCENERY_COPY.uploadNotApproval');
    expect(intake).toContain('Select one or multiple files');
    expect(intake).toContain('SCENERY_COPY.oneTapSelectUpload');
    expect(intake).toContain('SCENERY_COPY.oneTapReviewTitle');
    expect(intake).toContain('SCENERY_COPY.oneTapUploadEligible');
    expect(intake).toContain('reviewOneTapPurchasedSelection');
    expect(intake).toContain('Multipart progress');
    expect(intake).toContain('SCENERY_COPY.studioSession');
    expect(intake).toContain('x-tivvlejoy-scenery-intake-token');
    expect(intake).toContain('Expected 27-file source checklist');
    expect(readRepo('apps/web/src/lib/scenery/copy.ts')).toContain(
      'Upload does not mean asset approval',
    );
    expect(intake).not.toMatch(/DoodleDash|Doodle Dash|\bDDP\b/);
    expect(scanTrackedAndStagedFiles(repoRoot).ok).toBe(true);
  });
});
