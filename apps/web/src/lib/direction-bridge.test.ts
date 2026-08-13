/**
 * The bridge from blueprints into the manifests the studio already had.
 *
 * The risk this file exists to cover is not "does the projection work" but "does it
 * change anything that already worked". The accepted FINAL_1080P render came out of
 * `assemble_scene.py` reading a `shot_meta` document, and every assertion here about
 * unchanged keys is guarding that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BLENDER_ROLE_BY_CHARACTER,
  BLUEPRINT_SCHEMA_VERSION,
  FAULTY_SCENE_PLAN_INPUT,
  GOAT_LOCK,
  MEADOW_MAP_MYSTERY_ACCEPTED_SHOT_META,
  PIP_LOCK,
  ScenePlanSchema,
  VALIDATION_SCENE_PLAN,
  direct,
  projectAudioAssembly,
  projectBlueprintForRender,
  projectManifestState,
  projectShotForRender,
} from '@doodle-dash/direction';
import { buildCloudCacheKey } from '@doodle-dash/production';

const planned = direct(VALIDATION_SCENE_PLAN);
const shots = planned.blueprint.content.shots;
const repoRoot = path.resolve(__dirname, '../../../..');

describe('shot_meta projection stays compatible with assemble_scene.py', () => {
  it('emits only the keys the Blender script reads, plus one opt-in block', () => {
    // Pinned against what `assemble_scene.py` actually looks up. A new top-level key
    // that Python ignores is dead weight; a renamed one is a silent behaviour change.
    const understood = new Set([
      'title',
      'cameraPreset',
      'lightingState',
      'placements',
      'actions',
      'lipSync',
      'endFrame',
      'keepImportedLights',
      'dialogue',
      'shotNumber',
      'description',
      'direction',
    ]);
    for (const shot of shots) {
      for (const key of Object.keys(shot.shotMeta)) {
        expect(understood, `shot_meta.${key}`).toContain(key);
      }
    }
  });

  it('keeps the placement contract the Python side destructures', () => {
    for (const shot of shots) {
      const placements = shot.shotMeta.placements as Record<string, Record<string, unknown>>;
      expect(Object.keys(placements).length).toBeGreaterThan(0);
      for (const [role, placement] of Object.entries(placements)) {
        expect(['pip', 'goat']).toContain(role);
        expect(Array.isArray(placement.location)).toBe(true);
        expect((placement.location as number[]).length).toBe(3);
        expect(Array.isArray(placement.rotation)).toBe(true);
        expect((placement.rotation as number[]).length).toBe(3);
        expect(typeof placement.action).toBe('string');
      }
    }
  });

  it('names actions that exist in the approved assets', () => {
    // `assemble_scene.py` raises SystemExit(2) on a missing action, so an unauthored
    // name here is a hard render failure rather than a soft one.
    for (const shot of shots) {
      const placements = shot.shotMeta.placements as Record<string, { action: string }>;
      for (const [role, placement] of Object.entries(placements)) {
        const lock = role === 'pip' ? PIP_LOCK : GOAT_LOCK;
        expect(lock.authoredActions, `${role} ${placement.action}`).toContain(placement.action);
      }
    }
  });

  it('uses the lowercase Blender role names, unrenamed', () => {
    expect(BLENDER_ROLE_BY_CHARACTER[PIP_LOCK.characterCode]).toBe('pip');
    expect(BLENDER_ROLE_BY_CHARACTER[GOAT_LOCK.characterCode]).toBe('goat');
  });

  it('resolves lightingState to a name the Blender lighting layer knows', () => {
    const source = readFileSync(path.join(repoRoot, 'scripts/blender/assemble_scene.py'), 'utf8');
    for (const shot of shots) {
      const state = shot.shotMeta.lightingState as string;
      // The state has to appear in LIGHTING_STATES on the Python side, or
      // apply_lighting_state falls back and the planned look is not what renders.
      expect(source, state).toContain(`"${state}"`);
    }
  });

  it('puts every new field under a single opt-in block', () => {
    for (const shot of shots) {
      const direction = shot.shotMeta.direction as Record<string, unknown>;
      expect(direction).toBeDefined();
      expect(direction.camera).toBeDefined();
      expect(direction.lighting).toBeDefined();
      expect(direction.vfx).toBeDefined();
      expect(direction.version).toBeTruthy();
    }
  });

  it('carries both ends of the focus pull into Blender', () => {
    for (const shot of shots) {
      const camera = (shot.shotMeta.direction as { camera: Record<string, unknown> }).camera;
      expect(camera.focusDistanceMeters).toBeTypeOf('number');
      expect(camera.endFocusDistanceMeters).toBeTypeOf('number');
    }
  });

  it('reads the direction block only when present, so old callers are unaffected', () => {
    const source = readFileSync(path.join(repoRoot, 'scripts/blender/assemble_scene.py'), 'utf8');
    expect(source).toContain('def apply_direction_camera');
    // The early return on a missing block is what makes this safe next to a closed
    // acceptance: no direction block, no behaviour change.
    expect(source).toMatch(/if not direction:\s*\n\s*return \{"applied": False/);
    expect(source).toContain('shot_meta.get("direction")');
  });

  it('leaves the shadow-caster repair untouched', () => {
    const source = readFileSync(path.join(repoRoot, 'scripts/blender/assemble_scene.py'), 'utf8');
    expect(source).toContain('def install_shadow_proxy');
    expect(source).toContain('DDP_ShadowShrink');
    expect(source).toContain('install_shadow_proxy(objs, light=key_direction)');
  });
});

describe('CloudJobManifest state bags', () => {
  const state = projectManifestState(shots[0]);

  it('fills the five bags that were previously always empty', () => {
    expect(Object.keys(state.cameraState).length).toBeGreaterThan(0);
    expect(Object.keys(state.lightingState).length).toBeGreaterThan(0);
    expect(Object.keys(state.vfxState).length).toBeGreaterThan(0);
    expect(Object.keys(state.expressionStates).length).toBeGreaterThan(0);
    expect(Object.keys(state.visemeData).length).toBeGreaterThan(0);
  });

  it('keys expressions and visemes by Blender role', () => {
    for (const role of Object.keys(state.expressionStates)) expect(['pip', 'goat']).toContain(role);
    for (const role of Object.keys(state.visemeData)) expect(['pip', 'goat']).toContain(role);
  });

  it('separates visemes from expression cues so they invalidate independently', () => {
    const pip = state.expressionStates.pip as { cues: Array<{ channel: string }> };
    expect(pip.cues.every((cue) => !cue.channel.startsWith('viseme_'))).toBe(true);
    const visemes = state.visemeData.pip as Array<{ viseme: string }> | undefined;
    if (visemes) expect(visemes.every((cue) => !cue.viseme.startsWith('viseme_'))).toBe(true);
  });

  it('keeps the existing lighting state name alongside the richer recipe', () => {
    // A consumer that only understands the old string still finds it.
    expect(typeof state.lightingState.state).toBe('string');
    expect(state.lightingState.state).toBe(shots[0].lighting.state);
  });

  it('omits cost estimates, which do not change pixels', () => {
    const serialised = JSON.stringify(state);
    expect(serialised).not.toContain('estimatedCloudCostUsd');
    expect(serialised).not.toContain('estimatedLocalMinutes');
  });

  it('changes the existing cloud cache key when direction changes', () => {
    // `buildCloudCacheKey()` already hashed these bags before this tranche. Filling
    // them is what finally makes a direction change invalidate a cloud render.
    const base = {
      schemaVersion: 'ddp-cloud-job-manifest-v1' as const,
      renderMode: 'DRAFT_FAST',
      resolution: '360x640',
      fps: 30,
      blenderVersionRequirement: '4.2',
      characters: {},
      environments: [],
      props: [],
      animations: [],
      audioReferences: [],
      renderSettings: {},
      cacheKeys: [],
    };
    const empty = buildCloudCacheKey({
      ...base,
      expressionStates: {},
      visemeData: {},
      cameraState: {},
      lightingState: {},
      vfxState: {},
    } as never);
    const withDirection = buildCloudCacheKey({ ...base, ...state } as never);
    expect(withDirection).not.toBe(empty);

    const otherShot = buildCloudCacheKey({ ...base, ...projectManifestState(shots[3]) } as never);
    expect(otherShot).not.toBe(withDirection);
  });

  it('is stable for an unchanged shot', () => {
    expect(JSON.stringify(projectManifestState(shots[0]))).toBe(JSON.stringify(state));
  });
});

describe('audio assembly projection', () => {
  const audio = projectAudioAssembly(shots[0]);

  it('carries everything FFmpeg needs and nothing it does not', () => {
    expect(audio.tracks.length).toBeGreaterThan(0);
    expect(audio.mixConfigKey).toBeTruthy();
    expect(audio.durationMs).toBeGreaterThan(0);
    expect(audio.loudness.targetLufs).toBeLessThanOrEqual(-14);
    expect(audio.mixBusTrimDb).toBeLessThanOrEqual(0);
  });

  it('never asks for a paid provider', () => {
    for (const request of audio.voiceRequests) expect(request.requiresPaidProvider).toBe(false);
    for (const track of audio.tracks) expect(track.source.provider).not.toBe('external');
  });

  it('gives every track a cache key so one can be replaced alone', () => {
    for (const track of audio.tracks) expect(track.source.cacheKey).toBeTruthy();
  });
});

describe('render projection', () => {
  it('projects a passing blueprint shot by shot', () => {
    const projection = projectBlueprintForRender(planned.blueprint);
    expect(projection.shots).toHaveLength(shots.length);
    expect(projection.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION);
    expect(projection.contentHash).toBe(planned.blueprint.content.contentHash);
    for (const shot of projection.shots) {
      expect(shot.qcStatus).toBe('PASS');
      expect(shot.roles.length).toBeGreaterThan(0);
      expect(shot.resolution).toBe(VALIDATION_SCENE_PLAN.delivery.resolution);
      expect(shot.cacheKey).toBeTruthy();
    }
  });

  it('refuses to project a blueprint that failed validation', () => {
    // The last gate before a provider: a plan the studio already knows is wrong must
    // not become a render just because someone called the next function.
    const faulty = direct(ScenePlanSchema.parse(FAULTY_SCENE_PLAN_INPUT));
    expect(() => projectBlueprintForRender(faulty.blueprint)).toThrow(/failed validation/i);
  });

  it('refuses a blueprint from an unknown schema version', () => {
    const tampered = structuredClone(planned.blueprint) as typeof planned.blueprint;
    (tampered.content as { schemaVersion: string }).schemaVersion = 'ddp-production-blueprint-v99';
    expect(() => projectBlueprintForRender(tampered)).toThrow(/migrate|v99/i);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(projectShotForRender(shots[0]))).toBe(
      JSON.stringify(projectShotForRender(shots[0])),
    );
  });
});

describe('accepted evidence remains valid', () => {
  it('keeps the accepted Meadow Map Mystery placements as a regression fixture', () => {
    const placements = MEADOW_MAP_MYSTERY_ACCEPTED_SHOT_META.placements;
    expect(placements.pip.location).toEqual([-0.72, -1.62, 0.0]);
    expect(placements.goat.location).toEqual([0.78, -1.42, 0.0]);
    expect(placements.pip.action).toBe('PIP_POINT');
    expect(placements.goat.action).toBe('GOAT_HEAD_NOD');
  });

  it('reads the accepted 1080p metadata unchanged, if the artifact is present', () => {
    // The mp4 itself is LFS-backed and may be absent; the metadata is committed.
    const metadataPath = path.join(
      repoRoot,
      'artifacts/final-1080p-seam-confirm/accept1080-2026-08-13T18-02-48-636Z/metadata.json',
    );
    let raw: string;
    try {
      raw = readFileSync(metadataPath, 'utf8');
    } catch {
      return;
    }
    const metadata = JSON.parse(raw) as Record<string, unknown>;
    expect(JSON.stringify(metadata)).toContain('8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830');
  });

  it('leaves production-library untouched by the direction layer', () => {
    // No planner may write an asset. The whole package is pure, so the assertion is
    // structural: nothing in it imports a filesystem module.
    const directionSrc = path.join(repoRoot, 'packages/direction/src');
    const files = readFileSync(path.join(directionSrc, 'index.ts'), 'utf8');
    expect(files).not.toContain('node:fs');
    for (const module of ['director/index.ts', 'acting/index.ts', 'vfx/index.ts', 'sound/index.ts']) {
      const source = readFileSync(path.join(directionSrc, module), 'utf8');
      expect(source, module).not.toContain('node:fs');
      expect(source, module).not.toContain('production-library');
    }
  });
});
