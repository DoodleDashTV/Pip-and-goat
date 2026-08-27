import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001PublishingReleaseGate } from '@/lib/tivvlejoy-ep001-publishing-release-gate';

export const EP001_DELIVERY_ARCHIVE_MANIFEST_SCHEMA =
  'TIVVLEJOY_EP001_DELIVERY_ARCHIVE_MANIFEST_V1' as const;

export function compileEp001DeliveryArchiveManifest() {
  const publishing = compileEp001PublishingReleaseGate();

  const artifacts = [
    ['PIP_RIG', 'Canonical approved Pip Blender rig', '.blend'],
    ['GOAT_RIG', 'Canonical approved Goat Blender rig', '.blend'],
    ['SCENERY_BINDINGS', 'Approved scenery binding manifest', '.json'],
    ['VOICE_PACKAGE', 'Approved dialogue/audio receipt package', '.json'],
    ['ANIMATION_PACKAGE', 'Approved Episode 1 animation source/package', '.blend'],
    ['FINAL_RENDER_RECEIPT', 'Final render execution and provenance receipt', '.json'],
    ['FINAL_MEDIA', 'Approved final encoded Episode 1 media', '.mp4'],
    ['MEDIA_QA_RECEIPT', 'Final media technical and human QA receipt', '.json'],
    ['PUBLISHING_METADATA', 'Approved platform metadata package', '.json'],
    ['COVER_ART', 'Approved final-media cover/poster artifact', 'image'],
  ] as const;

  const body = {
    schemaVersion: EP001_DELIVERY_ARCHIVE_MANIFEST_SCHEMA,
    episodeId: publishing.episodeId,
    workingTitle: publishing.workingTitle,
    publishingReleaseGateSha256: publishing.publishingGateSha256,
    state: 'ARCHIVE_TEMPLATE_READY_REAL_DELIVERY_ARTIFACTS_NOT_PRESENT' as const,
    archiveIdentity: {
      archiveSha256: null,
      createdAt: null,
      completedBy: null,
      immutableAfterCompletion: true as const,
    },
    artifacts: artifacts.map(([artifactId, label, expectedType]) => ({
      artifactId,
      label,
      expectedType,
      artifactSha256: null,
      byteSize: null,
      provenanceReceiptSha256: null,
      present: false as const,
      humanApproved: false as const,
    })),
    preservationRules: [
      'Preserve canonical artist and production sources; archive derivatives separately.',
      'Every archived artifact must have a reproducible SHA-256 and exact byte size.',
      'Never replace an archived artifact in place; a changed artifact becomes a new immutable version.',
      'Bind final media, QA, publishing metadata, and cover art to the same approved delivery identity.',
      'Retain source provenance and approval receipts with the episode archive.',
      'Archive completion does not itself authorize publishing or Production mutation.',
    ],
    restoreChecklist: [
      'Verify every stored SHA-256 before use.',
      'Confirm both canonical character rigs open with required dependencies intact.',
      'Confirm final media decodes to the locked delivery spec.',
      'Confirm approval/provenance receipts remain bound to the restored artifact hashes.',
      'Treat any modified restored artifact as a new version requiring re-review.',
    ],
    authority: {
      realArtifactsPresent: false as const,
      archiveComplete: false as const,
      archiveWriteAllowed: false as const,
      publishingAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      sourceBytesIncluded: false as const,
      archiveCreated: false as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      externalPostsCreated: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, archiveManifestSha256: sha256Canonical(body) };
}

export type Ep001DeliveryArchiveManifest = ReturnType<typeof compileEp001DeliveryArchiveManifest>;
