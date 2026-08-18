import type { StoredSourceIndexEntry } from './duplicates';
import type { SourceObjectManifest } from './manifest';
import type { UploadSession } from './multipart';

export class SceneryIntakeStore {
  readonly sessions = new Map<string, UploadSession>();
  readonly manifests = new Map<string, SourceObjectManifest>();

  putSession(session: UploadSession): UploadSession {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId: string): UploadSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  putManifest(manifest: SourceObjectManifest): SourceObjectManifest {
    const existing = this.manifests.get(manifest.sourceId);
    if (
      existing &&
      (existing.uploadState === 'completed' || existing.uploadState === 'already_present') &&
      manifest.uploadState === 'not_started' &&
      existing.sha256 &&
      existing.sha256 === manifest.sha256 &&
      existing.byteSize === manifest.byteSize
    ) {
      return existing;
    }
    this.manifests.set(manifest.sourceId, manifest);
    return manifest;
  }

  listManifests(): SourceObjectManifest[] {
    return [...this.manifests.values()];
  }

  index(): StoredSourceIndexEntry[] {
    return this.listManifests()
      .filter(
        (item) =>
          item.sha256 &&
          item.sourceId !== 'SRC_PREVIEW_SYNTHETIC' &&
          (item.uploadState === 'completed' || item.uploadState === 'already_present') &&
          (item.verificationState === 'size_verified' ||
            item.verificationState === 'independently_verified'),
      )
      .map((item) => ({
        sourceId: item.sourceId,
        collectionId: item.collectionId,
        filename: item.normalizedFilename,
        objectKey: item.storageObjectKey,
        sha256: item.sha256,
        byteSize: item.byteSize,
      }));
  }
}

const globalStore = new SceneryIntakeStore();

export function getSceneryIntakeStore(): SceneryIntakeStore {
  return globalStore;
}

export function resetSceneryIntakeStore(): void {
  globalStore.sessions.clear();
  globalStore.manifests.clear();
}
