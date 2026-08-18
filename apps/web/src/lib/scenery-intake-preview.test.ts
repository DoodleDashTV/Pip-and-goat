import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateInspectionEligibility,
  handleSceneryIntakeAction,
  MemoryMultipartStorage,
  previewSyntheticBytes,
  previewSyntheticFilename,
  resetSceneryIntakeStore,
  sceneryInternalObjectKey,
  sha256HexChunked,
  signedUrlTargetsVercel,
  validateSourceObjectManifest,
} from './scenery/intake';
import { resetIntakeRateLimit } from './scenery/intake/access';
import { SCENERY_COPY } from './scenery/copy';

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

describe('scenery intake preview synthetic workflow', () => {
  it('builds internal keys under quarantine and catalogs, never source/', () => {
    expect(
      sceneryInternalObjectKey({
        prefix: 'tivvlejoy-assets',
        folder: 'preview-tests',
        filename: previewSyntheticFilename('unit'),
      }),
    ).toBe('tivvlejoy-assets/quarantine/preview-tests/tivvlejoy-preview-synthetic-unit.txt');
    expect(
      sceneryInternalObjectKey({
        prefix: 'tivvlejoy-assets',
        folder: 'upload-sessions',
        filename: 'session-id.json',
      }),
    ).toBe('tivvlejoy-assets/quarantine/upload-sessions/session-id.json');
    expect(signedUrlTargetsVercel('https://example.r2.cloudflarestorage.com/part')).toBe(false);
    expect(signedUrlTargetsVercel('https://pip-and-goat.vercel.app/api/scenery/intake')).toBe(true);
  });

  it('creates, signs, uploads, completes, and cleans a synthetic fixture without touching source/', async () => {
    const storage = new MemoryMultipartStorage();
    const bytes = previewSyntheticBytes('complete');
    const filename = previewSyntheticFilename('complete');
    const created = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        purpose: 'preview-synthetic',
        collectionId: 'village',
        filename,
        byteSize: bytes.byteLength,
        sha256: sha256HexChunked(bytes),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string; objectKey: string; parts: Array<{ partNumber: number }> } };
    expect(created.session.objectKey).toContain('/quarantine/preview-tests/');
    expect(created.session.objectKey).not.toContain('/source/');

    const signed = (await handleSceneryIntakeAction({
      action: 'sign-part',
      body: { sessionId: created.session.sessionId, partNumber: 1 },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { signedUrl: string; bytesPath: string };
    expect(signed.bytesPath).toBe('client-to-signed-r2');
    expect(signedUrlTargetsVercel(signed.signedUrl)).toBe(false);

    const etag = await storage.putPart([...storage.uploads.keys()][0]!, 1, bytes);
    const completed = (await handleSceneryIntakeAction({
      action: 'complete',
      body: { sessionId: created.session.sessionId, parts: [{ partNumber: 1, etag }] },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as {
      storedSize: number;
      manifest: { verificationState: string; inspectionState: string; sourceId: string };
      inspectionReadiness: { ready: boolean };
    };
    expect(completed.storedSize).toBe(bytes.byteLength);
    expect(completed.manifest.verificationState).toBe('size_verified');
    expect(completed.manifest.inspectionState).toBe('not_eligible');
    expect(completed.inspectionReadiness.ready).toBe(false);
    expect(evaluateInspectionEligibility(completed.manifest).ready).toBe(false);

    const sourceCount = await storage.listPrefix('tivvlejoy-assets/source/');
    expect(sourceCount).toEqual([]);

    const cleaned = await handleSceneryIntakeAction({
      action: 'cleanup-preview-synthetic',
      body: { sessionId: created.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(cleaned.cleaned).toBe(true);
    expect((await storage.headObject(created.session.objectKey)).exists).toBe(false);
  });

  it('supports pause, resume, cancel, duplicate detection, invalid manifests, and quarantine', async () => {
    const storage = new MemoryMultipartStorage();
    const bytes = previewSyntheticBytes('resume');
    const filename = previewSyntheticFilename('resume');
    const created = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        purpose: 'preview-synthetic',
        collectionId: 'village',
        filename,
        byteSize: bytes.byteLength,
        sha256: sha256HexChunked(bytes),
      },
      env: configuredEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string } };
    const resumed = await handleSceneryIntakeAction({
      action: 'resume',
      body: { sessionId: created.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect((resumed.session as { state: string }).state).toBe('paused');
    const aborted = await handleSceneryIntakeAction({
      action: 'abort',
      body: { sessionId: created.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });
    expect(aborted.aborted).toBe(true);
    await handleSceneryIntakeAction({
      action: 'cleanup-preview-synthetic',
      body: { sessionId: created.session.sessionId },
      env: configuredEnv,
      publicPreview: false,
      storage,
    });

    resetSceneryIntakeStore();
    await expect(
      handleSceneryIntakeAction({
        action: 'query',
        body: { sessionId: 'missing-session' },
        env: configuredEnv,
        publicPreview: false,
        storage,
      }),
    ).rejects.toThrow(/Unknown scenery upload session/);

    expect(() =>
      validateSourceObjectManifest({
        schemaVersion: 'wrong',
        sourceId: 'not-a-source',
      }),
    ).toThrow(/Invalid scenery intake manifest/);

    const duplicateEnv = configuredEnv;
    const first = previewSyntheticBytes('dup');
    const firstName = previewSyntheticFilename('dup');
    const firstCreated = (await handleSceneryIntakeAction({
      action: 'create-session',
      body: {
        purpose: 'preview-synthetic',
        collectionId: 'village',
        filename: firstName,
        byteSize: first.byteLength,
        sha256: sha256HexChunked(first),
      },
      env: duplicateEnv,
      publicPreview: false,
      storage,
    })) as { session: { sessionId: string; parts: Array<{ partNumber: number }> } };
    const firstEtag = await storage.putPart([...storage.uploads.keys()].at(-1)!, 1, first);
    await handleSceneryIntakeAction({
      action: 'complete',
      body: { sessionId: firstCreated.session.sessionId, parts: [{ partNumber: 1, etag: firstEtag }] },
      env: duplicateEnv,
      publicPreview: false,
      storage,
    });
    await handleSceneryIntakeAction({
      action: 'cleanup-preview-synthetic',
      body: { sessionId: firstCreated.session.sessionId },
      env: duplicateEnv,
      publicPreview: false,
      storage,
    });

    expect(
      evaluateInspectionEligibility({
        sourceId: 'SRC_PREVIEW_SYNTHETIC',
        storageObjectKey: 'tivvlejoy-assets/quarantine/preview-tests/tivvlejoy-preview-synthetic-dup.txt',
        uploadState: 'completed',
        verificationState: 'size_verified',
        sha256: 'aa',
        quarantineState: 'not_quarantined',
        provenanceLicenseRef: 'LICENSE_PENDING',
        collectionId: 'village',
        independentServerSha256: 'unavailable_in_this_environment',
      } as never).ready,
    ).toBe(false);
  });

  it('keeps TivvleJoy preview copy and omits bucket or prefix controls', () => {
    expect(SCENERY_COPY.studioSession).toContain('TivvleJoy');
    expect(SCENERY_COPY.uploadNotApproval).toContain('Upload does not mean asset approval');
    expect(JSON.stringify(SCENERY_COPY)).not.toMatch(/DoodleDash|Doodle Dash|\bDDP\b/);
    expect(SCENERY_COPY.studioTokenHelp).not.toMatch(/prefixOverride|secretAccessKey|R2_SECRET_ACCESS_KEY/i);
  });
});
