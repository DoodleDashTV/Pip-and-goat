import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  botaniqUploadIsInsufficient,
  evaluateBlenderExecutionReadiness,
  evaluateEp012Readiness,
  evaluateWorkerIdentity,
  purchasedToolSourceReceiptAdapter,
  readinessFixtures,
  purchasedBotaniqUploadFixture,
  purchasedWorkstreamUntouched,
  scanReadinessTripwires,
  validateHashChain,
} from './tivvlejoy-blender-execution-readiness';

const repoRoot = path.resolve(__dirname, '../../../..');
const fixtures = readinessFixtures();

describe('execution readiness gate', () => {
  it('builds a deterministic readiness receipt', () => {
    const first = evaluateBlenderExecutionReadiness(fixtures.readyExceptAuth);
    const second = evaluateBlenderExecutionReadiness({ ...fixtures.readyExceptAuth, notes: 'ignored' });
    expect(first.receiptSha256).toBe(second.receiptSha256);
  });

  it('passes an exact hash chain', () => {
    const chain = validateHashChain(fixtures.readyExceptAuth.observedHashes, fixtures.readyExceptAuth.expectedHashes);
    expect(chain.allExact).toBe(true);
    expect(evaluateBlenderExecutionReadiness(fixtures.readyExceptAuth).dependencyValidation).toBe(true);
  });

  it('blocks shot, assembly, plan, and script hash mismatches', () => {
    expect(evaluateBlenderExecutionReadiness(fixtures.shotHashMismatch).readinessState).toBe('BLOCKED_HASH_MISMATCH');
    expect(evaluateBlenderExecutionReadiness(fixtures.assemblyHashMismatch).readinessState).toBe('BLOCKED_HASH_MISMATCH');
    expect(evaluateBlenderExecutionReadiness(fixtures.planHashMismatch).readinessState).toBe('BLOCKED_HASH_MISMATCH');
    expect(evaluateBlenderExecutionReadiness(fixtures.scriptHashMismatch).readinessState).toBe('BLOCKED_HASH_MISMATCH');
  });

  it('passes a safe script audit and blocks an unsafe one', () => {
    expect(evaluateBlenderExecutionReadiness(fixtures.readyExceptAuth).scriptSafety).toBe(true);
    expect(evaluateBlenderExecutionReadiness(fixtures.unsafeScript).readinessState).toBe('BLOCKED_SCRIPT_AUDIT');
  });

  it('blocks missing, unapproved, quarantined, and unknown-provenance assets', () => {
    expect(evaluateBlenderExecutionReadiness(fixtures.missingVegetation).readinessState).toBe('BLOCKED_MISSING_ASSET');
    expect(evaluateBlenderExecutionReadiness(fixtures.quarantined).readinessState).toBe('BLOCKED_QUARANTINED_ASSET');
    expect(evaluateBlenderExecutionReadiness(fixtures.unknownProvenance).readinessState).toBe('BLOCKED_PROVENANCE_UNKNOWN');
    const restricted = evaluateBlenderExecutionReadiness({
      ...fixtures.readyExceptAuth,
      allowRestrictedAssets: false,
      assets: fixtures.readyExceptAuth.assets.map((item, index) =>
        index === 0 ? { ...item, provenanceStatus: 'RESOLVED_RESTRICTED' } : item,
      ),
    });
    expect(restricted.readinessState).toBe('BLOCKED_UNAPPROVED_ASSET');
  });

  it('blocks missing Pip and Goat production rigs', () => {
    expect(evaluateBlenderExecutionReadiness(fixtures.missingPipRig).readinessState).toBe('BLOCKED_MISSING_RIG');
    expect(evaluateBlenderExecutionReadiness(fixtures.missingGoatRig).readinessState).toBe('BLOCKED_MISSING_RIG');
  });

  it('blocks incompatible Blender and mutable worker tags', () => {
    expect(evaluateBlenderExecutionReadiness(fixtures.incompatibleBlender).readinessState).toBe('BLOCKED_BLENDER_VERSION');
    expect(evaluateBlenderExecutionReadiness(fixtures.mutableWorker).readinessState).toBe('BLOCKED_WORKER_IDENTITY');
  });

  it('accepts an immutable digest worker and blocks missing materialization', () => {
    expect(evaluateWorkerIdentity(fixtures.readyExceptAuth.worker).valid).toBe(true);
    expect(evaluateBlenderExecutionReadiness(fixtures.missingMaterialization).readinessState).toBe('BLOCKED_MATERIALIZATION');
  });

  it('reaches READY_FOR_EXECUTION_AUTHORIZATION without issuing auth or requesting execution', () => {
    const ready = evaluateBlenderExecutionReadiness(fixtures.readyExceptAuth);
    expect(ready.readinessState).toBe('READY_FOR_EXECUTION_AUTHORIZATION');
    expect(ready.executionAuthorizationIssued).toBe(false);
    expect(ready.authorization.issued).toBe(false);
    expect(ready.intent.executionRequested).toBe(false);
    expect(ready.blenderExecuted).toBe(false);
  });
});

describe('boundaries, EP012, and isolation', () => {
  it('does not treat a Botaniq upload receipt as approval', () => {
    const upload = purchasedBotaniqUploadFixture();
    expect(botaniqUploadIsInsufficient(upload)).toBe(true);
    expect(purchasedToolSourceReceiptAdapter(upload).approvalStatus).toBe('unapproved');
  });

  it('keeps the native Blender route free of commercial plugins', () => {
    const ready = evaluateBlenderExecutionReadiness(fixtures.readyExceptAuth);
    expect(ready.nativeLighting.pluginDependency).toBe('NONE');
    expect(ready.nativeLighting.gaffer).toBe('OPTIONAL_PROVIDER_NOT_ACTIVATED');
    expect(ready.nativeLighting.physicalStarlight).toBe('OPTIONAL_PROVIDER_NOT_ACTIVATED');
    expect(ready.botaniq.geoScatterIntegrated).toBe(false);
    expect(ready.botaniq.executionReady).toBe(false);
  });

  it('evaluates all 11 EP012 shots and keeps real execution blocked', () => {
    const report = evaluateEp012Readiness();
    expect(report.receipts).toHaveLength(11);
    expect(report.summary.shotCount).toBe(11);
    expect(report.summary.readyForAuthorizationCount).toBe(0);
    expect(report.summary.blockedShotCount).toBe(11);
    expect(report.summary.authorizationIssuedCount).toBe(0);
    expect(report.summary.blenderExecutedCount).toBe(0);
    expect(report.receipts.every((item) => item.blenderExecuted === false)).toBe(true);
    expect(report.receipts.every((item) => item.providerContacted === false)).toBe(true);
    expect(report.receipts.every((item) => item.executionAuthorizationIssued === false)).toBe(true);
  });

  it('does not contact a provider or execute Blender', () => {
    const report = evaluateEp012Readiness();
    expect(report.safety.runpodContacted).toBe(false);
    expect(report.safety.blenderExecuted).toBe(false);
    expect(report.safety.generatedPythonExecuted).toBe(false);
  });

  it('does not modify the purchased-assets workstream', () => {
    expect(purchasedWorkstreamUntouched(repoRoot)).toBe(true);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/purchased-assets'))).toBe(false);
  });

  it('fails closed on security tripwires and documents the gate', () => {
    expect(scanReadinessTripwires()).toEqual([]);
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_BLENDER_EXECUTION_READINESS_GATE_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/BlenderExecutionReadiness.tsx'), 'utf8');
    expect(docs).toContain('TIVVLEJOY_BLENDER_EXECUTION_READINESS_V1');
    expect(docs).toContain('READY_FOR_EXECUTION_AUTHORIZATION');
    expect(ui).toContain('Blender Execution Readiness');
    expect(ui).toContain('AUTHORIZATION NOT ISSUED');
    expect(ui).not.toMatch(/DoodleDash/i);
  });
});
