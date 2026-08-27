import {
  assertIntakeRateLimit,
  assertNoClientStorageCredentials,
  assertNoTokenReflection,
  assertTokenOnlyFromApprovedHeader,
  publicIntakeAuthorizationSnapshot,
} from '@/lib/scenery/intake/access';
import { assertAssetIntakeAccess } from '@/lib/asset-intake/access';
import { describeSceneryStorageConfiguration } from '@/lib/scenery/intake/config';
import {
  ConnectionReadyMultipartStorage,
  type MultipartStoragePort,
} from '@/lib/scenery/intake/multipart';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import { GOAT_SOURCE_SHA256, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import {
  loadPersistedGoatSession,
  nextGoatSourceAction,
  persistGoatSourceReceipt,
  persistGoatUploadSession,
  rediscoverGoatSource,
} from './durable';
import { CharacterSourceError, assertCharacterSourceKey, goatSourceObjectKey } from './keys';
import { dryRunGoatSourceMaterialization } from './materialization';
import { connectReceiptToCharacterPipeline } from './pipeline-bridge';
import { compileGoatPostUploadPreflight } from './post-upload-preflight';
import { buildGoatSourceReceipt, emptyGoatSourceReceipt } from './receipt';
import {
  assertCompleteParts,
  createGoatUploadSession,
  markPartFailed,
  recordPartEtag,
  remainingParts,
  resumeGuidance,
  type CharacterUploadSession,
} from './session';
import { deriveGoatSourceState, operatorChecklist } from './states';
import { getCharacterSourceStore } from './store';
import { CHARACTER_SOURCE_INTAKE_SCHEMA, ZERO_INTAKE_SIDE_EFFECTS } from './types';
import { inspectGoatZipOrFail, verifyGoatSourceHash } from './validation';

export type CharacterSourceAction =
  | 'status'
  | 'create-session'
  | 'sign-part'
  | 'complete'
  | 'abort'
  | 'resume'
  | 'retry-part'
  | 'verify'
  | 'authorize';

async function storageFor(env: Record<string, string | undefined>, override?: MultipartStoragePort) {
  if (override) return override;
  return createConfiguredMultipartStorage(env);
}

function publicSession(session: CharacterUploadSession) {
  return {
    sessionId: session.sessionId,
    filename: session.filename,
    objectKey: session.objectKey,
    byteSize: session.byteSize,
    state: session.state,
    parts: session.parts.map((part) => ({
      partNumber: part.partNumber,
      start: part.start,
      end: part.end,
      hasEtag: Boolean(part.etag),
      failed: part.failed,
    })),
    connectionReadyOnly: session.connectionReadyOnly,
    alreadyVerified: session.alreadyVerified,
    notes: session.notes,
    resume: resumeGuidance(session),
  };
}

export async function handleCharacterSourceAction(input: {
  action: CharacterSourceAction;
  body: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  publicPreview: boolean;
  clientKey?: string;
  storage?: MultipartStoragePort;
  studioToken?: string;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  assertNoClientStorageCredentials(input.body);
  assertTokenOnlyFromApprovedHeader(input.body);
  if (input.action !== 'status') {
    assertAssetIntakeAccess({
      env,
      providedToken: input.studioToken,
      surface: 'goat-source',
    });
    assertIntakeRateLimit(input.clientKey ?? 'studio', env);
  }
  const result = await handleInner({ ...input, env });
  assertNoTokenReflection(result, input.studioToken ?? '');
  return result;
}

async function handleInner(input: {
  action: CharacterSourceAction;
  body: Record<string, unknown>;
  env: Record<string, string | undefined>;
  publicPreview: boolean;
  storage?: MultipartStoragePort;
}): Promise<Record<string, unknown>> {
  const store = getCharacterSourceStore();
  const config = describeSceneryStorageConfiguration(input.env);
  const storage = await storageFor(input.env, input.storage);
  const discovered = await rediscoverGoatSource(storage);
  if (discovered.receipt && !store.getReceipt()) {
    store.lockReceipt(discovered.receipt);
  }
  const receipt = store.getReceipt() ?? emptyGoatSourceReceipt(config.configured);
  if (discovered.sizeConflict && input.action !== 'status' && input.action !== 'authorize') {
    throw new CharacterSourceError(
      'A Goat object is already stored at the locked key but the size does not match Goat_FINN.zip. SOURCE was not overwritten.',
      'SOURCE_OVERWRITE_REFUSED',
    );
  }

  if (input.action === 'status') {
    const sessions = store.listSessions();
    const state = deriveGoatSourceState({
      receipt,
      connectionReadyOnly: !config.configured,
      resumable: sessions.some((item) => resumeGuidance(item).resumable),
    });
    return {
      schema: CHARACTER_SOURCE_INTAKE_SCHEMA,
      storage: {
        state: config.state,
        configured: config.configured,
        provider: config.provider,
        prefix: config.prefix,
        reusedExistingProvider: config.reusedExistingProvider,
        bucketPresent: config.bucketPresent,
        endpointPresent: config.endpointPresent,
      },
      authorization: publicIntakeAuthorizationSnapshot(input.env),
      bytesPath: 'client-to-signed-r2',
      objectKey: goatSourceObjectKey(),
      expectedFilename: receipt.sourceFilename,
      expectedSize: GOAT_SOURCE_SIZE_BYTES,
      expectedSha256: GOAT_SOURCE_SHA256,
      state,
      receipt,
      checklist: operatorChecklist(state),
      pipeline: connectReceiptToCharacterPipeline(receipt, {
        remoteHashLocked: receipt.sourceLocked && discovered.objectExists,
      }),
      materialization: dryRunGoatSourceMaterialization({
        objectExists: receipt.sourceLocked || discovered.objectExists,
        authAvailable: config.configured,
      }),
      postUploadPreflight: compileGoatPostUploadPreflight({
        receipt,
        live: {
          objectExists: discovered.objectExists,
          storedSize: discovered.storedSize,
        },
      }),
      sessions: sessions.map(publicSession),
      goatProductionReady: false,
      safety: ZERO_INTAKE_SIDE_EFFECTS,
      nextUserAction: nextGoatSourceAction({
        sourceLocked: receipt.sourceLocked,
        connectionReadyOnly: !config.configured,
        sizeConflict: discovered.sizeConflict,
        resumable: sessions.some((item) => resumeGuidance(item).resumable),
      }),
    };
  }

  if (input.action === 'authorize') {
    return {
      schema: CHARACTER_SOURCE_INTAKE_SCHEMA,
      authorized: true,
      sessionOpened: false,
      bytesUploaded: 0,
      previewRuntime: String(input.env.VERCEL_ENV ?? '') === 'preview',
      publicPreview: input.publicPreview,
      storage: {
        state: config.state,
        configured: config.configured,
        prefix: config.prefix,
      },
      objectKey: goatSourceObjectKey(),
      goatProductionReady: false,
      safety: ZERO_INTAKE_SIDE_EFFECTS,
      nextUserAction: 'Select Goat_FINN.zip and tap Upload Goat Source.',
    };
  }

  if (input.action === 'create-session') {
    const existingLockedSha256 =
      receipt.sourceLocked || discovered.reusedExistingObject ? GOAT_SOURCE_SHA256 : null;
    const session = createGoatUploadSession({
      filename: String(input.body.filename ?? ''),
      byteSize: Number(input.body.byteSize ?? 0),
      sha256: String(input.body.sha256 ?? ''),
      existingLockedSha256,
      env: input.env,
    });
    assertCharacterSourceKey(session.objectKey);
    if (session.alreadyVerified || discovered.reusedExistingObject) {
      if (discovered.receipt) store.lockReceipt(discovered.receipt);
      session.alreadyVerified = true;
      session.state = 'SOURCE_LOCKED';
      store.putSession(session);
      await persistGoatUploadSession(session, storage);
      return {
        session: publicSession(session),
        alreadyPresent: true,
        receipt: store.getReceipt() ?? receipt,
        goatProductionReady: false,
      };
    }
    if (!config.configured || storage instanceof ConnectionReadyMultipartStorage) {
      session.connectionReadyOnly = true;
      session.state = 'BLOCKED';
      session.notes.push('R2 credentials are not available. Intake is connection-ready only.');
      store.putSession(session);
      return {
        session: publicSession(session),
        connectionReadyOnly: true,
        receipt,
        goatProductionReady: false,
      };
    }
    const created = await storage.createMultipartUpload({
      key: session.objectKey,
      contentType: 'application/zip',
    });
    session.uploadId = created.uploadId;
    session.state = 'UPLOADING';
    store.putSession(session);
    await persistGoatUploadSession(session, storage);
    return { session: publicSession(session), receipt, goatProductionReady: false };
  }

  const requestedSessionId = String(input.body.sessionId ?? '');
  let session = store.getSession(requestedSessionId);
  if (!session) {
    session = await loadPersistedGoatSession(storage, requestedSessionId);
    if (session) store.putSession(session);
  }
  if (!session) {
    throw new CharacterSourceError('Unknown Goat source upload session.', 'UNKNOWN_SESSION');
  }

  if (input.action === 'sign-part' || input.action === 'retry-part') {
    if (!session.uploadId) {
      throw new CharacterSourceError('Upload id is missing. Create the session again.', 'UNKNOWN_UPLOAD');
    }
    const partNumber = Number(input.body.partNumber ?? 0);
    const part = session.parts.find((item) => item.partNumber === partNumber);
    if (!part) throw new CharacterSourceError('Unknown multipart part.', 'UNKNOWN_PART');
    const signed = await storage.signPart({
      key: session.objectKey,
      uploadId: session.uploadId,
      partNumber,
      ttlSeconds: 15 * 60,
    });
    if (signed.url.includes('vercel.app')) {
      throw new CharacterSourceError('Signed URLs must target private R2, not Vercel.', 'SIGNED_URL_HOST_REFUSED');
    }
    session.parts = session.parts.map((item) =>
      item.partNumber === partNumber ? { ...item, signed: true, failed: false } : item,
    );
    session.state = 'UPLOADING';
    store.putSession(session);
    await persistGoatUploadSession(session, storage);
    return { session: publicSession(session), signedUrl: signed.url, expiresAt: signed.expiresAt };
  }

  if (input.action === 'resume') {
    if (input.body.etag && input.body.partNumber) {
      store.putSession(recordPartEtag(session, Number(input.body.partNumber), String(input.body.etag)));
    }
    const current = store.getSession(session.sessionId)!;
    current.state = remainingParts(current).length ? 'RESUMABLE' : current.state;
    store.putSession(current);
    await persistGoatUploadSession(current, storage);
    return { session: publicSession(current), resume: resumeGuidance(current) };
  }

  if (input.action === 'abort') {
    if (session.uploadId) await storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
    session.state = 'FAILED';
    store.putSession(session);
    await persistGoatUploadSession(session, storage);
    return { session: publicSession(session), aborted: true };
  }

  if (input.action === 'verify') {
    const hash = verifyGoatSourceHash(String(input.body.sha256 ?? session.sha256));
    if (!hash.ok) {
      session.state = 'FAILED';
      store.putSession(session);
      throw new CharacterSourceError(hash.reason, hash.code);
    }
    session.state = 'HASH_VERIFIED';
    store.putSession(session);
    await persistGoatUploadSession(session, storage);
    return { hashVerified: true, session: publicSession(session) };
  }

  if (input.action === 'complete') {
    if (input.body.etag && input.body.partNumber) {
      store.putSession(recordPartEtag(session, Number(input.body.partNumber), String(input.body.etag)));
    }
    const current = store.getSession(session.sessionId)!;
    if (input.body.failedPartNumber) {
      store.putSession(markPartFailed(current, Number(input.body.failedPartNumber)));
      throw new CharacterSourceError('A multipart part failed. Resume the missing part.', 'RESUMABLE');
    }
    const parts = assertCompleteParts(store.getSession(session.sessionId)!);
    if (receipt.sourceLocked && receipt.sourceSha256 === GOAT_SOURCE_SHA256) {
      return {
        session: publicSession(current),
        receipt,
        alreadyCompleted: true,
        pipeline: connectReceiptToCharacterPipeline(receipt),
        goatProductionReady: false,
        safety: ZERO_INTAKE_SIDE_EFFECTS,
      };
    }
    if (!current.uploadId) {
      throw new CharacterSourceError('Upload id is missing.', 'UNKNOWN_UPLOAD');
    }
    let completed: { size: number };
    try {
      completed = await storage.completeMultipartUpload({
        key: current.objectKey,
        uploadId: current.uploadId,
        parts,
      });
    } catch (error) {
      const existing = await storage.headObject(current.objectKey);
      if (existing.exists && existing.size === GOAT_SOURCE_SIZE_BYTES) {
        completed = { size: existing.size };
      } else {
        throw error instanceof CharacterSourceError
          ? error
          : new CharacterSourceError(
              'Multipart completion failed. Resume remaining parts. SOURCE was not locked.',
              'RESUMABLE',
            );
      }
    }
    const head = await storage.headObject(current.objectKey);
    if (!head.exists) {
      throw new CharacterSourceError('R2 object is missing after complete.', 'R2_OBJECT_MISSING');
    }
    if (completed.size !== GOAT_SOURCE_SIZE_BYTES || head.size !== GOAT_SOURCE_SIZE_BYTES) {
      throw new CharacterSourceError('Stored size does not match the locked Goat source.', 'SIZE_MISMATCH');
    }
    const hash = verifyGoatSourceHash(current.sha256);
    if (!hash.ok) {
      throw new CharacterSourceError(hash.reason, hash.code);
    }
    let zipIntegrityVerified = false;
    if (storage.getObject) {
      const bytes = await storage.getObject(current.objectKey);
      if (bytes && bytes.byteLength > 0 && bytes.byteLength < 32 * 1024 * 1024) {
        const inspected = await inspectGoatZipOrFail(bytes);
        if (!inspected.ok) {
          throw new CharacterSourceError(inspected.reason, inspected.code);
        }
        zipIntegrityVerified = inspected.zipIntegrityVerified;
      }
    }
    const locked = buildGoatSourceReceipt({
      sourceSha256: GOAT_SOURCE_SHA256,
      sourceSize: GOAT_SOURCE_SIZE_BYTES,
      uploadCompletedAt: new Date().toISOString(),
      hashVerified: true,
      zipIntegrityVerified,
      sourceLocked: true,
      bucketConfigured: true,
      workingCopyStatus: 'WORKING_COPY_PENDING',
    });
    store.lockReceipt(locked);
    await persistGoatSourceReceipt(locked, storage);
    current.state = 'SOURCE_LOCKED';
    store.putSession(current);
    await persistGoatUploadSession(current, storage);
    return {
      session: publicSession(current),
      receipt: locked,
      pipeline: connectReceiptToCharacterPipeline(locked),
      goatProductionReady: false,
      safety: ZERO_INTAKE_SIDE_EFFECTS,
    };
  }

  throw new CharacterSourceError('Unknown character source action.', 'UNKNOWN_ACTION');
}
