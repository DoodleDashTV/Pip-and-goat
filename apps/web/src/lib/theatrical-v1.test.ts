/**
 * Proposed theatrical v1 guards. Nothing here approves the assets.
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
const PROPOSED = path.join(REPO_ROOT, 'theatrical-foundation/proposed/v1');

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('theatrical v1 proposals stay outside the canonical lock', () => {
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

  it('keeps every proposed blend outside production-library/', () => {
    const blends = walk(PROPOSED).filter((f) => f.endsWith('.blend'));
    expect(blends.length).toBeGreaterThanOrEqual(6);
    for (const file of blends) {
      expect(file.includes(`${path.sep}production-library${path.sep}`)).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(path.join(PROPOSED, 'BUILD_MANIFEST.json'), 'utf8'));
    expect(manifest.approved).toBe(false);
    expect(manifest.productionLibraryMutated).toBe(false);
    expect(manifest.pip.bones).toEqual(expect.arrayContaining(['eye_L', 'eye_R', 'wing_L', 'backpack']));
    expect(manifest.goat.bones).toEqual(expect.arrayContaining(['eye_L', 'eye_R', 'collar', 'tail']));
    expect(manifest.meadow.groundVerts).toBeGreaterThan(100);
    expect(manifest.lightingVfx.retunesLightingStates).toBe(false);
  });

  it('ships 2K maps and does not self-approve the preview package', () => {
    const textures = walk(path.join(PROPOSED, 'textures')).filter((f) => f.endsWith('.png'));
    expect(textures.length).toBeGreaterThanOrEqual(9);
    const assemble = readFileSync(path.join(REPO_ROOT, 'scripts/blender/assemble_scene.py'), 'utf8');
    expect(assemble).toContain('def install_shadow_proxy');
    expect(assemble).toContain('LIGHTING_STATES');
  });
});
