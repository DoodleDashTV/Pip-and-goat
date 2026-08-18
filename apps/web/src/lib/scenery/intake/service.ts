import { SceneryError } from '../types';
import {
  assertIntakeRateLimit,
  assertNoClientStorageCredentials,
  assertNoTokenReflection,
  assertStudioIntakeAccess,
  assertTokenOnlyFromApprovedHeader,
  publicIntakeAuthorizationSnapshot,
} from './access';
import { describeSceneryStorageConfiguration, resolveSceneryAssetPrefix } from './config';
import {
  countPurchasedSourceObjects,
  deletePersistedManifest,
  deletePersistedSession,
  hydrateIntakeStore,
  persistManifest,
  persistUploadSession,
  signedUrlTargetsVercel,
} from './durable-state';
import { PREVIEW_SYNTHETIC_SOURCE_ID } from './fixtures';
import {
  assertCompleteParts,
  ConnectionReadyMultipartStorage,
  createUploadSession,
  MemoryMultipartStorage,
  markPartFailed,
  markPartSigned,
  recordPartEtag,
  resumeSession,
  type IntakePurpose,
  type MultipartStoragePort,
  type UploadSession,
} from './multipart';
import { applyQuarantineToManifest, evaluateQuarantine } from './quarantine';
import { createConfiguredMultipartStorage } from './r2-multipart';
import { getSceneryIntakeStore } from './store';
import { assertObjectKeyWithinPrefix } from './keys';
import { getExpectedSourceFile } from './inventory';
import { resolveIntakeLimits } from './limits';
import type { SourceObjectManifest } from './manifest';
import { evaluateInspectionEligibility } from './inspection-queue';
import { assertWriteStaysInApprovedNamespace } from './namespace';
import { buildIntakeLifecycleEvent, emitIntakeLifecycleEvent } from './observability';
import {
  classifyRecoveredState,
  isSessionExpired,
  recoveryGuidance,
  sessionExpiresAt,
} from './recovery';
import { evaluateStoredVerification } from './verification';

export type IntakeAction =
  | 'status'
  | 'create-session'
  | 'sign-part'
  | 'complete'
  | 'abort'
  | 'query'
  | 'resume'
  | 'verify'
  | 'retry-part'
  | 'cleanup-preview-synthetic'
  | 'pause';

async function storageFor(
  env: Record<string, string | undefined>,
  override?: MultipartStoragePort,
) {
  if (override) return override;
  return createConfiguredMultipartStorage(env);
}

export async function handleSceneryIntakeAction(input: {
  action: IntakeAction;
  body: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  publicPreview: boolean;
  clientKey?: string;
  storage?: MultipartStoragePort;
  studioToken?: string;
}): Promise<Record<string, unknown>> {
  const result = await handleSceneryIntakeActionInner(input);
  assertNoTokenReflection(result, input.studioToken ?? '');
  return result;
}

async function handleSceneryIntakeActionInner(input: {
  action: IntakeAction;
  body: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  publicPreview: boolean;
  clientKey?: string;
  storage?: MultipartStoragePort;
  studioToken?: string;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  const store = getSceneryIntakeStore();
  const config = describeSceneryStorageConfiguration(env);
  assertNoClientStorageCredentials(input.body);
  assertTokenOnlyFromApprovedHeader(input.body);
  if (input.action !== 'status') {
    assertStudioIntakeAccess(env, input.studioToken);
    assertIntakeRateLimit(input.clientKey ?? 'studio', env);
  }

  const storage = await storageFor(env, input.storage);
  if (shouldHydrateDurableState(storage)) {
    await hydrateIntakeStore(storage, env);
  }

  if (input.action === 'status') {
    const sourceCount = config.configured
      ? await countPurchasedSourceObjects(storage, env)
      : { count: 0, unavailable: true };
    return {
      storage: config,
      authorization: publicIntakeAuthorizationSnapshot(env),
      bytesPath: 'client-to-signed-r2',
      purchasedSourceObjectCount: sourceCount.unavailable ? null : sourceCount.count,
      sessions: [...store.sessions.values()].map(publicSession),
      manifests: store
        .listManifests()
        .filter((item) => item.sourceId !== PREVIEW_SYNTHETIC_SOURCE_ID),
    };
  }

  if (input.action === 'create-session') {
    const purpose: IntakePurpose =
      input.body.purpose === 'preview-synthetic' ? 'preview-synthetic' : 'purchased';
    const created = createUploadSession({
      collectionId: String(input.body.collectionId ?? ''),
      originalFilename: String(input.body.filename ?? ''),
      byteSize: Number(input.body.byteSize ?? 0),
      mimeType: input.body.mimeType ? String(input.body.mimeType) : undefined,
      lastModified: input.body.lastModified ? String(input.body.lastModified) : null,
      sha256: input.body.sha256 ? String(input.body.sha256) : null,
      expectedSourceId: input.body.expectedSourceId
        ? String(input.body.expectedSourceId)
        : undefined,
      existingIndex: store.index(),
      env,
      purpose,
    });
    created.manifest.uploaderSession.sessionId = created.session.sessionId;
    created.manifest.uploaderSession.publicPreview = input.publicPreview;
    assertWriteStaysInApprovedNamespace(
      created.session.objectKey,
      prefixForSession(env),
      created.session.purpose === 'preview-synthetic' ? 'quarantine' : 'source',
    );
    const retainedManifest = store.putManifest(created.manifest);
    await persistManifest(retainedManifest, storage, env);
    if (created.session.state === 'already_present') {
      store.putSession(created.session);
      await persistUploadSession(created.session, storage, env);
      return {
        session: publicSession(created.session),
        manifest: retainedManifest,
        alreadyPresent: true,
      };
    }
    if (created.session.connectionReadyOnly || storage instanceof ConnectionReadyMultipartStorage) {
      created.session.notes.push(
        'R2 multipart create was not attempted because storage is not configured.',
      );
      store.putSession(created.session);
      await persistUploadSession(created.session, storage, env);
      return {
        session: publicSession(created.session),
        manifest: retainedManifest,
        connectionReadyOnly: true,
      };
    }
    const createdUpload = await storage.createMultipartUpload({
      key: created.session.objectKey,
      contentType: created.session.mimeType,
    });
    created.session.uploadId = createdUpload.uploadId;
    store.putSession(created.session);
    await persistUploadSession(created.session, storage, env);
    emitIntakeLifecycleEvent(
      buildIntakeLifecycleEvent('scenery.intake.session.created', {
        sessionId: created.session.sessionId,
        sourceId: created.session.expectedSourceId,
        collectionId: created.session.collectionId,
        state: created.session.state,
      }),
    );
    return { session: publicSession(created.session), manifest: retainedManifest };
  }

  const session = requireSession(String(input.body.sessionId ?? ''));
  const prefix = resolveSceneryAssetPrefix(env);
  assertSessionObjectKey(session, prefix);

  if (input.action === 'query') {
    return {
      session: publicSession(session),
      manifest: store.manifests.get(session.expectedSourceId) ?? null,
    };
  }

  if (input.action === 'resume') {
    if (isSessionExpired(session)) {
      throw new SceneryError(recoveryGuidance('expired'), 'SESSION_EXPIRED');
    }
    const resumed = resumeSession(session);
    store.putSession(resumed.session);
    await persistUploadSession(resumed.session, storage, env);
    emitIntakeLifecycleEvent(
      buildIntakeLifecycleEvent('scenery.intake.session.resumed', {
        sessionId: session.sessionId,
        sourceId: session.expectedSourceId,
        collectionId: session.collectionId,
        state: resumed.session.state,
        counts: { resumed: 1 },
      }),
    );
    return { session: publicSession(resumed.session), nextPart: resumed.nextPart };
  }

  if (input.action === 'pause') {
    if (session.state === 'completed' || session.state === 'already_present') {
      return { session: publicSession(session), paused: false };
    }
    session.state = 'paused';
    session.updatedAt = new Date().toISOString();
    store.putSession(session);
    await persistUploadSession(session, storage, env);
    return { session: publicSession(session), paused: true };
  }

  if (input.action === 'abort') {
    if (session.state === 'aborted') {
      return { session: publicSession(session), aborted: true, alreadyAborted: true };
    }
    if (session.state === 'completed' || session.state === 'already_present') {
      return {
        session: publicSession(session),
        aborted: false,
        alreadyCompleted: true,
        message: 'Completed uploads are not aborted. The stored source remains.',
      };
    }
    if (session.uploadId && !(storage instanceof ConnectionReadyMultipartStorage)) {
      await storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
    }
    session.state = 'aborted';
    session.updatedAt = new Date().toISOString();
    store.putSession(session);
    await persistUploadSession(session, storage, env);
    emitIntakeLifecycleEvent(
      buildIntakeLifecycleEvent('scenery.intake.session.cancelled', {
        sessionId: session.sessionId,
        sourceId: session.expectedSourceId,
        collectionId: session.collectionId,
        state: 'aborted',
        counts: { cancelled: 1 },
      }),
    );
    return { session: publicSession(session), aborted: true };
  }

  if (input.action === 'cleanup-preview-synthetic') {
    if (
      session.purpose !== 'preview-synthetic' ||
      !session.objectKey.includes('/quarantine/preview-tests/')
    ) {
      throw new SceneryError(
        'Only preview-synthetic objects under quarantine/preview-tests/ can be deleted by this action.',
        'CLEANUP_REFUSED',
      );
    }
    if (session.objectKey.includes('/source/')) {
      throw new SceneryError(
        'Purchased source objects cannot be deleted by preview cleanup.',
        'CLEANUP_REFUSED',
      );
    }
    if (storage.deleteObject) {
      await storage.deleteObject(session.objectKey);
    }
    store.sessions.delete(session.sessionId);
    store.manifests.delete(session.expectedSourceId);
    await deletePersistedSession(session.sessionId, storage, env);
    await deletePersistedManifest(session.expectedSourceId, storage, env);
    return { cleaned: true, sessionId: session.sessionId, objectKey: session.objectKey };
  }

  if (input.action === 'sign-part' || input.action === 'retry-part') {
    if (isSessionExpired(session)) {
      throw new SceneryError(recoveryGuidance('expired'), 'SESSION_EXPIRED');
    }
    if (!session.uploadId) {
      throw new SceneryError(
        'Upload session has no multipart id. Storage is connection-ready only.',
        'STORAGE_UNAVAILABLE',
      );
    }
    const partNumber = Number(input.body.partNumber);
    const limits = resolveIntakeLimits(env);
    if (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > session.parts.length ||
      session.parts.length > limits.maxParts
    ) {
      throw new SceneryError(
        'Part number or part count is outside the Preview intake limits.',
        'PART_COUNT_LIMIT',
      );
    }
    const signed = await storage.signPart({
      key: session.objectKey,
      uploadId: session.uploadId,
      partNumber,
      ttlSeconds: limits.signedOperationTtlSeconds,
    });
    if (signedUrlTargetsVercel(signed.url)) {
      throw new SceneryError(
        'Signed part URLs must target private storage, not Vercel.',
        'BYTES_PATH_REFUSED',
      );
    }
    const next = input.action === 'retry-part' ? markPartFailed(session, partNumber) : session;
    store.putSession(markPartSigned(next, partNumber));
    await persistUploadSession(store.getSession(session.sessionId)!, storage, env);
    return {
      session: publicSession(store.getSession(session.sessionId)!),
      partNumber,
      signedUrl: signed.url,
      expiresAt: signed.expiresAt,
      bytesPath: 'client-to-signed-r2',
    };
  }

  if (input.action === 'complete') {
    if (session.state === 'completed' || session.state === 'already_present') {
      const existingManifest = store.manifests.get(session.expectedSourceId);
      const head = await storage.headObject(session.objectKey);
      return {
        session: publicSession(session),
        manifest: existingManifest ?? null,
        storedSize: head.size,
        alreadyCompleted: true,
        inspectionReadiness: existingManifest
          ? evaluateInspectionEligibility(existingManifest)
          : { ready: false, reasons: ['manifest missing'] },
      };
    }
    if (isSessionExpired(session)) {
      throw new SceneryError(recoveryGuidance('expired'), 'SESSION_EXPIRED');
    }
    const etags =
      (input.body.parts as Array<{ partNumber: number; etag: string }> | undefined) ?? [];
    const limits = resolveIntakeLimits(env);
    if (etags.length !== session.parts.length || etags.length > limits.maxParts) {
      throw new SceneryError(
        'Completed part count does not match the planned multipart map.',
        'INCONSISTENT_PART_COUNT',
      );
    }
    let current = session;
    for (const part of etags) {
      current = recordPartEtag(current, part.partNumber, part.etag);
    }
    const parts = assertCompleteParts(current);
    if (!current.uploadId) {
      throw new SceneryError(
        'Cannot complete a connection-ready session that never reached R2.',
        'STORAGE_UNAVAILABLE',
      );
    }
    let completed: { size: number };
    let ambiguousCompletion = false;
    try {
      completed = await storage.completeMultipartUpload({
        key: current.objectKey,
        uploadId: current.uploadId,
        parts,
      });
    } catch (error) {
      const head = await storage.headObject(current.objectKey);
      if (head.exists && head.size === current.byteSize) {
        completed = { size: head.size };
        ambiguousCompletion = true;
      } else {
        const message = error instanceof Error ? error.message : 'Multipart completion failed.';
        throw new SceneryError(
          `${message} Retry completion or resume remaining parts. Storage credentials are not shown.`,
          'AMBIGUOUS_COMPLETION',
        );
      }
    }
    if (completed.size !== current.byteSize) {
      throw new SceneryError(
        'Stored object size does not match the intake record.',
        'SIZE_MISMATCH',
      );
    }
    current.state = 'completed';
    store.putSession(current);
    await persistUploadSession(current, storage, env);
    const unityPreservationOnly =
      current.purpose === 'preview-synthetic'
        ? false
        : getExpectedSourceFile(current.expectedSourceId).unityPreservationOnly;
    const manifest = applyCompletedVerification(
      store.manifests.get(current.expectedSourceId),
      current,
      completed.size,
      unityPreservationOnly,
    );
    store.putManifest(manifest);
    await persistManifest(manifest, storage, env);
    emitIntakeLifecycleEvent(
      buildIntakeLifecycleEvent('scenery.intake.session.completed', {
        sessionId: current.sessionId,
        sourceId: current.expectedSourceId,
        collectionId: current.collectionId,
        state: manifest.inspectionState,
        counts: {
          successful: 1,
          quarantined: manifest.quarantineState === 'quarantined' ? 1 : 0,
          inspectionReady: manifest.inspectionState === 'inspection_ready' ? 1 : 0,
        },
      }),
    );
    return {
      session: publicSession(current),
      manifest,
      storedSize: completed.size,
      ambiguousCompletion,
      inspectionReadiness: evaluateInspectionEligibility(manifest),
    };
  }

  if (input.action === 'verify') {
    const head = await storage.headObject(session.objectKey);
    const unityPreservationOnly =
      session.purpose === 'preview-synthetic'
        ? false
        : getExpectedSourceFile(session.expectedSourceId).unityPreservationOnly;
    const manifest = applyCompletedVerification(
      store.manifests.get(session.expectedSourceId),
      session,
      head.size ?? 0,
      unityPreservationOnly,
      head.exists,
    );
    store.putManifest(manifest);
    await persistManifest(manifest, storage, env);
    return {
      session: publicSession(session),
      manifest,
      objectExists: head.exists,
      storedSize: head.size,
      inspectionReadiness: evaluateInspectionEligibility(manifest),
    };
  }

  throw new SceneryError('Unknown scenery intake action.', 'UNKNOWN_ACTION');
}

function requireSession(sessionId: string): UploadSession {
  const session = getSceneryIntakeStore().getSession(sessionId);
  if (!session) throw new SceneryError('Unknown scenery upload session.', 'UNKNOWN_SESSION');
  if (!session.purpose) session.purpose = 'purchased';
  return session;
}

function publicSession(session: UploadSession) {
  const recoveredState = classifyRecoveredState({ session });
  return {
    ...session,
    uploadId: session.uploadId ? '[present]' : null,
    expiresAt: sessionExpiresAt(session),
    recoveredState,
    recoveryGuidance: recoveryGuidance(recoveredState),
  };
}

function prefixForSession(env: Record<string, string | undefined>): string {
  return resolveSceneryAssetPrefix(env);
}

function applyCompletedVerification(
  existing: SourceObjectManifest | undefined,
  session: UploadSession,
  storedSize: number,
  unityPreservationOnly: boolean,
  objectAvailable = true,
): SourceObjectManifest {
  if (!existing) {
    throw new SceneryError('Intake manifest is missing for verification.', 'INVALID_MANIFEST');
  }
  const verification = evaluateStoredVerification({
    declaredBytes: session.byteSize,
    storedBytes: storedSize,
    objectAvailable,
    sha256: session.sha256 ?? existing.sha256 ?? null,
    filename: session.normalizedFilename,
    partCount: session.parts.length || undefined,
    completedPartCount: session.parts.length || undefined,
    uploadCompleted: session.state === 'completed' || session.state === 'already_present',
  });
  const sizeMatches = storedSize === session.byteSize && verification.ok;
  const next: SourceObjectManifest = {
    ...existing,
    uploadState: session.state === 'already_present' ? 'already_present' : 'completed',
    sha256: session.sha256 ?? existing.sha256,
    verificationState: !verification.ok
      ? 'failed'
      : sizeMatches && session.sha256
        ? 'size_verified'
        : session.sha256
          ? 'checksum_recorded'
          : 'awaiting_verification',
    verifiedAt: sizeMatches ? new Date().toISOString() : null,
    independentServerSha256: 'unavailable_in_this_environment',
  };
  const quarantine = evaluateQuarantine({
    filename: session.normalizedFilename,
    collectionValid: true,
    byteSize: session.byteSize,
    sha256: next.sha256 || null,
    objectAvailable,
    sizeMatchesStored: sizeMatches,
    unityPreservationOnly,
  });
  const applied = applyQuarantineToManifest(next, quarantine);
  if (session.purpose === 'preview-synthetic') {
    return {
      ...applied,
      inspectionState: 'not_eligible',
      notes: [
        ...applied.notes,
        'Synthetic preview fixture is not a purchased scenery source and is not inspection-ready.',
      ],
    };
  }
  return applied;
}

function assertSessionObjectKey(session: UploadSession, prefix: string): void {
  if (session.purpose === 'preview-synthetic') {
    assertWriteStaysInApprovedNamespace(session.objectKey, prefix, 'quarantine');
    assertObjectKeyWithinPrefix(session.objectKey, prefix, 'quarantine');
    if (!session.objectKey.includes('/quarantine/preview-tests/')) {
      throw new SceneryError(
        'Preview synthetic objects must stay under quarantine/preview-tests/.',
        'UNSAFE_OBJECT_KEY',
      );
    }
    return;
  }
  assertWriteStaysInApprovedNamespace(session.objectKey, prefix, 'source');
  assertObjectKeyWithinPrefix(session.objectKey, prefix, 'source');
}

function shouldHydrateDurableState(storage: MultipartStoragePort): boolean {
  if (storage instanceof ConnectionReadyMultipartStorage) return false;
  if (storage instanceof MemoryMultipartStorage) return false;
  return Boolean(storage.listPrefix && storage.getObject);
}
