import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';

export const TIVVLEJOY_CHARACTER_PRODUCTION_PACKAGE_SCHEMA = 'TIVVLEJOY_CHARACTER_PRODUCTION_PACKAGE_V1' as const;
export type ProductionCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';

type CompanionArtifact = { kind: 'FBX' | 'GLB' | 'TEXTURE_BUNDLE' | 'RIG_README'; sha256: string; byteSize: number; filename: string };
export type CharacterProductionPackageInput = {
  characterId: ProductionCharacterId;
  rigVersionId: string;
  canonicalBlendSha256: string;
  canonicalBlendByteSize: number;
  rigReceiptSha256: string;
  adapterSha256: string;
  adapterReceiptSha256: string;
  validationJobSha256: string;
  validationResultSha256: string;
  inspectionEvidenceBundleSha256: string;
  humanApprovalReceiptSha256: string;
  companions: CompanionArtifact[];
};

const SHA = /^[a-f0-9]{64}$/i;
const UUID = /^[a-f0-9-]{36}$/i;

export function compileCharacterProductionPackage(input: CharacterProductionPackageInput) {
  const errors: string[] = [];
  if (!UUID.test(input.rigVersionId)) errors.push('CHARACTER_PACKAGE_VERSION_ID_INVALID');
  if (!Number.isFinite(input.canonicalBlendByteSize) || input.canonicalBlendByteSize <= 0) errors.push('CHARACTER_PACKAGE_BLEND_SIZE_INVALID');
  for (const [name, value] of Object.entries({
    canonicalBlendSha256: input.canonicalBlendSha256,
    rigReceiptSha256: input.rigReceiptSha256,
    adapterSha256: input.adapterSha256,
    adapterReceiptSha256: input.adapterReceiptSha256,
    validationJobSha256: input.validationJobSha256,
    validationResultSha256: input.validationResultSha256,
    inspectionEvidenceBundleSha256: input.inspectionEvidenceBundleSha256,
    humanApprovalReceiptSha256: input.humanApprovalReceiptSha256,
  })) if (!SHA.test(value)) errors.push(`CHARACTER_PACKAGE_HASH_INVALID:${name}`);
  const seenKinds = new Set<string>();
  for (const artifact of input.companions) {
    if (!artifact.filename.trim()) errors.push(`CHARACTER_PACKAGE_COMPANION_FILENAME_REQUIRED:${artifact.kind}`);
    if (!SHA.test(artifact.sha256)) errors.push(`CHARACTER_PACKAGE_COMPANION_HASH_INVALID:${artifact.kind}`);
    if (!Number.isFinite(artifact.byteSize) || artifact.byteSize <= 0) errors.push(`CHARACTER_PACKAGE_COMPANION_SIZE_INVALID:${artifact.kind}`);
    if (seenKinds.has(artifact.kind)) errors.push(`CHARACTER_PACKAGE_DUPLICATE_COMPANION_KIND:${artifact.kind}`);
    seenKinds.add(artifact.kind);
  }
  for (const required of ['FBX','GLB','RIG_README']) if (!seenKinds.has(required)) errors.push(`CHARACTER_PACKAGE_REQUIRED_COMPANION_MISSING:${required}`);

  const normalized = {
    schemaVersion: TIVVLEJOY_CHARACTER_PRODUCTION_PACKAGE_SCHEMA,
    characterId: input.characterId,
    registryCharacterId: input.characterId,
    displayName: input.characterId === 'CHAR_PIP_001' ? 'Pip' as const : 'Goat' as const,
    rigVersionId: input.rigVersionId,
    canonicalBlendSha256: input.canonicalBlendSha256.toLowerCase(),
    canonicalBlendByteSize: input.canonicalBlendByteSize,
    rigReceiptSha256: input.rigReceiptSha256.toLowerCase(),
    adapterSha256: input.adapterSha256.toLowerCase(),
    adapterReceiptSha256: input.adapterReceiptSha256.toLowerCase(),
    validationJobSha256: input.validationJobSha256.toLowerCase(),
    validationResultSha256: input.validationResultSha256.toLowerCase(),
    inspectionEvidenceBundleSha256: input.inspectionEvidenceBundleSha256.toLowerCase(),
    humanApprovalReceiptSha256: input.humanApprovalReceiptSha256.toLowerCase(),
    companions: [...input.companions].sort((a, b) => a.kind.localeCompare(b.kind)).map((artifact) => ({ ...artifact, sha256: artifact.sha256.toLowerCase() })),
    blenderVersion: '4.2' as const,
    animationFps: 30 as const,
    productionResolution: { width: 1080 as const, height: 1920 as const, aspect: '9:16' as const },
    sourcePolicy: {
      canonicalBlendImmutable: true as const,
      originalArtistDeliveryPreserved: true as const,
      companionArtifactsImmutable: true as const,
      adapterBoundToExactRigHash: true as const,
      approvalBoundToExactPackageIdentity: true as const,
    },
  };
  const packageSha256 = sha256Canonical(normalized);
  return {
    ...normalized,
    structurallyComplete: errors.length === 0,
    errors,
    packageSha256,
    registryCandidate: errors.length === 0 ? {
      characterId: input.characterId,
      packageSha256,
      canonicalBlendSha256: normalized.canonicalBlendSha256,
      adapterSha256: normalized.adapterSha256,
      humanApprovalReceiptSha256: normalized.humanApprovalReceiptSha256,
      state: 'CANDIDATE_READY_FOR_EXPLICIT_ADMISSION' as const,
    } : null,
    authority: {
      registryWritePerformed: false as const,
      episodeAdmissionGranted: false as const,
      productionEnabled: false as const,
      autoAdmissionAllowed: false as const,
    },
  };
}
