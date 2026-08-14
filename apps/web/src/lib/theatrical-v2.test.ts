/**
 * Proposed theatrical v2 guards. Nothing here approves the assets.
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
const PROPOSED = path.join(REPO_ROOT, 'theatrical-foundation/proposed/v2');

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('theatrical v2 proposals stay outside the canonical lock', () => {
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

  it('keeps every proposed v2 blend outside production-library/', () => {
    const blends = walk(PROPOSED).filter((f) => f.endsWith('.blend'));
    expect(blends.length).toBeGreaterThanOrEqual(2);
    for (const file of blends) {
      expect(file.includes(`${path.sep}production-library${path.sep}`)).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(path.join(PROPOSED, 'BUILD_MANIFEST.json'), 'utf8'));
    expect(manifest.approved).toBe(false);
    expect(manifest.productionLibraryMutated).toBe(false);
    expect(manifest.voxelRemesh).toBe(false);
    expect(manifest.groomCards).toBe(false);
    expect(manifest.importedRejectedGlb).toBe(false);
    expect(manifest.importedV11Meshes).toBe(false);
    expect(manifest.retopo).toBe(false);
    expect(manifest.rigged).toBe(false);
    expect(manifest.characterIds.pip).toBe('CHAR_PIP_001');
    expect(manifest.characterIds.goat).toBe('CHAR_GOAT_001');
    expect(manifest.pip.satchel).toBe(true);
    expect(manifest.pip.neckerchief).toBe(true);
    expect(manifest.pip.hasOldPurpleBackpack).toBe(false);
    expect(manifest.goat.hornCount).toBe(2);
    expect(manifest.goat.compass).toBe(true);
    expect(manifest.goat.neckerchief).toBe(true);
    expect(manifest.goat.hasBlueCollar).toBe(false);
    expect(manifest.goat.hasGoatTag).toBe(false);
    expect(manifest.goat.eyeWhiteRadius).toBeGreaterThanOrEqual(0.05);
  });

  it('does not weaken assemble_scene shadow-caster or lighting-state protection', () => {
    const assemble = readFileSync(path.join(REPO_ROOT, 'scripts/blender/assemble_scene.py'), 'utf8');
    expect(assemble).toContain('def install_shadow_proxy');
    expect(assemble).toContain('LIGHTING_STATES');
    expect(assemble).toContain('DDP_ShadowShrink');
  });

  it('labels the v2 spec as proposed and unapproved', () => {
    const spec = readFileSync(path.join(PROPOSED, 'CHARACTER_SPEC.md'), 'utf8');
    expect(spec).toContain('PROPOSED UNAPPROVED V2');
    expect(spec).toContain('Approved:** no');
    expect(spec).not.toContain('assetFoundationComplete: true');
  });
});
