/**
 * Step 28 — Immutable / sealable release manifests.
 *
 * Sealed manifests cannot change. Tampering fails verification.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { stamp, INFRASTRUCTURE_TEST } from './labels';

export const ALLOWED_RELEASE_CLASSES = [
  'INFRASTRUCTURE_TEST',
  'DRAFT_NONCANONICAL',
  'RELEASE_CANDIDATE_BLOCKED',
] as const;
export type AllowedReleaseClass = (typeof ALLOWED_RELEASE_CLASSES)[number];

export const FORBIDDEN_RELEASE_CLASSES = ['PRODUCTION', 'CANONICAL', 'FINAL', 'PUBLISHABLE'] as const;

export type ReleaseManifest = {
  releaseId: string;
  version: number;
  branch: string;
  commit: string;
  dependencyFingerprint: string;
  configFingerprint: string;
  artifactHashes: Record<string, string>;
  testEvidence: string[];
  gateState: { currentStage: string; theatricalAllowed: false; steps9To16Opened: false };
  approvalStatus: 'UNAPPROVED';
  securityStatus: 'INFRASTRUCTURE_TEST';
  provenanceRef: string;
  rollbackTarget: string;
  spendAuthorized: false;
  classification: AllowedReleaseClass;
  sealed: boolean;
  sealHash: string | null;
};

function bodyOf(manifest: ReleaseManifest): Omit<ReleaseManifest, 'sealHash'> {
  const { sealHash: _ignored, ...rest } = manifest;
  return rest;
}

export function createReleaseManifest(input: Omit<ReleaseManifest, 'sealed' | 'sealHash' | 'approvalStatus' | 'securityStatus' | 'spendAuthorized'>): ReleaseManifest {
  if ((FORBIDDEN_RELEASE_CLASSES as readonly string[]).includes(input.classification)) {
    throw new Error('Refuse: forbidden release classification.');
  }
  return {
    ...input,
    approvalStatus: 'UNAPPROVED',
    securityStatus: INFRASTRUCTURE_TEST,
    spendAuthorized: false,
    sealed: false,
    sealHash: null,
  };
}

export function sealRelease(manifest: ReleaseManifest): ReleaseManifest {
  if (manifest.sealed) throw new Error('Refuse: sealed manifest cannot change; create a new version.');
  const sealed: ReleaseManifest = { ...manifest, sealed: true, sealHash: null };
  return {
    ...sealed,
    sealHash: createHash('sha256').update(JSON.stringify(bodyOf(sealed))).digest('hex'),
  };
}

export function nextReleaseVersion(manifest: ReleaseManifest, changes: Partial<ReleaseManifest>): ReleaseManifest {
  return createReleaseManifest({
    releaseId: manifest.releaseId,
    version: manifest.version + 1,
    branch: changes.branch ?? manifest.branch,
    commit: changes.commit ?? manifest.commit,
    dependencyFingerprint: changes.dependencyFingerprint ?? manifest.dependencyFingerprint,
    configFingerprint: changes.configFingerprint ?? manifest.configFingerprint,
    artifactHashes: changes.artifactHashes ?? manifest.artifactHashes,
    testEvidence: changes.testEvidence ?? manifest.testEvidence,
    gateState: manifest.gateState,
    provenanceRef: changes.provenanceRef ?? manifest.provenanceRef,
    rollbackTarget: manifest.commit,
    classification: changes.classification ?? manifest.classification,
  });
}

export function verifyRelease(manifest: ReleaseManifest): { ok: boolean; reason: string } {
  if ((FORBIDDEN_RELEASE_CLASSES as readonly string[]).includes(manifest.classification)) {
    return { ok: false, reason: 'forbidden classification' };
  }
  if (!manifest.sealed || !manifest.sealHash) return { ok: false, reason: 'unsealed' };
  const expected = createHash('sha256').update(JSON.stringify(bodyOf({ ...manifest, sealHash: null }))).digest('hex');
  if (expected !== manifest.sealHash) return { ok: false, reason: 'tamper detected' };
  return { ok: true, reason: 'seal intact' };
}

export function compileImmutableReleaseEvidence(manifest: ReleaseManifest) {
  return stamp({
    releaseId: manifest.releaseId,
    version: manifest.version,
    sealed: manifest.sealed,
    verification: verifyRelease(manifest),
    spendAuthorized: false as const,
    cacheKey: manifest.sealHash ?? 'unsealed',
    versionTag: PREPRODUCTION_SUBSYSTEM_VERSIONS.release,
  });
}
