import { getExpectedSourceFile, matchOfficialDownloadAnywhere } from './inventory';
import type { SourceObjectManifest } from './manifest';
import { validateSourceObjectManifest } from './manifest';
import type { MultipartStoragePort } from './multipart';
import { inspectOfficialSource, type SourceInspectionReport } from './source-inspection';
import type { ByteSource } from './safe-archive-inspect';

export function storageRangeByteSource(
  storage: MultipartStoragePort,
  key: string,
  byteLength: number,
): ByteSource {
  return {
    byteLength,
    async read(offset, length) {
      if (!storage.getObjectRange) {
        throw new Error('Range reads are unavailable on this storage port.');
      }
      const bytes = await storage.getObjectRange(key, offset, length);
      if (!bytes) {
        throw new Error('Private storage range read failed.');
      }
      return bytes;
    },
  };
}

export async function inspectStoredOfficialSources(input: {
  storage: MultipartStoragePort;
  prefix: string;
  manifests: SourceObjectManifest[];
}): Promise<{
  reports: SourceInspectionReport[];
  missing: string[];
  sizeMismatches: Array<{ sourceId: string; declared: number; stored: number }>;
  storageRead: boolean;
}> {
  if (!input.storage.listPrefix) {
    return { reports: [], missing: [], sizeMismatches: [], storageRead: false };
  }
  const objects = await input.storage.listPrefix(`${input.prefix}/source/`);
  const reports: SourceInspectionReport[] = [];
  const missing: string[] = [];
  const sizeMismatches: Array<{ sourceId: string; declared: number; stored: number }> = [];

  for (const manifest of input.manifests) {
    const expected = getExpectedSourceFile(manifest.sourceId);
    const stored =
      objects.find((item) => item.key === manifest.storageObjectKey) ??
      objects.find((item) => matchOfficialDownloadAnywhere(item.key.split('/').pop() ?? '')?.sourceId === manifest.sourceId);
    if (!stored) {
      missing.push(manifest.sourceId);
      reports.push(
        await inspectOfficialSource({
          expected,
          manifest,
          source: null,
          storageReadable: false,
        }),
      );
      continue;
    }
    if (stored.size !== manifest.byteSize) {
      sizeMismatches.push({
        sourceId: manifest.sourceId,
        declared: manifest.byteSize,
        stored: stored.size,
      });
    }
    const source = storageRangeByteSource(input.storage, stored.key, stored.size);
    reports.push(
      await inspectOfficialSource({
        expected,
        manifest: { ...manifest, byteSize: stored.size },
        source,
        storageReadable: true,
      }),
    );
  }
  return { reports, missing, sizeMismatches, storageRead: true };
}

export function parseStoredManifest(bytes: Uint8Array | null): SourceObjectManifest | null {
  if (!bytes) return null;
  try {
    return validateSourceObjectManifest(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
