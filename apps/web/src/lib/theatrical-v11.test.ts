/**
 * Proposed theatrical v1.1 guards. Nothing here approves the assets.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  ASSET_BINDINGS,
  FINAL_1080P_ACCEPTANCE,
  THEATRICAL_GATE_STATE,
  evaluateTheatricalGate,
  resolveCharacterBinding,
  roadmapStage,
} from '@doodle-dash/direction';
import { computeRenderAssetFingerprint } from '../../../../packages/production/src/cloud/worker-provenance';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PROPOSED = path.join(REPO_ROOT, 'theatrical-foundation/proposed/v1.1');

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('theatrical v1.1 proposals stay outside the canonical lock', () => {
  it('does not flip the theatrical gate or publish THEATRICAL bindings', () => {
    expect(THEATRICAL_GATE_STATE.assetFoundationComplete).toBe(false);
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(roadmapStage('THEATRICAL_ASSET_FOUNDATION').status).toBe('NOT_STARTED');
    expect(roadmapStage('DDP_STEPS_9_16').status).toBe('BLOCKED');
    expect(() => resolveCharacterBinding('CHAR_PIP_001', 'THEATRICAL')).toThrow(/Theatrical bindings/);
    expect(() => resolveCharacterBinding('CHAR_GOAT_001', 'THEATRICAL')).toThrow(/Theatrical bindings/);
    expect(Object.values(ASSET_BINDINGS).every((b) => b.quality !== 'THEATRICAL')).toBe(true);
  });

  it('leaves the approved production-library fingerprint unchanged', () => {
    const assets = computeRenderAssetFingerprint(REPO_ROOT);
    expect(assets.fingerprint).toBe(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint);
    expect(assets.files).toHaveLength(4);
  });

  it('keeps every proposed v1.1 blend outside production-library/', () => {
    const blends = walk(PROPOSED).filter((f) => f.endsWith('.blend'));
    expect(blends.length).toBeGreaterThanOrEqual(6);
    for (const file of blends) {
      expect(file.includes(`${path.sep}production-library${path.sep}`)).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(path.join(PROPOSED, 'BUILD_MANIFEST.json'), 'utf8'));
    expect(manifest.approved).toBe(false);
    expect(manifest.productionLibraryMutated).toBe(false);
    expect(manifest.voxelRemesh).toBe(false);
    expect(manifest.groomCards).toBe(false);
    expect(manifest.pip.bones).toEqual(expect.arrayContaining(['eye_L', 'eye_R', 'wing_L', 'backpack']));
    expect(manifest.goat.bones).toEqual(expect.arrayContaining(['eye_L', 'eye_R', 'collar', 'tail']));
    expect(manifest.pip.groom).toBe('shader_surface_no_cards');
    expect(manifest.goat.groom).toBe('shader_surface_no_cards');
    expect(manifest.meadow.groundVerts).toBeGreaterThan(100);
    expect(manifest.lightingVfx.retunesLightingStates).toBe(false);
  });

  it('enforces Goat eye-appeal floors and forbids rectangular groom', () => {
    const appeal = JSON.parse(readFileSync(path.join(PROPOSED, 'APPEAL_MEASUREMENTS.json'), 'utf8'));
    expect(appeal.approved).toBe(false);
    expect(appeal.guardsPassed).toBe(true);
    expect(appeal.failures).toEqual([]);
    expect(appeal.goat.eyeWhiteRadius).toBeGreaterThanOrEqual(0.06);
    expect(appeal.goat.eyeToHead).toBeGreaterThanOrEqual(0.3);
    expect(appeal.pip.eyeWhiteRadius).toBeGreaterThanOrEqual(0.05);
    expect(appeal.pip.backpackPresent).toBe(true);
    expect(appeal.goat.collarPresent).toBe(true);
    expect(appeal.goat.tagPresent).toBe(true);
    expect(appeal.pip.forbiddenGroom).toEqual([]);
    expect(appeal.goat.forbiddenGroom).toEqual([]);
  });

  it('does not weaken assemble_scene shadow-caster or lighting-state protection', () => {
    const assemble = readFileSync(path.join(REPO_ROOT, 'scripts/blender/assemble_scene.py'), 'utf8');
    expect(assemble).toContain('def install_shadow_proxy');
    expect(assemble).toContain('LIGHTING_STATES');
    expect(assemble).toContain('DDP_ShadowShrink');
  });
});
