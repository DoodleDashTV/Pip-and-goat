import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AnimationReleaseGate } from '@/lib/tivvlejoy-ep001-animation-release-gate';
import { compileEp001EvidenceAdmissionBoard } from '@/lib/tivvlejoy-ep001-evidence-admission';

export const EP001_FINAL_RENDER_RELEASE_GATE_SCHEMA =
  'TIVVLEJOY_EP001_FINAL_RENDER_RELEASE_GATE_V1' as const;

export function compileEp001FinalRenderReleaseGate() {
  const animationRelease = compileEp001AnimationReleaseGate();
  const evidence = compileEp001EvidenceAdmissionBoard();

  const gates = [
    {
      gateId: 'FINAL_RENDER_01',
      label: 'Exact Pip rig is admitted and bound to the approved animation review.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_02',
      label: 'Exact Goat rig is admitted and bound to the approved animation review.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_03',
      label: 'Exact approved voice/audio timing receipts exist for every required dialogue line.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_04',
      label: 'Approved scenery bindings, source hashes, license receipts, and visual approval are complete.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_05',
      label: 'All 10 shots pass real-rig playblast, deformation, continuity, caption-safe, and story-readability review.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_06',
      label: 'Animation execution has explicit human release and no unresolved blocking quality gates.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_07',
      label: 'Render worker image identity is pinned to an immutable sha256 digest and runtime preflight passes.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_08',
      label: 'Paid final-render authorization is exact, cost-capped, unexpired, and bound to this handoff.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'FINAL_RENDER_09',
      label: 'Human reviewer explicitly authorizes the final render after every prior gate is satisfied.',
      state: 'BLOCKED' as const,
    },
  ];

  const body = {
    schemaVersion: EP001_FINAL_RENDER_RELEASE_GATE_SCHEMA,
    episodeId: animationRelease.episodeId,
    workingTitle: animationRelease.workingTitle,
    animationReleaseGateSha256: animationRelease.releaseGateSha256,
    evidenceAdmissionBoardSha256: evidence.evidenceBoardSha256,
    state: 'FINAL_RENDER_RELEASE_BLOCKED' as const,
    format: { ...animationRelease.format },
    gates,
    requiredEvidenceClasses: evidence.rows.map((row) => ({
      blockerCode: row.blockerCode,
      label: row.label,
      status: row.status,
      manualGateRequired: row.manualGateRequired,
    })),
    renderContract: {
      targetResolution: '1080x1920' as const,
      aspectRatio: '9:16' as const,
      fps: animationRelease.format.fps,
      totalFrames: animationRelease.format.totalFrames,
      exactWorkerImageDigestRequired: true as const,
      costCeilingRequired: true as const,
      authorizationExpiryRequired: true as const,
      oneExecutionIdentityRequired: true as const,
    },
    releaseRules: [
      'Never launch final render from an unapproved animation or unadmitted rig version.',
      'Never resolve a render gate from filenames; use immutable hashes and exact receipts.',
      'Revalidate authorization expiry and immutable worker image identity immediately before launch.',
      'A cost estimate is not paid authorization; an explicit exact authorization receipt is required.',
      'A Preview or low-resolution proof cannot substitute for the final human visual approval gate.',
      'Do not publish merely because rendering succeeds; final media QA and publishing approval remain separate.',
    ],
    authority: {
      animationReleaseIssued: false as const,
      allEvidenceAdmitted: false as const,
      realPlayblastApproved: false as const,
      immutableWorkerImagePinned: false as const,
      paidFinalRenderAuthorizationPresent: false as const,
      finalRenderLaunchAllowed: false as const,
      productionWritesAllowed: false as const,
      publishingAllowed: false as const,
      humanFinalRenderReleaseIssued: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      renderLaunched: false as const,
      paidComputeStarted: false as const,
      sourceBytesIncluded: false as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, finalRenderGateSha256: sha256Canonical(body) };
}

export type Ep001FinalRenderReleaseGate = ReturnType<typeof compileEp001FinalRenderReleaseGate>;
