import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import { ConnectionReadyMultipartStorage } from '@/lib/scenery/intake/multipart';
import { describeSceneryStorageConfiguration, resolveSceneryAssetPrefix } from '@/lib/scenery/intake/config';
import { listRegisteredSources } from '@/lib/scenery/source-registry';
import { probePrivateSourceCatalog } from '@/lib/tivvlejoy-real-scenery-inspection/private-source';
import type { AbstractSourceReceipt } from '@/lib/tivvlejoy-real-scenery-inspection/types';
import { sha256Text } from './hash';
import { assertNoSecrets } from './safety';
import {
  PRIVATE_INVENTORY_SCHEMA,
  type ActivationPolicy,
  type ListedPrivateObject,
  type PackageRole,
  type PrivateObjectInventory,
} from './types';

export type ListedStorageObject = { key: string; size: number; etag?: string | null };

function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx).toLowerCase() : '';
}

function operatorLabel(extension: string, size: number, role: PackageRole): string {
  const mb = size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)}MiB` : `${Math.max(1, Math.round(size / 1024))}KiB`;
  return `${role} ${extension || '(none)'} ${mb}`;
}

function inferRole(input: {
  key: string;
  size: number;
  extension: string;
  catalogSourceId: string | null;
}): PackageRole {
  const hay = input.key.toLowerCase();
  if (input.extension === '.json') return 'RECEIPT_METADATA';
  if (/botaniq|scatter/i.test(hay) || input.size > 2 * 1024 * 1024 * 1024) return 'BOTANIQ_ARCHIVE';
  if (/gaffer|starlight|physical.?sky/i.test(hay)) return 'OPTIONAL_ADDON';
  if (/historical|backup|v[0-9]+\.[0-9]+/i.test(hay)) return 'HISTORICAL_DUPLICATE';
  if (/wrapper|unity/i.test(hay)) return 'WRAPPER';
  if (input.extension === '.glb') return 'DIRECT_GLB';
  if (input.extension === '.fbx') return 'DIRECT_FBX';
  if (input.extension === '.blend') return 'BLEND_SOURCE';
  if (/texture|tex\b/i.test(hay)) return 'TEXTURE_PACKAGE';
  if (/tavern/i.test(hay)) return 'TAVERN_PACKAGE';
  if (/mountain/i.test(hay)) return 'MOUNTAIN_PACKAGE';
  if (/village|bakery/i.test(hay) || input.catalogSourceId === 'SRC_VILLAGE_ENV') return 'VILLAGE_PACKAGE';
  if (/forest/i.test(hay) || input.catalogSourceId === 'SRC_STYLIZED_FOREST') return 'FOREST_PACKAGE';
  if (/sky|hdri/i.test(hay) || input.catalogSourceId === 'SRC_SKY_HDRI') return 'SKY_HDRI_PACKAGE';
  if (input.extension === '.zip' && input.size < 64 * 1024 * 1024) return 'SMALL_ZIP';
  if (input.extension === '.zip') return 'UNKNOWN';
  return 'UNKNOWN';
}

function activationFor(role: PackageRole): ActivationPolicy {
  if (role === 'BOTANIQ_ARCHIVE') return 'NOT_ACTIVATED';
  if (role === 'OPTIONAL_ADDON') return 'OPTIONAL_NOT_ACTIVATED';
  if (role === 'HISTORICAL_DUPLICATE' || role === 'WRAPPER') return 'HELD_LARGE_ARCHIVE';
  if (role === 'RECEIPT_METADATA') return 'METADATA_ONLY';
  return 'INSPECTION_CANDIDATE';
}

function relateCatalog(key: string): { catalogSourceId: string | null; receiptRef: string | null; sourceSha256: string | null } {
  const sources = listRegisteredSources();
  for (const source of sources) {
    const uri = source.sourceStorageUri.replace(/\/$/, '');
    if (key.includes(uri) || key.toLowerCase().includes(source.sourceId.toLowerCase().replace('src_', ''))) {
      return {
        catalogSourceId: source.sourceId,
        receiptRef: null,
        sourceSha256: source.sha256,
      };
    }
  }
  return { catalogSourceId: null, receiptRef: null, sourceSha256: null };
}

function relateReceipt(key: string, receipts: readonly AbstractSourceReceipt[]): AbstractSourceReceipt | null {
  const hashed = sha256Text(key);
  return (
    receipts.find((receipt) => receipt.sourceReceiptRef && sha256Text(receipt.sourceReceiptRef) === hashed) ??
    receipts.find((receipt) => receipt.originalFilename && key.endsWith(receipt.originalFilename)) ??
    receipts.find((receipt) => key.includes(receipt.sourceId)) ??
    null
  );
}

export function buildListedObject(
  item: ListedStorageObject,
  receipts: readonly AbstractSourceReceipt[] = [],
): ListedPrivateObject {
  const extension = extensionOf(item.key);
  const catalog = relateCatalog(item.key);
  const receipt = relateReceipt(item.key, receipts);
  const catalogSourceId = receipt?.sourceId ?? catalog.catalogSourceId;
  const role = inferRole({ key: item.key, size: item.size, extension, catalogSourceId });
  return {
    objectIdentity: sha256Text(item.key),
    operatorLabel: operatorLabel(extension, item.size, role),
    size: item.size,
    etag: item.etag ? sha256Text(item.etag) : null,
    extension,
    receiptRelationship: receipt?.sourceReceiptRef ?? null,
    catalogSourceId,
    knownSourceSha256: receipt?.sourceSha256 ?? catalog.sourceSha256,
    knownUploadReceipt: receipt?.sourceReceiptRef ?? catalog.receiptRef,
    knownPackageRole: role,
    knownActivationPolicy: activationFor(role),
    filenameUsedAsIdentity: false,
  };
}

export function buildPrivateObjectInventory(input: {
  items: readonly ListedStorageObject[];
  receipts?: readonly AbstractSourceReceipt[];
  listingExecuted: boolean;
  realPrivateSourceAccessAvailable: boolean;
  blocker?: string | null;
  commercialBytesDownloaded?: number;
}): PrivateObjectInventory {
  const objects = input.items.map((item) => buildListedObject(item, input.receipts ?? []));
  const extensionCounts: Record<string, number> = {};
  let totalBytes = 0;
  for (const object of objects) {
    totalBytes += object.size;
    const ext = object.extension || '(none)';
    extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
  }
  const inventory: PrivateObjectInventory = {
    schemaVersion: PRIVATE_INVENTORY_SCHEMA,
    listingExecuted: input.listingExecuted,
    realPrivateSourceAccessAvailable: input.realPrivateSourceAccessAvailable,
    objectCount: objects.length,
    totalBytes,
    extensionCounts,
    objects,
    hardcodedObjectTotal: false,
    credentialsPrinted: false,
    commercialBytesDownloaded: input.commercialBytesDownloaded ?? 0,
    r2Mutated: false,
    blocker: input.blocker ?? null,
  };
  assertNoSecrets(inventory);
  return inventory;
}

export async function listRealPrivateObjectInventory(input?: {
  env?: Record<string, string | undefined>;
  listPrefix?: (prefix: string) => Promise<ListedStorageObject[]>;
  receipts?: readonly AbstractSourceReceipt[];
}): Promise<PrivateObjectInventory> {
  const env = input?.env ?? process.env;
  const probe = await probePrivateSourceCatalog({ env, listPrefix: input?.listPrefix });
  if (!probe.listingExecuted || !probe.realPrivateSourceAccessAvailable) {
    return buildPrivateObjectInventory({
      items: [],
      receipts: input?.receipts,
      listingExecuted: probe.listingExecuted,
      realPrivateSourceAccessAvailable: false,
      blocker: probe.blocker,
    });
  }
  const prefix = resolveSceneryAssetPrefix(env);
  let items: ListedStorageObject[] = [];
  if (input?.listPrefix) {
    items = await input.listPrefix(prefix);
  } else {
    const config = describeSceneryStorageConfiguration(env);
    if (!config.configured) {
      return buildPrivateObjectInventory({
        items: [],
        listingExecuted: false,
        realPrivateSourceAccessAvailable: false,
        blocker: 'PRIVATE_SOURCE_CREDENTIALS_OR_REACHABILITY_UNPROVEN',
      });
    }
    const storage = await createConfiguredMultipartStorage(env);
    if (storage instanceof ConnectionReadyMultipartStorage || !storage.listPrefix) {
      return buildPrivateObjectInventory({
        items: [],
        listingExecuted: false,
        realPrivateSourceAccessAvailable: false,
        blocker: 'PRIVATE_SOURCE_LIST_USED_CONNECTION_READY_STUB',
      });
    }
    items = await storage.listPrefix(prefix);
  }
  return buildPrivateObjectInventory({
    items,
    receipts: input?.receipts,
    listingExecuted: true,
    realPrivateSourceAccessAvailable: true,
    blocker: null,
  });
}
