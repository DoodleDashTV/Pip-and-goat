/**
 * Pip replacement intake and character-independent production continuation.
 *
 * These tests prove the gate stays closed. They do not approve a candidate.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ASSET_BINDINGS,
  DEFAULT_RIG_BY_CHARACTER,
  FINAL_1080P_ACCEPTANCE,
  PIP_PROTOTYPE_RIG,
  PROXY_CHARACTER_LABEL,
  RIG_PROFILES,
  THEATRICAL_GATE_STATE,
  assertModularRigUnbound,
  evaluateTheatricalGate,
  parseModularRigSpec,
  resolveCharacterBinding,
  roadmapStage,
} from '@doodle-dash/direction';
import {
  INTAKE_PREVIEW_VIEWS,
  LONG_WING_ORIGINAL_SHA256,
  PIP_COMPARISON_ITEM_IDS,
  PROTECTED_INTAKE_PATHS,
  assertCanonReferenceIsNonMutating,
  assertManifestDoesNotPromote,
  assertUnpaidLocalIntake,
  buildPendingChecklist,
  choosePrimaryModel,
  evaluatePipReplacementGate,
  isSupportedIntakeFilename,
  parseCanonReferenceDb,
  parseDurableAssetManifest,
  parseLookdevPresets,
  parseRecoveryLedger,
} from '@doodle-dash/production';
import { computeRenderAssetFingerprint } from '../../../../packages/production/src/cloud/worker-provenance';
import {
  SEASON_ORGANIZATION,
  continuityBlockersForUnapprovedPip,
  evaluateShotPlanningQc,
  planAnimatic,
} from '@doodle-dash/story';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const INTAKE = path.join(REPO_ROOT, 'theatrical-foundation/proposed/pip-replacement-intake');

function readJson(rel: string) {
  return JSON.parse(readFileSync(path.join(INTAKE, rel), 'utf8'));
}

describe('Pip replacement intake gate', () => {
  it('accepts the documented source formats and prefers BLEND', () => {
    expect(isSupportedIntakeFilename('Pip_next.glb')).toBe(true);
    expect(isSupportedIntakeFilename('Pip_next.BLEND')).toBe(true);
    expect(isSupportedIntakeFilename('textures/Color.png')).toBe(true);
    expect(isSupportedIntakeFilename('source.zip')).toBe(true);
    expect(isSupportedIntakeFilename('notes.txt')).toBe(false);
    expect(choosePrimaryModel(['bag.obj', 'Pip.glb', 'Pip.blend'])).toBe('Pip.blend');
  });

  it('never auto-replaces, binds, merges, or writes production-library', () => {
    const gate = evaluatePipReplacementGate({
      justinApproved: true,
      visualChecklistPassed: true,
      requestCanonReplace: true,
      requestTheatricalBind: true,
      requestMerge: true,
      requestProductionLibraryWrite: true,
      requestRigBindToCurrentPip: true,
    });
    expect(gate.autoReplaceCurrentPip).toBe(false);
    expect(gate.approved).toBe(false);
    expect(gate.canonicalMutated).toBe(false);
    expect(gate.theatricalBound).toBe(false);
    expect(gate.merge).toBe(false);
    expect(gate.productionLibraryTouched).toBe(false);
    expect(gate.paidResources).toBe(false);
    expect(gate.stopForJustin).toBe(true);
    expect(gate.blockers.join(' ')).toMatch(/Canon replacement requested and refused/);
  });

  it('keeps every comparison item on REQUIRES_JUSTIN', () => {
    const items = buildPendingChecklist();
    expect(items.map((item) => item.id)).toEqual([...PIP_COMPARISON_ITEM_IDS]);
    expect(items.every((item) => item.status === 'REQUIRES_JUSTIN')).toBe(true);
    expect(PIP_COMPARISON_ITEM_IDS).toContain('one_continuous_cross_body_strap');
    expect(PIP_COMPARISON_ITEM_IDS).toContain('front_exactly_one_diagonal_strap');
    expect(PIP_COMPARISON_ITEM_IDS).toContain('character_right_shoulder_origin');
    expect(PIP_COMPARISON_ITEM_IDS).toContain('character_left_hip_satchel');
  });

  it('refuses paid intake and protects current Pip / long-wing originals', () => {
    expect(assertUnpaidLocalIntake({ CLOUD_RENDER_ENABLED: 'false', ALLOW_PAID_GPU_LAUNCH: 'false' })).toEqual({
      cloudRenderEnabled: false,
      allowPaidGpuLaunch: false,
    });
    expect(() => assertUnpaidLocalIntake({ CLOUD_RENDER_ENABLED: 'true' })).toThrow(/paid/);
    expect(PROTECTED_INTAKE_PATHS.some((item) => item.startsWith('production-library/'))).toBe(true);
    expect(PROTECTED_INTAKE_PATHS.join('\n')).toContain('pip_highres_candidate.blend');
    expect(PROTECTED_INTAKE_PATHS.join('\n')).toContain('pip_long_wing_original.part01.bin');
    expect(LONG_WING_ORIGINAL_SHA256).toBe(
      '9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2',
    );
  });
});

describe('durable catalogs stay non-promoting', () => {
  it('parses the asset manifest, canon reference, presets, and recovery ledger', () => {
    const manifest = parseDurableAssetManifest(readJson('catalogs/durable-asset-manifest.json'));
    assertManifestDoesNotPromote(manifest);
    expect(manifest.productionLibraryFingerprint).toBe(
      FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint,
    );
    expect(manifest.assets.some((asset) => asset.id === 'PIP_LONG_WING_ORIGINAL_PARTS')).toBe(true);

    const canon = parseCanonReferenceDb(readJson('catalogs/canon-reference-db.json'));
    assertCanonReferenceIsNonMutating(canon);
    expect(canon.characters.CHAR_PIP_001).toBeTruthy();
    expect(canon.characters.CHAR_GOAT_001).toBeTruthy();

    const presets = parseLookdevPresets(readJson('presets/lookdev-presets.json'));
    expect(presets.destructive).toBe(false);
    expect(presets.characterDependentFinalFraming).toBe(false);
    expect(presets.render.resolutionX).toBe(1080);
    expect(presets.render.resolutionY).toBe(1920);
    expect(INTAKE_PREVIEW_VIEWS).toContain('shoulder_right');

    const ledger = parseRecoveryLedger(readJson('catalogs/recovery-ledger.json'));
    expect(ledger.paidResources).toBe(false);
    expect(ledger.rollbackPoints.some((point) => point.id === 'APPROVED_LIBRARY_FINGERPRINT')).toBe(true);
  });

  it('keeps the documented ingest command and inbox on disk', () => {
    expect(existsSync(path.join(REPO_ROOT, 'scripts/tivvlejoy/ingest-next-pip.sh'))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, 'docs/PIP_REPLACEMENT_INTAKE.md'))).toBe(true);
    expect(existsSync(path.join(INTAKE, 'inbox/README.md'))).toBe(true);
    expect(existsSync(path.join(INTAKE, 'README.md'))).toBe(true);
  });
});

describe('modular rig spec stays unbound', () => {
  it('does not enter the live rig registry or become Pip default', () => {
    const spec = parseModularRigSpec(readJson('rigs/modular-pip-rig-spec.json'));
    assertModularRigUnbound(spec);
    expect(RIG_PROFILES[spec.rigId]).toBeUndefined();
    expect(DEFAULT_RIG_BY_CHARACTER.CHAR_PIP_001).toBe(PIP_PROTOTYPE_RIG.rigId);
    expect(PROXY_CHARACTER_LABEL).toBe('PROXY_PIPELINE_BIRD');
  });
});

describe('story / shot planning stay blocked for final Pip framing', () => {
  it('plans an internal animatic without claiming production-ready', () => {
    const planned = planAnimatic({
      episodeTitle: 'Internal meadow blocking',
      targetSeconds: 30,
      publicCanon: false,
      paidResources: false,
      beats: [
        {
          beatId: 'hook',
          durationSeconds: 6,
          summary: 'Proxy birds enter the meadow.',
          locationId: 'LOC_MEADOW_001',
          characterCodes: ['PROXY_PIPELINE_BIRD'],
          cameraPreset: 'establishingWide',
        },
        {
          beatId: 'lesson',
          durationSeconds: 24,
          summary: 'A careful plan, no hero close-up on unapproved Pip.',
          locationId: 'LOC_MEADOW_001',
          characterCodes: ['CHAR_PIP_001', 'CHAR_GOAT_001'],
          cameraPreset: 'storyMedium',
          finalCharacterFraming: false,
        },
      ],
    });
    expect(planned.productionReady).toBe(false);
    expect(planned.withinTarget).toBe(true);
    expect(SEASON_ORGANIZATION.publicSeasonOneApproved).toBe(false);
  });

  it('errors if a shot asks for final Pip framing', () => {
    const issues = evaluateShotPlanningQc({
      beatId: 'hero',
      durationSeconds: 4,
      summary: 'Hero close-up',
      locationId: 'LOC_MEADOW_001',
      characterCodes: ['CHAR_PIP_001'],
      cameraPreset: 'heroCloseUp',
      finalCharacterFraming: true,
      usesApprovedCharacterGeometry: false,
    });
    expect(issues.some((issue) => issue.code === 'FINAL_CHARACTER_FRAMING_BLOCKED')).toBe(true);
    expect(issues.some((issue) => issue.code === 'PIP_UNAPPROVED_FOR_FINAL')).toBe(true);
    expect(continuityBlockersForUnapprovedPip({ claimsTheatricalBound: true, mentionsPip: true })).toEqual(
      expect.arrayContaining([
        'Cannot claim theatrical binding while the theatrical gate is closed.',
        'Pip identity may be planned; Pip geometry may not be locked.',
      ]),
    );
  });
});

describe('theatrical and library locks remain closed', () => {
  it('does not flip the theatrical gate or publish THEATRICAL bindings', () => {
    expect(THEATRICAL_GATE_STATE.assetFoundationComplete).toBe(false);
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(roadmapStage('THEATRICAL_ASSET_FOUNDATION').status).toBe('NOT_STARTED');
    expect(roadmapStage('DDP_STEPS_9_16').status).toBe('BLOCKED');
    expect(() => resolveCharacterBinding('CHAR_PIP_001', 'THEATRICAL')).toThrow(/Theatrical bindings/);
    expect(Object.values(ASSET_BINDINGS).every((binding) => binding.quality !== 'THEATRICAL')).toBe(true);
  });

  it('leaves the approved production-library fingerprint unchanged', () => {
    const assets = computeRenderAssetFingerprint(REPO_ROOT);
    expect(assets.fingerprint).toBe(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint);
    expect(assets.fingerprint).toBe('7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7');
    expect(assets.files).toHaveLength(4);
  });
});
