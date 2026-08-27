import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import { GOAT_SOURCE_SHA256, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import { CharacterSourceError, assertGoatMetadataKey } from './keys';
import { buildGoatSourceReceipt, receiptContainsSecrets, type GoatSourceReceipt } from './receipt';
import type { CharacterUploadSession } from './session';
import {
  GOAT_SOURCE_OBJECT_KEY,
  GOAT_SOURCE_PREFIX,
  GOAT_SOURCE_RECEIPT_OBJECT_KEY,
  GOAT_SOURCE_SESSION_PREFIX,
} from './types';

export type GoatSourceDiscovery = {
  receipt: GoatSourceReceipt | null;
  objectExists: boolean;
  storedSize: number | null;
  reusedExistingObject: boolean;
  sizeConflict: boolean;
};

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function decodeJson(bytes: Uint8Array | null): unknown {
  if (!bytes || bytes.byteLength === 0) return null;
  return JSON.parse(new TextDecoder().decode(bytes));
}

function stripSignedMaterial(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSignedMaterial);
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(signedUrl|secretAccessKey|accessKeyId)$/i.test(key) || /x-amz-signature/i.test(key)) {
      throw new CharacterSourceError(
        'Signed URLs and storage credentials must not be persisted.',
        'SIGNED_URL_REFUSED',
      );
    }
    if (typeof item === 'string' && /X-Amz-Signature=/i.test(item)) {
      throw new CharacterSourceError(
        'Signed URLs and storage credentials must not be persisted.',
        'SIGNED_URL_REFUSED',
      );
    }
    next[key] = stripSignedMaterial(item);
  }
  return next;
}

export function goatReceiptObjectKey(): typeof GOAT_SOURCE_RECEIPT_OBJECT_KEY {
  return GOAT_SOURCE_RECEIPT_OBJECT_KEY;
}

export function goatSessionStateKey(sessionId: string): string {
  if (!/^goat-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new CharacterSourceError('Session id is unsafe.', 'UNSAFE_SESSION_ID');
  }
  const key = `${GOAT_SOURCE_SESSION_PREFIX}/${sessionId}.json`;
  assertGoatMetadataKey(key);
  return key;
}

export function parseGoatSourceReceipt(value: unknown): GoatSourceReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<GoatSourceReceipt>;
  if (record.schema !== 'TIVVLEJOY_GOAT_SOURCE_RECEIPT_V1') return null;
  if (record.objectKey !== GOAT_SOURCE_OBJECT_KEY) return null;
  if (record.characterId !== 'CHAR_GOAT_001') return null;
  if (record.credentialsIncluded !== false) return null;
  if (record.goatProductionReady !== false) return null;
  if (receiptContainsSecrets(record as GoatSourceReceipt)) return null;
  if (record.sourceLocked && record.sourceSha256 !== GOAT_SOURCE_SHA256) return null;
  return record as GoatSourceReceipt;
}

export async function persistGoatSourceReceipt(
  receipt: GoatSourceReceipt,
  storage: MultipartStoragePort,
): Promise<void> {
  if (!storage.putObject) return;
  assertGoatMetadataKey(GOAT_SOURCE_RECEIPT_OBJECT_KEY);
  const safe = stripSignedMaterial(receipt) as GoatSourceReceipt;
  if (receiptContainsSecrets(safe)) {
    throw new CharacterSourceError('Receipt contained secrets and was not stored.', 'RECEIPT_SECRET_REFUSED');
  }
  await storage.putObject(GOAT_SOURCE_RECEIPT_OBJECT_KEY, encodeJson(safe), 'application/json');
}

export async function persistGoatUploadSession(
  session: CharacterUploadSession,
  storage: MultipartStoragePort,
): Promise<void> {
  if (!storage.putObject) return;
  const key = goatSessionStateKey(session.sessionId);
  const safe = stripSignedMaterial(session) as CharacterUploadSession;
  await storage.putObject(key, encodeJson(safe), 'application/json');
}

export async function loadPersistedGoatSession(
  storage: MultipartStoragePort,
  sessionId: string,
): Promise<CharacterUploadSession | null> {
  if (!storage.getObject) return null;
  const key = goatSessionStateKey(sessionId);
  const parsed = decodeJson(await storage.getObject(key));
  if (!parsed || typeof parsed !== 'object') return null;
  const session = parsed as CharacterUploadSession;
  if (session.sessionId !== sessionId) return null;
  if (session.objectKey !== GOAT_SOURCE_OBJECT_KEY) return null;
  if (!session.objectKey.startsWith(`${GOAT_SOURCE_PREFIX}/`)) return null;
  return session;
}

export async function rediscoverGoatSource(storage: MultipartStoragePort): Promise<GoatSourceDiscovery> {
  const head = await storage.headObject(GOAT_SOURCE_OBJECT_KEY);
  if (head.exists && head.size != null && head.size !== GOAT_SOURCE_SIZE_BYTES) {
    return {
      receipt: null,
      objectExists: true,
      storedSize: head.size,
      reusedExistingObject: false,
      sizeConflict: true,
    };
  }
  if (storage.getObject) {
    const parsed = parseGoatSourceReceipt(decodeJson(await storage.getObject(GOAT_SOURCE_RECEIPT_OBJECT_KEY)));
    if (parsed?.sourceLocked) {
      return {
        receipt: parsed,
        objectExists: head.exists,
        storedSize: head.size,
        reusedExistingObject: Boolean(head.exists),
        sizeConflict: false,
      };
    }
  }
  if (head.exists && head.size === GOAT_SOURCE_SIZE_BYTES) {
    return {
      receipt: buildGoatSourceReceipt({
        sourceSha256: GOAT_SOURCE_SHA256,
        sourceSize: GOAT_SOURCE_SIZE_BYTES,
        hashVerified: true,
        zipIntegrityVerified: false,
        sourceLocked: true,
        bucketConfigured: true,
        workingCopyStatus: 'WORKING_COPY_PENDING',
      }),
      objectExists: true,
      storedSize: head.size,
      reusedExistingObject: true,
      sizeConflict: false,
    };
  }
  return {
    receipt: null,
    objectExists: false,
    storedSize: null,
    reusedExistingObject: false,
    sizeConflict: false,
  };
}

export function nextGoatSourceAction(input: {
  sourceLocked: boolean;
  connectionReadyOnly: boolean;
  sizeConflict?: boolean;
  resumable?: boolean;
}): string {
  if (input.sizeConflict) {
    return 'Stored Goat object size does not match the locked package. Do not overwrite SOURCE. Resolve the stored object first.';
  }
  if (input.connectionReadyOnly) {
    return 'Preview private storage is not configured yet. Keep Goat_FINN.zip on this device until R2 is available.';
  }
  if (input.sourceLocked) {
    return 'SOURCE is locked. Do not re-upload. Keep the paid GPU gate closed until authorized worker materialization.';
  }
  if (input.resumable) {
    return 'Upload was interrupted. Select the same Goat_FINN.zip and tap Upload Goat Source to resume.';
  }
  return 'Select Goat_FINN.zip and tap Upload Goat Source.';
}
