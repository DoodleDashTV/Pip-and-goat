import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001SceneryPullSheet } from '@/lib/tivvlejoy-ep001-scenery-pull-sheet';

export const EP001_SCENERY_ADMISSION_READINESS_SCHEMA =
  'TIVVLEJOY_EP001_SCENERY_ADMISSION_READINESS_V1' as const;

export function compileEp001SceneryAdmissionReadiness() {
  const pullSheet = compileEp001SceneryPullSheet();
  const slots = pullSheet.locations.flatMap((location) =>
    location.requiredRoles.map((role) => ({
      slotId: role.slotId,
      locationId: location.locationId,
      semanticRole: role.semanticRole,
      qualityTier: role.qualityTier,
      providerRequirement: role.providerRequirement,
      selectedAssetId: null,
      selectedAssetVersion: null,
      sourceSha256: null,
      exactByteSize: null,
      licenseReceiptSha256: null,
      inspectionReceiptSha256: null,
      humanApprovalReceiptSha256: null,
      state: 'UNRESOLVED_REAL_SOURCE_REQUIRED' as const,
    })),
  );

  const body = {
    schemaVersion: EP001_SCENERY_ADMISSION_READINESS_SCHEMA,
    episodeId: pullSheet.episodeId,
    workingTitle: pullSheet.workingTitle,
    sceneryPullSheetSha256: pullSheet.pullSheetSha256,
    state: 'ADMISSION_PACKET_READY_REAL_BINDINGS_UNRESOLVED' as const,
    slots,
    storyProps: ['STORY_MAP', 'MAP_FRAGMENT'].map((propId) => ({
      propId,
      sourceSha256: null,
      exactByteSize: null,
      provenanceReceiptSha256: null,
      humanApprovalReceiptSha256: null,
      state: 'UNRESOLVED_APPROVED_STORY_PROP_REQUIRED' as const,
    })),
    admissionOrder: [
      'Resolve each semantic slot to an approved purchased-library asset or explicitly reviewed native derivative allowed by the pull sheet.',
      'Record exact source version, exact byte size, and SHA-256; filenames are not source identity.',
      'Verify commercial-use license/provenance receipt for every purchased source before admission.',
      'Inspect materials, geometry, scale, dependencies, and import integrity without modifying the preserved source.',
      'Bind STORY_MAP and MAP_FRAGMENT to immutable approved source identities.',
      'Assemble the two EP001 base locations once and reuse their approved bases across the ten shots.',
      'Run all ten scenery quality gates at 1080x1920 framing, including caption-safe, silhouette, map readability, depth, palette, path/clearance, dressing, continuity, and provenance checks.',
      'Human-review the exact binding manifest before scenery evidence can enter the admission board.',
    ],
    failureRules: [
      'Missing hash, byte size, license/provenance, inspection, or human approval blocks the exact slot.',
      'A changed source version creates a new immutable identity and requires reinspection.',
      'Planning coverage or a purchased filename does not count as an approved production binding.',
      'Native/procedural substitutions are allowed only where the pull-sheet provider requirement permits them and after human review.',
      'Scenery approval does not imply character clearance; final scale/path clearance must still be verified against the admitted Pip and Goat rigs.',
    ],
    metrics: {
      locationCount: pullSheet.metrics.locationCount,
      shotCount: pullSheet.metrics.shotCount,
      semanticSlotCount: slots.length,
      uniqueRequiredRoleCount: pullSheet.metrics.uniqueRequiredRoleCount,
      storyPropCount: 2 as const,
      resolvedSlotCount: 0 as const,
      approvedSlotCount: 0 as const,
    },
    authority: {
      realBindingsPresent: false as const,
      bindingManifestApproved: false as const,
      sceneryAdmissionGranted: false as const,
      blenderAssemblyAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      commercialSourceBytesRead: 0 as const,
      blenderExecuted: false as const,
      paidRequests: 0 as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };
  return { ...body, sceneryAdmissionReadinessSha256: sha256Canonical(body) };
}

export type Ep001SceneryAdmissionReadiness = ReturnType<typeof compileEp001SceneryAdmissionReadiness>;
