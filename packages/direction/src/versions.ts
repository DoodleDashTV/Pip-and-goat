/**
 * Every subsystem's version in one place.
 *
 * These are not decoration. They are hashed into shot cache keys, so bumping one
 * is how you tell the studio "this system now produces different output; the shots
 * it planned are stale". Bump the version in the same commit as the behaviour
 * change, or the cache will hand back frames the new planner would not have asked
 * for.
 */
export const SCENE_PLAN_SCHEMA_VERSION = 'ddp-scene-plan-v1' as const;
export const BLUEPRINT_SCHEMA_VERSION = 'ddp-production-blueprint-v1' as const;

/** Ordered oldest → newest. `upgradeBlueprint()` walks this to migrate. */
export const BLUEPRINT_SCHEMA_HISTORY = ['ddp-production-blueprint-v1'] as const;
export type BlueprintSchemaVersion = (typeof BLUEPRINT_SCHEMA_HISTORY)[number];

export const SUBSYSTEM_VERSIONS = {
  /** Step 1 */
  director: '1.0.0',
  /** Step 2 */
  acting: '1.0.0',
  /** Step 3 */
  emotion: '1.0.0',
  /** Step 4 */
  face: '1.0.0',
  /** Step 5 */
  camera: '1.0.0',
  /** Step 6 */
  lighting: '1.0.0',
  /** Step 7 */
  vfx: '1.0.0',
  /** Step 8 */
  sound: '1.0.0',
  /** Character/voice lock data. Bumping this re-validates every blueprint. */
  locks: '1.0.0',
} as const;

export type SubsystemName = keyof typeof SUBSYSTEM_VERSIONS;
export type SubsystemVersions = { readonly [K in SubsystemName]: string };

export const SUBSYSTEM_NAMES = Object.keys(SUBSYSTEM_VERSIONS).sort() as SubsystemName[];
