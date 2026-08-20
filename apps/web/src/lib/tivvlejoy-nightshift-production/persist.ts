import { eventTypeFor } from '@/lib/tivvlejoy-production-persistence/events';
import type { ProductionPersistenceStore } from '@/lib/tivvlejoy-production-persistence/store';
import type { EntityType, WriteReceipt } from '@/lib/tivvlejoy-production-persistence/types';
import type { EpisodeDirectorPackage } from './specs';

export function persistDirectorPackage(store: ProductionPersistenceStore, pack: EpisodeDirectorPackage): WriteReceipt[] {
  const receipts: WriteReceipt[] = [];
  const write = (entityType: EntityType, entityId: string, payload: Record<string, unknown>) => {
    receipts.push(
      store.writeRecord({
        entityType,
        entityId,
        payload,
        expectedRevision: store.getRevision(),
        eventType: eventTypeFor(entityType),
        reason: `persist ${entityType}`,
      }),
    );
  };
  write('DIRECTOR_INTENT', pack.episodeId, { sha256: pack.intent.episodeCreativeIntentSha256 });
  write('STORY_BEAT_PLAN', pack.episodeId, { sha256: pack.beats.map((item) => item.beatDependencySha256) });
  write('CAMERA_PLAN', pack.episodeId, { sha256: pack.finalShotSpecs.map((item) => item.cameraSha256) });
  write('STAGING_PLAN', pack.episodeId, { sha256: pack.finalShotSpecs.map((item) => item.stagingSha256) });
  write('LIGHTING_DIRECTION', pack.episodeId, { sha256: pack.finalShotSpecs.map((item) => item.lightingSha256) });
  write('VFX_DIRECTION', pack.episodeId, { sha256: pack.finalShotSpecs.map((item) => item.vfxSha256) });
  write('EDITORIAL_TIMELINE', pack.episodeId, { sha256: pack.editorial.timelineSha256 });
  write('SFX_PLAN', pack.episodeId, { sha256: pack.sfx.map((item) => item.sfxDependencySha256) });
  write('MUSIC_CUE_PLAN', pack.episodeId, { sha256: pack.music.map((item) => item.musicDependencySha256) });
  write('CAPTION_PLAN', pack.episodeId, { sha256: pack.captions.map((item) => item.captionDependencySha256) });
  write('DAILIES_REVIEW', pack.episodeId, { sha256: pack.reviews.map((item) => item.reviewSha256) });
  write('REVISION_REQUEST', pack.episodeId, { sha256: pack.revisions.map((item) => item.revisionSha256) });
  write('FINAL_SHOT_SPEC', pack.episodeId, { sha256: pack.finalShotSpecs.map((item) => item.finalShotSpecSha256) });
  write('DIRECTOR_PACKAGE', pack.episodeId, { sha256: pack.episodeDirectorPackageSha256 });
  return receipts;
}

export function restoreDirectorHashes(store: ProductionPersistenceStore): string[] {
  return store
    .listRecords()
    .filter((record) =>
      [
        'DIRECTOR_INTENT',
        'STORY_BEAT_PLAN',
        'CAMERA_PLAN',
        'STAGING_PLAN',
        'LIGHTING_DIRECTION',
        'VFX_DIRECTION',
        'EDITORIAL_TIMELINE',
        'SFX_PLAN',
        'MUSIC_CUE_PLAN',
        'CAPTION_PLAN',
        'DAILIES_REVIEW',
        'REVISION_REQUEST',
        'FINAL_SHOT_SPEC',
        'DIRECTOR_PACKAGE',
      ].includes(record.entityType),
    )
    .map((record) => JSON.stringify(record.payload))
    .sort((left, right) => left.localeCompare(right));
}
