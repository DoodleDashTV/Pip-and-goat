/**
 * Cache keys and targeted invalidation.
 *
 * The rule: a field that can change a shot's pixels or its audio is in that shot's
 * cache key, and a field that cannot is not. Getting this wrong in either
 * direction costs money — too little in the key serves stale frames, too much
 * re-renders finished shots for a metadata edit.
 *
 * Timestamps, ids that carry no output meaning, and the blueprint's own hashes are
 * deliberately excluded. Subsystem versions are deliberately included, which is
 * why bumping one is how you invalidate its work.
 */
import { stableHash, shortHash } from './determinism';
import { SUBSYSTEM_VERSIONS } from './versions';
import type { ProductionBlueprint, ShotBlueprint } from './schema/blueprint';

/**
 * Everything in a shot blueprint that affects output.
 *
 * Written as an explicit projection rather than "the whole shot minus a few
 * fields", so adding a field to `ShotBlueprint` does not silently join the cache
 * key — and the "every output-affecting field changes the key" test is meaningful.
 */
export function shotCacheInputs(shot: Omit<ShotBlueprint, 'cacheKey' | 'cost' | 'qc'>): Record<string, unknown> {
  return {
    durationSeconds: shot.durationSeconds,
    frameRange: shot.frameRange,
    seed: shot.seed,
    characters: shot.characters,
    emotion: shot.emotion,
    acting: shot.acting,
    face: shot.face,
    camera: shot.camera,
    lighting: shot.lighting,
    vfx: shot.vfx,
    audio: shot.audio,
    continuity: shot.continuity,
    requiredAssets: shot.requiredAssets,
    shotMeta: shot.shotMeta,
    systemVersions: SUBSYSTEM_VERSIONS,
  };
}

export function computeShotCacheKey(shot: Omit<ShotBlueprint, 'cacheKey' | 'cost' | 'qc'>): string {
  return stableHash(shotCacheInputs(shot));
}

/**
 * Episode-level key: the delivery contract plus the ordered shot keys.
 *
 * Ordered, because re-sequencing shots changes the episode even when every shot is
 * individually unchanged.
 */
export function computeBlueprintCacheKey(input: {
  episodeId: string;
  delivery: unknown;
  shotCacheKeys: readonly string[];
  schemaVersion: string;
}): string {
  return stableHash({
    episodeId: input.episodeId,
    delivery: input.delivery,
    schemaVersion: input.schemaVersion,
    shotCacheKeys: input.shotCacheKeys,
    systemVersions: SUBSYSTEM_VERSIONS,
  });
}

export type BlueprintDiff = {
  /** Shots whose cache key changed and must be re-rendered. */
  readonly invalidatedShotIds: string[];
  /** Shots whose cache key is unchanged and may be reused as-is. */
  readonly reusableShotIds: string[];
  readonly addedShotIds: string[];
  readonly removedShotIds: string[];
  /** Per-shot summary of which subsystems moved. */
  readonly changedSystems: Record<string, string[]>;
  readonly episodeKeyChanged: boolean;
};

/**
 * Compare two blueprints and report exactly what needs re-rendering.
 *
 * This is the evidence behind "targeted invalidation": a lighting tweak on shot 2
 * should report shot 2 invalidated, `lighting` changed, and every other shot
 * reusable. If it reports more than that, the cache keys are too broad.
 */
export function diffBlueprints(previous: ProductionBlueprint, next: ProductionBlueprint): BlueprintDiff {
  const previousShots = new Map(previous.content.shots.map((shot) => [shot.shotId, shot]));
  const nextShots = new Map(next.content.shots.map((shot) => [shot.shotId, shot]));

  const invalidatedShotIds: string[] = [];
  const reusableShotIds: string[] = [];
  const addedShotIds: string[] = [];
  const removedShotIds: string[] = [];
  const changedSystems: Record<string, string[]> = {};

  for (const [shotId, nextShot] of [...nextShots].sort(([a], [b]) => a.localeCompare(b))) {
    const previousShot = previousShots.get(shotId);
    if (!previousShot) {
      addedShotIds.push(shotId);
      invalidatedShotIds.push(shotId);
      continue;
    }
    if (previousShot.cacheKey === nextShot.cacheKey) {
      reusableShotIds.push(shotId);
      continue;
    }
    invalidatedShotIds.push(shotId);
    const systems: string[] = [];
    for (const system of ['emotion', 'acting', 'face', 'camera', 'lighting', 'vfx', 'audio'] as const) {
      if (shortHash(previousShot[system]) !== shortHash(nextShot[system])) systems.push(system);
    }
    if (previousShot.durationSeconds !== nextShot.durationSeconds) systems.push('duration');
    if (shortHash(previousShot.shotMeta) !== shortHash(nextShot.shotMeta)) systems.push('shotMeta');
    changedSystems[shotId] = systems.sort();
  }

  for (const shotId of [...previousShots.keys()].sort()) {
    if (!nextShots.has(shotId)) removedShotIds.push(shotId);
  }

  return {
    invalidatedShotIds: invalidatedShotIds.sort(),
    reusableShotIds: reusableShotIds.sort(),
    addedShotIds: addedShotIds.sort(),
    removedShotIds,
    changedSystems,
    episodeKeyChanged: previous.content.cacheKey !== next.content.cacheKey,
  };
}
