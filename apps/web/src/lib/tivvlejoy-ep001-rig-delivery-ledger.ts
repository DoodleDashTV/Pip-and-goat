import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';

export const EP001_RIG_DELIVERY_LEDGER_SCHEMA = 'TIVVLEJOY_EP001_RIG_DELIVERY_LEDGER_V1' as const;

type CharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';

type RigReceipt = {
  schemaVersion?: string;
  episodeId?: string;
  versionId?: string;
  characterId?: string;
  originalFilename?: string;
  normalizedFilename?: string;
  byteSize?: number;
  sourceSha256?: string;
  artistVersionNote?: string;
  objectKey?: string;
  receivedAt?: string;
  receiptSha256?: string;
  immutableOriginal?: boolean;
  uploadVerified?: boolean;
  technicalInspectionPassed?: boolean;
  humanApproved?: boolean;
  episodeAdmitted?: boolean;
};

function prefix(characterId: CharacterId) {
  return `tivvlejoy-assets/characters/${characterId}/rig-deliveries/`;
}

async function readJson(storage: MultipartStoragePort, key: string): Promise<RigReceipt | null> {
  const bytes = await storage.getObject?.(key);
  if (!bytes) return null;
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as RigReceipt; }
  catch { return null; }
}

export async function compileEp001RigDeliveryLedger(input: {
  characterId: CharacterId;
  storage?: MultipartStoragePort;
  env?: Record<string, string | undefined>;
}) {
  const storage = input.storage ?? await createConfiguredMultipartStorage(input.env ?? process.env);
  if (!storage.listPrefix || !storage.getObject) throw new Error('RIG_LEDGER_STORAGE_READ_UNAVAILABLE');
  const objects = await storage.listPrefix(prefix(input.characterId));
  const receiptKeys = objects.map((item) => item.key).filter((key) => key.endsWith('/receipt.json')).sort();
  const receipts = (await Promise.all(receiptKeys.map((key) => readJson(storage, key))))
    .filter((receipt): receipt is RigReceipt => Boolean(receipt && receipt.characterId === input.characterId && receipt.uploadVerified === true && receipt.versionId && receipt.sourceSha256));

  const versions = receipts.map((receipt) => ({
    versionId: String(receipt.versionId),
    originalFilename: String(receipt.originalFilename ?? ''),
    byteSize: Number(receipt.byteSize ?? 0),
    sourceSha256: String(receipt.sourceSha256),
    artistVersionNote: String(receipt.artistVersionNote ?? ''),
    receivedAt: String(receipt.receivedAt ?? ''),
    receiptSha256: String(receipt.receiptSha256 ?? ''),
    immutableOriginal: receipt.immutableOriginal === true,
    technicalInspectionPassed: receipt.technicalInspectionPassed === true,
    humanApproved: receipt.humanApproved === true,
    episodeAdmitted: receipt.episodeAdmitted === true,
  })).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  const byHash = new Map<string, string[]>();
  for (const version of versions) byHash.set(version.sourceSha256, [...(byHash.get(version.sourceSha256) ?? []), version.versionId]);
  const duplicateHashGroups = [...byHash.entries()].filter(([, ids]) => ids.length > 1).map(([sourceSha256, versionIds]) => ({ sourceSha256, versionIds }));

  const body = {
    schemaVersion: EP001_RIG_DELIVERY_LEDGER_SCHEMA,
    episodeId: 'EP001' as const,
    characterId: input.characterId,
    state: versions.length ? 'DELIVERIES_PRESENT_REVIEW_REQUIRED' as const : 'NO_CORRECTED_DELIVERY_PRESENT' as const,
    versions,
    duplicateHashGroups,
    metrics: {
      verifiedDeliveryCount: versions.length,
      uniqueSourceHashCount: byHash.size,
      duplicateHashGroupCount: duplicateHashGroups.length,
      technicallyPassedCount: versions.filter((item) => item.technicalInspectionPassed).length,
      humanApprovedCount: versions.filter((item) => item.humanApproved).length,
      admittedCount: versions.filter((item) => item.episodeAdmitted).length,
    },
    rules: [
      'Every changed source hash is a new immutable delivery version.',
      'An older delivery is never overwritten or deleted by a newer delivery.',
      'Duplicate source hashes are surfaced; they never silently replace an existing version.',
      'Canonical selection is a separate human-reviewed decision and is not inferred from newest timestamp.',
    ],
    authority: {
      canonicalVersionSelected: false as const,
      technicalApprovalGranted: false as const,
      humanApprovalGranted: false as const,
      episodeAdmissionGranted: false as const,
      productionWritesAllowed: false as const,
    },
  };
  return { ...body, rigDeliveryLedgerSha256: sha256Canonical(body) };
}
