/**
 * `@doodle-dash/direction` — TivvleJoy Studios direction layer, DDP Steps 1–8.
 *
 * Eight deterministic planning systems and the contracts between them. Pure by
 * design: no database, no filesystem, no network, no clock. That is what makes the
 * output reproducible, the tests fast and offline, and "no paid provider required
 * to run tests" true rather than aspirational.
 *
 *   Step 1  Director AI ................ director/
 *   Step 2  Animation and acting ....... acting/
 *   Step 3  Emotion engine ............. emotion/
 *   Step 4  Facial performance ......... face/
 *   Step 5  9:16 camera intelligence ... camera/
 *   Step 6  Lighting Director .......... lighting/
 *   Step 7  VFX registry ............... vfx/
 *   Step 8  Sound system ............... sound/
 *
 * Alongside them, the contracts that keep the eight steps usable by assets that do
 * not exist yet. The current Pip and Goat are prototypes; the studio is being built
 * toward theatrical quality, and these modules are what stop the prototype's limits
 * from being baked into the interfaces:
 *
 *   quality      DRAFT / REVIEW / FINAL tiers, EEVEE and Cycles, passes, comp, grade
 *   assets       versioned mesh / rig / groom / shader / texture bindings and LODs
 *   rig          rig capability profiles, separate from character canon
 *   simulation   groom, simulation caches, secondary motion
 *   acceptance   technical result and artistic approval, kept apart
 *   roadmap      the stage order, the quality baselines, and the Steps 9–16 gate
 */
export * from './determinism';
export * from './versions';
export * from './quality';
export * from './rig';
export * from './assets';
export * from './simulation';
export * from './acceptance';
export * from './roadmap';
export * from './locks';
export * from './schema/common';
export * from './schema/scene-plan';
export * from './schema/blueprint';
export * from './schema/migrations';
export * from './emotion';
export * from './acting';
export * from './face';
export * from './camera';
export * from './lighting';
export * from './vfx';
export * from './sound';
export * from './director';
export * from './bridge';
export * from './ffmpeg';
export * from './overrides';
export * from './cache';
export * from './fixtures';
