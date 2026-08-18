import { SceneryError } from '../types';
import { assertIntakeRateLimit, assertNoClientStorageCredentials, assertStudioIntakeAccess } from './access';
import { describeSceneryStorageConfiguration, resolveSceneryAssetPrefix } from './config';
import {
  assertCompleteParts,
  ConnectionReadyMultipartStorage,
  createUploadSession,
  markPartFailed,
  markPartSigned,
  recordPartEtag,
  resumeSession,
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

export type IntakeAction =
  | 'status'
  | 'create-session'
  | 'sign-part'
  | 'complete'
  | 'abort'
  | 'query'
  | 'resume'
  | 'verify'
  | 'retry-part';

async function storageFor(env: Record<string, string | undefined>, override?: MultipartStoragePort) {
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
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  const store = getSceneryIntakeStore();
  const config = describeSceneryStorageConfiguration(env);
  assertNoClientStorageCredentials(input.body);
  if (input.action !== 'status') {
    if (input.publicPreview) {
      throw new SceneryError(
        'Scenery asset intake mutations require the authorized TivvleJoy studio.',
        'INTAKE_UNAUTHORIZED',
      );
    }
    assertStudioIntakeAccess(env);
    assertIntakeRateLimit(input.clientKey ?? 'studio', env);
  }

  if (input.action === 'status') {
    return {
      storage: config,
      sessions: [...store.sessions.values()].map(publicSession),
      manifests: store.listManifests(),
    };
  }

  if (input.action === 'create-session') {
    const created = createUploadSession({
      collectionId: String(input.body.collectionId ?? ''),
      originalFilename: String(input.body.filename ?? ''),
      byteSize: Number(input.body.byteSize ?? 0),
      mimeType: input.body.mimeType ? String(input.body.mimeType) : undefined,
      lastModified: input.body.lastModified ? String(input.body.lastModified) : null,
      sha256: input.body.sha256 ? String(input.body.sha256) : null,
      expectedSourceId: input.body.expectedSourceId ? String(input.body.expectedSourceId) : undefined,
      existingIndex: store.index(),
      env,
    });
    created.manifest.uploaderSession.sessionId = created.session.sessionId;
    store.putManifest(created.manifest);
    if (created.session.state === 'already_present') {
      store.putSession(created.session);
      return { session: publicSession(created.session), manifest: created.manifest, alreadyPresent: true };
    }
    const storage = await storageFor(env, input.storage);
    if (created.session.connectionReadyOnly || storage instanceof ConnectionReadyMultipartStorage) {
      created.session.notes.push('R2 multipart create was not attempted because storage is not configured.');
      store.putSession(created.session);
      return {
        session: publicSession(created.session),
        manifest: created.manifest,
        connectionReadyOnly: true,
      };
    }
    const createdUpload = await storage.createMultipartUpload({
      key: created.session.objectKey,
      contentType: created.session.mimeType,
    });
    created.session.uploadId = createdUpload.uploadId;
    store.putSession(created.session);
    return { session: publicSession(created.session), manifest: created.manifest };
  }

  const session = requireSession(String(input.body.sessionId ?? ''));
  const prefix = resolveSceneryAssetPrefix(env);
  assertObjectKeyWithinPrefix(session.objectKey, prefix, 'source');
  const storage = await storageFor(env, input.storage);

  if (input.action === 'query') {
    return { session: publicSession(session), manifest: store.manifests.get(session.expectedSourceId) ?? null };
  }

  if (input.action === 'resume') {
    const resumed = resumeSession(session);
    store.putSession(resumed.session);
    return { session: publicSession(resumed.session), nextPart: resumed.nextPart };
  }

  if (input.action === 'abort') {
    if (session.uploadId && !(storage instanceof ConnectionReadyMultipartStorage)) {
      await storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
    }
    session.state = 'aborted';
    store.putSession(session);
    return { session: publicSession(session), aborted: true };
  }

  if (input.action === 'sign-part' || input.action === 'retry-part') {
    if (!session.uploadId) {
      throw new SceneryError('Upload session has no multipart id. Storage is connection-ready only.', 'STORAGE_UNAVAILABLE');
    }
    const partNumber = Number(input.body.partNumber);
    const limits = resolveIntakeLimits(env);
    const signed = await storage.signPart({
      key: session.objectKey,
      uploadId: session.uploadId,
      partNumber,
      ttlSeconds: limits.signedOperationTtlSeconds,
    });
    const next = input.action === 'retry-part' ? markPartFailed(session, partNumber) : session;
    store.putSession(markPartSigned(next, partNumber));
    return {
      session: publicSession(store.getSession(session.sessionId)!),
      partNumber,
      signedUrl: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  if (input.action === 'complete') {
    const etags = (input.body.parts as Array<{ partNumber: number; etag: string }> | undefined) ?? [];
    let current = session;
    for (const part of etags) {
      current = recordPartEtag(current, part.partNumber, part.etag);
    }
    const parts = assertCompleteParts(current);
    if (!current.uploadId) {
      throw new SceneryError('Cannot complete a connection-ready session that never reached R2.', 'STORAGE_UNAVAILABLE');
    }
    const completed = await storage.completeMultipartUpload({
      key: current.objectKey,
      uploadId: current.uploadId,
      parts,
    });
    if (completed.size !== current.byteSize) {
      throw new SceneryError('Stored object size does not match the intake record.', 'SIZE_MISMATCH');
    }
    current.state = 'completed';
    store.putSession(current);
    const expected = getExpectedSourceFile(current.expectedSourceId);
    const manifest = applyCompletedVerification(store.manifests.get(current.expectedSourceId), current, completed.size, expected.unityPreservationOnly);
    store.putManifest(manifest);
    return { session: publicSession(current), manifest, storedSize: completed.size };
  }

  if (input.action === 'verify') {
    const head = await storage.headObject(session.objectKey);
    const expected = getExpectedSourceFile(session.expectedSourceId);
    const manifest = applyCompletedVerification(
      store.manifests.get(session.expectedSourceId),
      session,
      head.size ?? 0,
      expected.unityPreservationOnly,
      head.exists,
    );
    store.putManifest(manifest);
    return { session: publicSession(session), manifest, objectExists: head.exists, storedSize: head.size };
  }

  throw new SceneryError('Unknown scenery intake action.', 'UNKNOWN_ACTION');
}

function requireSession(sessionId: string): UploadSession {
  const session = getSceneryIntakeStore().getSession(sessionId);
  if (!session) throw new SceneryError('Unknown scenery upload session.', 'UNKNOWN_SESSION');
  return session;
}

function publicSession(session: UploadSession) {
  return {
    ...session,
    uploadId: session.uploadId ? '[present]' : null,
  };
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
  const sizeMatches = storedSize === session.byteSize;
  const next: SourceObjectManifest = {
    ...existing,
    uploadState: session.state === 'already_present' ? 'already_present' : 'completed',
    sha256: session.sha256 ?? existing.sha256,
    verificationState: sizeMatches && session.sha256 ? 'size_verified' : session.sha256 ? 'checksum_recorded' : 'awaiting_verification',
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
  return applyQuarantineToManifest(next, quarantine);
}
