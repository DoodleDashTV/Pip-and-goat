import { listExpectedSourceFiles } from './inventory';
import { createEmptyManifestRecord, type SourceObjectManifest } from './manifest';

export function createConfirmedOfficialManifests(): SourceObjectManifest[] {
  return listExpectedSourceFiles().map((item, index) => {
    const manifest = createEmptyManifestRecord({
      sourceId: item.sourceId,
      collectionId: item.collectionId,
      originalFilename: item.expectedFilename,
      normalizedFilename: item.expectedFilename,
      objectKey: `tivvlejoy-assets/source/${item.collectionId}/${item.expectedFilename}`,
      byteSize: 1024 + index,
      sha256: `${(index + 1).toString(16).padStart(2, '0')}`.repeat(32),
      mimeType: item.mimeType,
      extension: item.extension,
      now: '2026-08-18T00:00:00.000Z',
    });
    return {
      ...manifest,
      uploadState: 'completed',
      verificationState: 'size_verified',
      quarantineState: 'not_quarantined',
      inspectionState: item.unityPreservationOnly ? 'preservation_only' : 'inspection_ready',
      verifiedAt: '2026-08-18T00:00:00.000Z',
    };
  });
}
