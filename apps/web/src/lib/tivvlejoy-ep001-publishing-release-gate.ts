import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001FinalRenderReleaseGate } from '@/lib/tivvlejoy-ep001-final-render-release-gate';

export const EP001_PUBLISHING_RELEASE_GATE_SCHEMA =
  'TIVVLEJOY_EP001_PUBLISHING_RELEASE_GATE_V1' as const;

export function compileEp001PublishingReleaseGate() {
  const renderRelease = compileEp001FinalRenderReleaseGate();

  const mediaChecks = [
    ['MEDIA_QA_01', 'Final encoded video has an immutable SHA-256 and is bound to the approved final render.'],
    ['MEDIA_QA_02', 'Video is exactly 1080x1920, 9:16, 30 fps, and 1,800 frames / 60.000 seconds.'],
    ['MEDIA_QA_03', 'Final audio is present, synchronized, intelligible, and free of truncation or missing dialogue.'],
    ['MEDIA_QA_04', 'Full decode finds no black, missing, corrupt, duplicated, or truncated frames.'],
    ['MEDIA_QA_05', 'Color, exposure, character identity, scenery, and visible render quality pass final human review.'],
    ['MEDIA_QA_06', 'Text, captions, and important action remain inside the approved title/caption-safe composition.'],
    ['MEDIA_QA_07', 'Poster/cover/thumbnail candidate is reviewed and bound to the exact final media version.'],
    ['MEDIA_QA_08', 'Platform metadata and audience-setting checklist are reviewed before any upload.'],
    ['MEDIA_QA_09', 'Human reviewer explicitly approves the exact final encoded media for publishing.'],
  ] as const;

  const destinations = [
    { destinationId: 'YOUTUBE_SHORTS', label: 'YouTube Shorts', selected: false as const, uploadAuthorized: false as const },
    { destinationId: 'TIKTOK', label: 'TikTok', selected: false as const, uploadAuthorized: false as const },
    { destinationId: 'INSTAGRAM_REELS', label: 'Instagram Reels', selected: false as const, uploadAuthorized: false as const },
  ];

  const body = {
    schemaVersion: EP001_PUBLISHING_RELEASE_GATE_SCHEMA,
    episodeId: renderRelease.episodeId,
    workingTitle: renderRelease.workingTitle,
    finalRenderReleaseGateSha256: renderRelease.finalRenderGateSha256,
    state: 'PUBLISHING_RELEASE_BLOCKED' as const,
    finalMediaIdentity: {
      encodedMediaSha256: null,
      encodedByteSize: null,
      finalRenderReceiptSha256: null,
      mediaQaReceiptSha256: null,
      humanPublishingApprovalReceiptSha256: null,
    },
    deliverySpec: {
      width: 1080 as const,
      height: 1920 as const,
      aspectRatio: '9:16' as const,
      fps: 30 as const,
      totalFrames: 1800 as const,
      durationSeconds: 60 as const,
      audioRequired: true as const,
    },
    mediaChecks: mediaChecks.map(([checkId, label]) => ({
      checkId,
      label,
      state: 'NOT_REVIEWED' as const,
      evidenceRef: null,
      humanGateRequired: true as const,
    })),
    destinations,
    metadataPackage: {
      title: null,
      description: null,
      caption: null,
      hashtags: [] as string[],
      coverFrameOrImageSha256: null,
      audienceSettingsReviewed: false as const,
      platformPolicyChecklistReviewed: false as const,
      scheduledPublishAt: null,
    },
    releaseRules: [
      'Rendering success alone cannot authorize publishing.',
      'Publishing review must bind to the exact encoded media SHA-256, not a filename.',
      'A re-encode creates a new media identity and requires media QA to be repeated for that new hash.',
      'No publishing destination may be selected or uploaded automatically.',
      'Audience and platform settings must be reviewed by a human before upload.',
      'No publish date or time is inferred or scheduled without explicit instruction.',
      'Each platform upload requires a separate explicit authorization at execution time.',
    ],
    authority: {
      finalRenderCompleted: false as const,
      finalMediaPresent: false as const,
      mediaQaPassed: false as const,
      humanPublishingApprovalIssued: false as const,
      destinationSelected: false as const,
      uploadAuthorized: false as const,
      uploadAllowed: false as const,
      scheduledPublishingAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      mediaBytesIncluded: false as const,
      uploadAttempted: false as const,
      networkCalls: 0 as const,
      externalPostsCreated: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, publishingGateSha256: sha256Canonical(body) };
}

export type Ep001PublishingReleaseGate = ReturnType<typeof compileEp001PublishingReleaseGate>;
