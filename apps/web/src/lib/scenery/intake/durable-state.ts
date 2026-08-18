import { SceneryError } from '../types';
import { resolveSceneryAssetPrefix } from './config';
import { lookupSourceOrArchive } from './inventory';
import { sceneryInternalObjectKey } from './keys';
import type { SourceObjectManifest } from './manifest';
import { validateSourceObjectManifest } from './manifest';
import type { MultipartStoragePort, UploadSession } from './multipart';
import { getSceneryIntakeStore } from './store';
import { applyQuarantineToManifest, evaluateQuarantine } from './quarantine';

function decodeJson(bytes: Uint8Array | null): unknown {
  if (!bytes) return null;
  return JSON.parse(new TextDecoder().decode(bytes));
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function stripSignedMaterial(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSignedMaterial);
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(signedUrl|secretAccessKey|accessKeyId)$/i.test(key) || /x-amz-signature/i.test(key)) {
      throw new SceneryError(
        'Signed URLs and storage credentials must not be persisted.',
        'SIGNED_URL_REFUSED',
      );
    }
    if (typeof item === 'string' && /X-Amz-Signature=/i.test(item)) {
      throw new SceneryError(
        'Signed URLs and storage credentials must not be persisted.',
        'SIGNED_URL_REFUSED',
      );
    }
    next[key] = stripSignedMaterial(item);
  }
  return next;
}

export function sessionStateKey(
  sessionId: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return sceneryInternalObjectKey({
    prefix: resolveSceneryAssetPrefix(env),
    folder: 'upload-sessions',
    filename: `${sessionId}.json`,
  });
}

export function manifestStateKey(
  sourceId: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return sceneryInternalObjectKey({
    prefix: resolveSceneryAssetPrefix(env),
    folder: 'intake-manifests',
    filename: `${sourceId}.json`,
  });
}

export async function persistUploadSession(
  session: UploadSession,
  storage: MultipartStoragePort,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!storage.putObject) return;
  const safe = stripSignedMaterial(session) as UploadSession;
  await storage.putObject(
    sessionStateKey(session.sessionId, env),
    encodeJson(safe),
    'application/json',
  );
}

export async function persistManifest(
  manifest: SourceObjectManifest,
  storage: MultipartStoragePort,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!storage.putObject) return;
  const safe = validateSourceObjectManifest(stripSignedMaterial(manifest));
  await storage.putObject(
    manifestStateKey(manifest.sourceId, env),
    encodeJson(safe),
    'application/json',
  );
}

export async function deletePersistedSession(
  sessionId: string,
  storage: MultipartStoragePort,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!storage.deleteObject) return;
  await storage.deleteObject(sessionStateKey(sessionId, env));
}

export async function deletePersistedManifest(
  sourceId: string,
  storage: MultipartStoragePort,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!storage.deleteObject) return;
  await storage.deleteObject(manifestStateKey(sourceId, env));
}

export async function hydrateIntakeStore(
  storage: MultipartStoragePort,
  env: Record<string, string | undefined> = process.env,
): Promise<{ sessions: number; manifests: number }> {
  const store = getSceneryIntakeStore();
  if (!storage.listPrefix || !storage.getObject)
    return { sessions: store.sessions.size, manifests: store.manifests.size };
  const prefix = resolveSceneryAssetPrefix(env);
  const sessionPrefix = `${prefix}/quarantine/upload-sessions/`;
  const manifestPrefix = `${prefix}/catalogs/intake-manifests/`;
  for (const item of await storage.listPrefix(sessionPrefix)) {
    const parsed = decodeJson(await storage.getObject(item.key));
    if (parsed && typeof parsed === 'object' && 'sessionId' in parsed) {
      store.putSession(parsed as UploadSession);
    }
  }
  for (const item of await storage.listPrefix(manifestPrefix)) {
    const parsed = decodeJson(await storage.getObject(item.key));
    if (parsed) {
      store.putManifest(validateSourceObjectManifest(parsed));
    }
  }
  // A browser retry can be interrupted after the source object is committed but
  // before its durable manifest is finalized. Reconcile only an exact object-key
  // and byte-size match with an already recorded checksum; never guess by name.
  const storedObjects = new Map(
    (await storage.listPrefix(`${prefix}/source/`)).map((item) => [item.key, item.size]),
  );
  for (const manifest of store.listManifests()) {
    if (manifest.uploadState === 'completed' || manifest.uploadState === 'already_present')
      continue;
    const storedSize = storedObjects.get(manifest.storageObjectKey);
    if (storedSize !== manifest.byteSize || !manifest.sha256) continue;
    let lookup;
    try {
      lookup = lookupSourceOrArchive(manifest.sourceId);
    } catch {
      continue;
    }
    if (lookup.kind !== 'official' || !lookup.official) continue;
    const expected = lookup.official;
    const quarantine = evaluateQuarantine({
      filename: manifest.normalizedFilename,
      collectionValid:
        expected.collectionId === manifest.collectionId ||
        expected.legacyCollectionIds.includes(manifest.collectionId),
      byteSize: manifest.byteSize,
      sha256: manifest.sha256,
      objectAvailable: true,
      sizeMatchesStored: true,
      unityPreservationOnly: expected.unityPreservationOnly,
    });
    const reconciled = applyQuarantineToManifest(
      {
        ...manifest,
        uploadState: 'completed',
        verificationState: 'size_verified',
        verifiedAt: new Date().toISOString(),
        notes: [
          ...manifest.notes,
          'Recovered completed state from an exact stored object and size match.',
        ],
      },
      quarantine,
    );
    store.putManifest(reconciled);
    await persistManifest(reconciled, storage, env);
  }
  return { sessions: store.sessions.size, manifests: store.manifests.size };
}

export async function countPurchasedSourceObjects(
  storage: MultipartStoragePort,
  env: Record<string, string | undefined> = process.env,
): Promise<{ count: number; unavailable: boolean }> {
  if (!storage.listPrefix) return { count: 0, unavailable: true };
  const prefix = `${resolveSceneryAssetPrefix(env)}/source/`;
  const items = await storage.listPrefix(prefix);
  return { count: items.filter((item) => !item.key.endsWith('/')).length, unavailable: false };
}

export function signedUrlTargetsVercel(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('vercel.app') || host.includes('vercel.com');
  } catch {
    return /vercel\.(app|com)/i.test(url);
  }
}
