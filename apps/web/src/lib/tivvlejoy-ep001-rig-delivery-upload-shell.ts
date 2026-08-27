import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001FoundationImpactMap } from '@/lib/tivvlejoy-ep001-foundation-impact-map';

export const EP001_RIG_DELIVERY_UPLOAD_SHELL_SCHEMA =
  'TIVVLEJOY_EP001_RIG_DELIVERY_UPLOAD_SHELL_V1' as const;

const slots = [
  {
    characterId: 'CHAR_PIP_001' as const,
    displayName: 'Pip',
    triggerId: 'PIP_RIG_ARRIVES' as const,
    preferredExtensions: ['.blend'],
    acceptedCompanionExtensions: ['.fbx', '.glb', '.zip'],
    intakeSurface: '/api/character-source-intake',
    expectedArtifactLabel: 'final corrected production-ready Pip rig delivery',
  },
  {
    characterId: 'CHAR_GOAT_001' as const,
    displayName: 'Goat',
    triggerId: 'GOAT_RIG_ARRIVES' as const,
    preferredExtensions: ['.blend'],
    acceptedCompanionExtensions: ['.fbx', '.glb', '.zip'],
    intakeSurface: '/api/character-source-intake',
    expectedArtifactLabel: 'final corrected production-ready Goat rig delivery',
  },
] as const;

export function compileEp001RigDeliveryUploadShell() {
  const impact = compileEp001FoundationImpactMap();
  const body = {
    schemaVersion: EP001_RIG_DELIVERY_UPLOAD_SHELL_SCHEMA,
    episodeId: 'EP001' as const,
    foundationImpactMapSha256: impact.foundationImpactMapSha256,
    state: 'UPLOAD_SHELL_READY_CORRECTED_RIGS_NOT_PRESENT' as const,
    slots: slots.map((slot) => ({
      ...slot,
      requiredDeliveryMetadata: [
        'exact original filename',
        'exact byte size',
        'SHA-256 calculated from uploaded bytes',
        'artist/version note',
        'delivery timestamp',
      ],
      immutableOriginalRequired: true as const,
      disposableInspectionCopyRequired: true as const,
      uploadState: 'EMPTY' as const,
      sourceSha256: null,
      byteSize: null,
      receiptSha256: null,
      technicalInspectionState: 'NOT_STARTED' as const,
      humanRigApprovalState: 'NOT_ISSUED' as const,
      episodeAdmissionState: 'BLOCKED' as const,
      relatedDecisionIds: impact.inputs.find((item) => item.triggerId === slot.triggerId)?.relatedDecisionIds ?? [],
    })),
    intakeProtocol: [
      'Upload the artist-delivered original bytes without modifying or resaving them first.',
      'Calculate and record SHA-256 from the exact uploaded bytes.',
      'Preserve the original object immutably; all inspection happens on a disposable copy.',
      'A successful upload creates evidence only. It never means the rig passed inspection.',
      'Do not replace an existing delivery silently; a changed file requires a new versioned receipt.',
      'Companion FBX/GLB/ZIP files may be retained, but the canonical production rig is the reviewed .blend unless explicitly re-approved.',
    ],
    postUploadZeroCostQueue: [
      'verify object exists and byte count matches receipt',
      'recalculate SHA-256 and compare to receipt',
      'run static file/container checks',
      'create disposable inspection identity',
      'populate character-specific rig review worksheet',
      'hold Blender/GPU execution until the applicable execution gate permits it',
    ],
    authority: {
      anyRigUploaded: false as const,
      anyRigApproved: false as const,
      anyRigAdmitted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
    safety: {
      uploadPerformedByCompiler: false as const,
      providerCalls: 0 as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };
  return { ...body, rigDeliveryUploadShellSha256: sha256Canonical(body) };
}

export type Ep001RigDeliveryUploadShell = ReturnType<typeof compileEp001RigDeliveryUploadShell>;
