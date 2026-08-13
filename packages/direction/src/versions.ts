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

/**
 * v2 adds the theatrical-readiness fields: asset bindings, the render plan, the
 * groom/simulation plan, and split technical/artistic acceptance. v1 blueprints
 * migrate forward — see `schema/migrations.ts` — so nothing stored becomes
 * unreadable.
 */
export const BLUEPRINT_SCHEMA_VERSION = 'ddp-production-blueprint-v2' as const;

/** Ordered oldest → newest. `upgradeBlueprint()` walks this to migrate. */
export const BLUEPRINT_SCHEMA_HISTORY = [
  'ddp-production-blueprint-v1',
  'ddp-production-blueprint-v2',
] as const;
export type BlueprintSchemaVersion = (typeof BLUEPRINT_SCHEMA_HISTORY)[number];

export const SUBSYSTEM_VERSIONS = {
  /** Step 1 */
  director: '1.1.0',
  /** Step 2 */
  acting: '1.0.0',
  /** Step 3 */
  emotion: '1.0.0',
  /** Step 4 — 1.1.0 resolves channels through the rig profile, not literals. */
  face: '1.1.0',
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
  /** Versioned asset bindings: which mesh, rig, groom and textures a shot uses. */
  assets: '1.0.0',
  /** Rig capability profiles, separate from character canon. */
  rig: '1.0.0',
  /** Render tier, engine, passes, compositing and grade. */
  render: '1.0.0',
  /** Groom, simulation caches and secondary motion. */
  simulation: '1.0.0',
} as const;

export type SubsystemName = keyof typeof SUBSYSTEM_VERSIONS;
export type SubsystemVersions = { readonly [K in SubsystemName]: string };

export const SUBSYSTEM_NAMES = Object.keys(SUBSYSTEM_VERSIONS).sort() as SubsystemName[];
