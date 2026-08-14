/**
 * Theatrical CGI Asset Foundation — non-approval guards.
 *
 * This stage may inventory, propose, and preview. It may not flip the
 * theatrical gate, publish THEATRICAL bindings, or change the approved
 * production-library fingerprint.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  ASSET_BINDINGS,
  FINAL_1080P_ACCEPTANCE,
  THEATRICAL_GATE_STATE,
  currentStage,
  evaluateTheatricalGate,
  resolveCharacterBinding,
  roadmapStage,
} from '@doodle-dash/direction';
import { computeRenderAssetFingerprint, RENDER_ASSET_ROOTS } from '../../../../packages/production/src/cloud/worker-provenance';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('theatrical foundation does not promote itself', () => {
  it('keeps the theatrical / Steps 9–16 gate closed', () => {
    expect(THEATRICAL_GATE_STATE.assetFoundationComplete).toBe(false);
    expect(THEATRICAL_GATE_STATE.goldenSceneRendered).toBe(false);
    expect(THEATRICAL_GATE_STATE.justinApproved).toBe(false);
    expect(THEATRICAL_GATE_STATE.referenceQualityLockEngaged).toBe(false);
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(roadmapStage('THEATRICAL_ASSET_FOUNDATION').status).toBe('NOT_STARTED');
    expect(roadmapStage('DDP_STEPS_9_16').status).toBe('BLOCKED');
  });

  it('still fails closed when a planner asks for theatrical Pip or Goat', () => {
    expect(() => resolveCharacterBinding('CHAR_PIP_001', 'THEATRICAL')).toThrow(/Theatrical bindings/);
    expect(() => resolveCharacterBinding('CHAR_GOAT_001', 'THEATRICAL')).toThrow(/Theatrical bindings/);
    const qualities = Object.values(ASSET_BINDINGS).map((binding) => binding.quality);
    expect(qualities).not.toContain('THEATRICAL');
  });

  it('leaves the approved production-library fingerprint on the accepted pin', () => {
    const assets = computeRenderAssetFingerprint(REPO_ROOT);
    expect(assets.fingerprint).toBe(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint);
    expect(assets.fingerprint).toBe('7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7');
    expect(assets.files).toHaveLength(4);
  });

  it('keeps proposed blends outside the fingerprint roots', () => {
    const roots = RENDER_ASSET_ROOTS.map((root) => path.join(REPO_ROOT, root.repoDir));
    const proposed = walkFiles(path.join(REPO_ROOT, 'theatrical-foundation'));
    const blends = proposed.filter((file) => file.endsWith('.blend'));
    expect(blends.length).toBeGreaterThan(0);
    for (const file of blends) {
      expect(roots.some((root) => file.startsWith(root + path.sep))).toBe(false);
    }
    const libraryBlends = walkFiles(path.join(REPO_ROOT, 'production-library')).filter((file) =>
      file.endsWith('.blend'),
    );
    expect(libraryBlends).toHaveLength(4);
  });
});

describe('theatrical foundation review package is present and labeled', () => {
  const inventory = readFileSync(path.join(REPO_ROOT, 'theatrical-foundation/ASSET_INVENTORY.md'), 'utf8');
  const requirements = readFileSync(
    path.join(REPO_ROOT, 'theatrical-foundation/THEATRICAL_CGI_REQUIREMENTS.md'),
    'utf8',
  );
  const recipes = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'theatrical-foundation/proposed/shader_recipes_v0.json'), 'utf8'),
  ) as {
    approved: boolean;
    label: string;
    rules: { neverChangeBaseColor: boolean; neverWriteProductionLibrary: boolean };
    materials: Record<string, Record<string, unknown>>;
  };

  it('records inventory classes and the locked fingerprint', () => {
    expect(inventory).toContain('7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7');
    expect(inventory).toContain('Production-ready');
    expect(inventory).toContain('Needs upgrade');
    expect(inventory).toContain('Missing');
    expect(inventory).toContain('Prohibited');
    expect(inventory).toContain('not approved');
  });

  it('defines measurable requirements without claiming approval', () => {
    expect(requirements).toContain('1080×1920');
    expect(requirements).toContain('Khronos PBR Neutral');
    expect(requirements).toContain('install_shadow_proxy');
    expect(requirements).toContain('No asset group is approved');
    expect(requirements).not.toContain('assetFoundationComplete: true');
  });

  it('keeps proposed shader recipes unapproved and identity-safe', () => {
    expect(recipes.approved).toBe(false);
    expect(recipes.label).toBe('proposed upgrade');
    expect(recipes.rules.neverChangeBaseColor).toBe(true);
    expect(recipes.rules.neverWriteProductionLibrary).toBe(true);
    expect(recipes.materials.PipBody).toBeTruthy();
    expect(recipes.materials.GoatBody).toBeTruthy();
    for (const recipe of Object.values(recipes.materials)) {
      expect(recipe).not.toHaveProperty('baseColor');
      expect(recipe).not.toHaveProperty('metallic');
    }
  });

  it('labels every preview as existing, proposed, or diagnostic', () => {
    const manifestPath = path.join(REPO_ROOT, 'artifacts/theatrical-foundation/previews/manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      approved: boolean;
      previews: Array<{ file: string; label: string }>;
    };
    expect(manifest.approved).toBe(false);
    expect(manifest.previews.length).toBeGreaterThanOrEqual(18);
    const allowed = new Set(['existing approved asset', 'proposed upgrade', 'temporary diagnostic asset']);
    for (const preview of manifest.previews) {
      expect(allowed.has(preview.label)).toBe(true);
      expect(existsSync(path.join(REPO_ROOT, preview.file))).toBe(true);
    }
    expect(manifest.previews.some((preview) => preview.label === 'existing approved asset')).toBe(true);
    expect(manifest.previews.some((preview) => preview.label === 'proposed upgrade')).toBe(true);
    expect(manifest.previews.some((preview) => preview.label === 'temporary diagnostic asset')).toBe(true);
  });
});
