/**
 * Milestone 3 — Blender production consumers for Steps 1–8.
 *
 * The planners already emit acting, emotion, face, lighting and VFX. This file
 * guards the consumer contract: every new hook is opt-in, the accepted shot_meta
 * shape is unchanged at the top level, the chest-seam path is untouched, and
 * delivery stays 1080×1920 / 30fps with the planned 15/30/60-second options.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DELIVERY_RESOLUTIONS,
  VALIDATION_SCENE_PLAN,
  currentStage,
  direct,
  evaluateTheatricalGate,
  projectShotMeta,
} from '@doodle-dash/direction';

const repoRoot = path.resolve(__dirname, '../../../..');
const assembleScene = readFileSync(path.join(repoRoot, 'scripts/blender/assemble_scene.py'), 'utf8');
const planned = direct(VALIDATION_SCENE_PLAN);

const CONSUMERS = [
  'apply_direction_camera',
  'apply_direction_acting',
  'apply_direction_emotion',
  'apply_direction_face',
  'apply_direction_lighting',
  'apply_direction_vfx',
] as const;

describe('Milestone 3 direction consumers', () => {
  it('wires every Steps 1–8 consumer into assemble_scene.py', () => {
    for (const name of CONSUMERS) {
      expect(assembleScene).toContain(`def ${name}`);
    }
    expect(assembleScene).toContain('def apply_facial_cues');
    expect(assembleScene).toContain('def commit_direction_overlays');
    expect(assembleScene).toContain('direction_acting = apply_direction_acting');
    expect(assembleScene).toContain('direction_emotion = apply_direction_emotion');
    expect(assembleScene).toContain('direction_face = apply_direction_face');
    expect(assembleScene).toContain('direction_lighting = apply_direction_lighting');
    expect(assembleScene).toContain('direction_vfx = apply_direction_vfx');
  });

  it('keeps every consumer opt-in and fail-closed on a missing block', () => {
    for (const name of CONSUMERS) {
      const fn = assembleScene.slice(assembleScene.indexOf(`def ${name}`));
      const body = fn.slice(0, fn.indexOf('\ndef ', 4));
      expect(body, name).toMatch(/if not direction:/);
      expect(body, name).toMatch(/return \{"applied": False/);
    }
  });

  it('never lets a direction overlay replace the authored action', () => {
    expect(assembleScene).toContain('strip.blend_type = "ADD"');
    expect(assembleScene).toContain('def commit_direction_overlays');
  });

  it('does not retune LIGHTING_STATES or touch the shadow caster', () => {
    const lightingFn = assembleScene.slice(assembleScene.indexOf('def apply_direction_lighting'));
    const lightingBody = lightingFn.slice(0, lightingFn.indexOf('\ndef ', 4));
    expect(lightingBody).not.toContain('LIGHTING_STATES[');
    expect(lightingBody).not.toContain('install_shadow_proxy');
    expect(assembleScene).toContain('def install_shadow_proxy');
    expect(assembleScene).toContain('SHADOW_PROXY_SHRINK');
    expect(assembleScene).toContain('install_shadow_proxy(objs, light=key_direction)');
    expect(assembleScene).toContain('DDP_PRACTICAL_PREFIX');
    expect(assembleScene).toMatch(/use_shadow = False/);
  });

  it('projects acting, emotion and face under the opt-in direction block only', () => {
    for (const shot of planned.blueprint.content.shots) {
      const keys = Object.keys(shot.shotMeta);
      expect(keys).toContain('direction');
      expect(keys).not.toContain('acting');
      expect(keys).not.toContain('emotion');
      expect(keys).not.toContain('face');
      const direction = shot.shotMeta.direction as Record<string, Record<string, unknown>>;
      expect(Object.keys(direction.acting).length).toBeGreaterThan(0);
      expect(Object.keys(direction.emotion).length).toBeGreaterThan(0);
      expect(Object.keys(direction.face).length).toBeGreaterThan(0);
      for (const role of Object.keys(direction.acting)) {
        expect(['pip', 'goat']).toContain(role);
        expect(typeof direction.acting[role]).toBe('object');
        expect((direction.acting[role] as { baseAction: string }).baseAction).toBeTruthy();
      }
    }
  });

  it('keeps the accepted top-level shot_meta keys when direction is omitted from a projection call', () => {
    const shot = planned.blueprint.content.shots[0];
    const meta = projectShotMeta({
      beat: VALIDATION_SCENE_PLAN.beats[0],
      camera: shot.camera,
      lighting: shot.lighting,
      acting: shot.acting,
      emotion: shot.emotion,
      face: shot.face,
      vfx: shot.vfx,
      frameRange: shot.frameRange,
    });
    expect(meta.cameraPreset).toBeDefined();
    expect(meta.lightingState).toBeDefined();
    expect(meta.placements).toBeDefined();
    expect(meta.direction).toBeDefined();
  });

  it('preserves 1080×1920 vertical delivery, 30 fps, and 15/30/60-second options', () => {
    expect(DELIVERY_RESOLUTIONS).toContain('1080x1920');
    expect(VALIDATION_SCENE_PLAN.delivery.aspect).toBe('9:16');
    expect(VALIDATION_SCENE_PLAN.delivery.fps).toBe(30);
    const createEpisode = readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/studio/create-episode/route.ts'),
      'utf8',
    );
    expect(createEpisode).toContain('[15, 30, 45, 60]');
    const common = readFileSync(path.join(repoRoot, 'packages/direction/src/schema/common.ts'), 'utf8');
    expect(common).toContain('targetDurationSeconds');
    expect(common).toContain('.max(600)');
  });

  it('does not open the theatrical / Steps 9–16 gate', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
  });

  it('does not write to production-library from the direction package', () => {
    const director = readFileSync(path.join(repoRoot, 'packages/direction/src/director/index.ts'), 'utf8');
    expect(director).not.toContain('node:fs');
    expect(director).not.toContain('production-library');
  });

  it('wires the draft --render harness to assemble_scene.py’s real CLI', () => {
    const harness = readFileSync(path.join(repoRoot, 'scripts/direction/validate-scene.ts'), 'utf8');
    expect(harness).toContain('--scene-id');
    expect(harness).toContain('--shot-meta');
    expect(harness).toContain('--assets-json-file');
    expect(harness).toContain('--output-dir');
    expect(harness).toContain('--end-frame');
    expect(assembleScene).toContain('--shot-meta');
    expect(assembleScene).toContain('--assets-json-file');
  });
});
