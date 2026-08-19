import { resolveSceneryAssetPrefix } from '@/lib/scenery/intake/config';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import type {
  InspectionSnapshot,
  PurchasedSourceReceipt,
  PurchasedUploadSessionSnapshot,
  StoredObjectSnapshot,
} from './dynamic-audit';

function prefix(env: Record<string, string | undefined>): string {
  return resolveSceneryAssetPrefix(env).replace(/^\/+|\/+$/g, '');
}

function decode(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const AUDIT_STORAGE_READ_ONLY = true;

export async function loadPurchasedAssetAuditSnapshots(input: {
  storage: Pick<MultipartStoragePort, 'listPrefix' | 'getObject' | 'headObject'>;
  env: Record<string, string | undefined>;
}): Promise<{
  receipts: PurchasedSourceReceipt[];
  sessions: PurchasedUploadSessionSnapshot[];
  storedObjects: StoredObjectSnapshot[];
  inspections: InspectionSnapshot[];
  readOnly: true;
}> {
  if (!input.storage.listPrefix || !input.storage.getObject) {
    return { receipts: [], sessions: [], storedObjects: [], inspections: [], readOnly: true };
  }
  const base = prefix(input.env);
  const receiptPrefix = `${base}/catalogs/purchased-tool-receipts/`;
  const sessionPrefix = `${base}/catalogs/purchased-tool-upload-sessions/`;
  const inspectionPrefix = `${base}/catalogs/purchased-tool-inspections/`;
  const receipts: PurchasedSourceReceipt[] = [];
  const storedObjects: StoredObjectSnapshot[] = [];
  const sessions: PurchasedUploadSessionSnapshot[] = [];
  const inspections: InspectionSnapshot[] = [];

  for (const item of await input.storage.listPrefix(receiptPrefix)) {
    const bytes = await input.storage.getObject(item.key);
    if (!bytes) continue;
    const parsed = decode(bytes) as PurchasedSourceReceipt;
    if (!parsed?.sourceId) continue;
    receipts.push({
      sourceId: parsed.sourceId,
      originalFilename: parsed.originalFilename,
      byteSize: parsed.byteSize,
      stored: parsed.stored,
      clientSha256: parsed.clientSha256,
      objectKey: parsed.objectKey,
      sourceImmutable: parsed.sourceImmutable,
      uploadedAt: parsed.uploadedAt,
    });
    if (parsed.objectKey) {
      const head = await input.storage.headObject(parsed.objectKey);
      storedObjects.push({
        sourceId: parsed.sourceId,
        objectKey: parsed.objectKey,
        exists: head.exists,
        size: head.size,
      });
    }
  }

  for (const item of await input.storage.listPrefix(sessionPrefix)) {
    const bytes = await input.storage.getObject(item.key);
    if (!bytes) continue;
    const parsed = decode(bytes) as { sourceId?: string; state?: PurchasedUploadSessionSnapshot['state']; filename?: string };
    if (!parsed?.sourceId || !parsed.state) continue;
    sessions.push({ sourceId: parsed.sourceId, state: parsed.state, filename: parsed.filename });
  }

  for (const item of await input.storage.listPrefix(inspectionPrefix)) {
    const bytes = await input.storage.getObject(item.key);
    if (!bytes) continue;
    const parsed = decode(bytes) as InspectionSnapshot;
    if (!parsed?.sourceId || !parsed.state) continue;
    inspections.push({ sourceId: parsed.sourceId, state: parsed.state });
  }

  return { receipts, sessions, storedObjects, inspections, readOnly: true };
}
