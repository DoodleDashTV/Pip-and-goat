/**
 * Pip production-conversion gate.
 *
 * These tests prove the conversion may start without opening later gates.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ASSET_BINDINGS,
  DEFAULT_RIG_BY_CHARACTER,
  FINAL_1080P_ACCEPTANCE,
  PIP_PROTOTYPE_RIG,
  THEATRICAL_GATE_STATE,
  assertModularRigUnbound,
  evaluateTheatricalGate,
  parseModularRigSpec,
  resolveCharacterBinding,
  roadmapStage,
} from '@doodle-dash/direction';
import {
  APPROVED_PIP_CONVERSION_BLEND,
  APPROVED_PIP_SOURCE_SHA256,
  APPROVED_PIP_WORKING_BLEND,
  assertManifestDoesNotPromote,
  assertPipConversionDoesNotPromote,
  evaluatePipConversionGate,
  parseDurableAssetManifest,
  parsePipProductionConversion,
  parseRecoveryLedger,
} from '@doodle-dash/production';
import { computeRenderAssetFingerprint } from '../../../../packages/production/src/cloud/worker-provenance';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const INTAKE = path.join(REPO_ROOT, 'theatrical-foundation/proposed/pip-replacement-intake');

function readJson(rel: string) {
  return JSON.parse(readFileSync(path.join(INTAKE, rel), 'utf8'));
}

describe('Pip production conversion gate', () => {
  it('can start conversion without claiming production-ready or later gates', () => {
    const gate = evaluatePipConversionGate({
      justinApprovedVisualIdentity: true,
      conversionStarted: true,
      conversionArtifactsPresent: true,
      requestProductionReady: true,
      requestProductionLibraryReplace: true,
      requestTheatricalBind: true,
      requestMerge: true,
      requestVoxelRemesh: true,
      requestPrimitiveRebuild: true,
      requestRigRegistryBind: true,
      requestPaidResources: true,
      requestGoatWork: true,
    });
    expect(gate.visualIdentityApproved).toBe(true);
    expect(gate.conversionStarted).toBe(true);
    expect(gate.conversionComplete).toBe(false);
    expect(gate.productionReady).toBe(false);
    expect(gate.productionLibraryReplaced).toBe(false);
    expect(gate.theatricalBound).toBe(false);
    expect(gate.mergeAuthorized).toBe(false);
    expect(gate.rigRegistryBound).toBe(false);
    expect(gate.workingBlendOverwritten).toBe(false);
    expect(gate.goatTouched).toBe(false);
    expect(gate.paidResources).toBe(false);
    expect(gate.voxelRemesh).toBe(false);
    expect(gate.stopForJustin).toBe(true);
    expect(gate.conversionBlend).toBe(APPROVED_PIP_CONVERSION_BLEND);
    expect(gate.blockers.join(' ')).toContain('Draft PR merge requested and refused');
  });

  it('records the conversion catalog without promoting it', () => {
    const catalogPath = path.join(INTAKE, 'catalogs/pip-production-conversion.json');
    expect(existsSync(catalogPath)).toBe(true);
    const conversion = parsePipProductionConversion(readJson('catalogs/pip-production-conversion.json'));
    assertPipConversionDoesNotPromote(conversion);
    expect(conversion.sourceSha256).toBe(APPROVED_PIP_SOURCE_SHA256);
    expect(conversion.sourceWorkingBlend).toBe(APPROVED_PIP_WORKING_BLEND);
    expect(conversion.conversionBlend).toBe(APPROVED_PIP_CONVERSION_BLEND);
    expect(conversion.boundDesignElements).toEqual(
      expect.arrayContaining(['centered_backpack', 'two_symmetrical_shoulder_straps', 'no_satchel']),
    );
  });

  it('keeps the modular spec unbound and the prototype rig as default', () => {
    const spec = parseModularRigSpec(
      JSON.parse(
        readFileSync(
          path.join(INTAKE, 'rigs/modular-pip-rig-spec.json'),
          'utf8',
        ),
      ),
    );
    assertModularRigUnbound(spec);
    expect(DEFAULT_RIG_BY_CHARACTER.CHAR_PIP_001).toBe(PIP_PROTOTYPE_RIG.rigId);
  });
});

describe('conversion does not loosen theatrical or library locks', () => {
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

  it('lists the conversion copy without approving the durable manifest', () => {
    const manifest = parseDurableAssetManifest(readJson('catalogs/durable-asset-manifest.json'));
    assertManifestDoesNotPromote(manifest);
    expect(manifest.assets.some((asset) => asset.id === 'PIP_PRODUCTION_CONVERSION_COPY')).toBe(true);
    const ledger = parseRecoveryLedger(readJson('catalogs/recovery-ledger.json'));
    expect(ledger.rollbackPoints.some((point) => point.id === 'PIP_PRODUCTION_CONVERSION_START')).toBe(true);
    expect(ledger.paidResources).toBe(false);
  });
});
