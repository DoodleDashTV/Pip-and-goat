import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AnimationBlockingBoard } from '@/lib/tivvlejoy-ep001-animation-blocking-board';
import { compileEp001RigReviewWorksheet } from '@/lib/tivvlejoy-ep001-rig-review-worksheet';

export const EP001_ANIMATION_RELEASE_GATE_SCHEMA =
  'TIVVLEJOY_EP001_ANIMATION_RELEASE_GATE_V1' as const;

export function compileEp001AnimationReleaseGate() {
  const worksheet = compileEp001RigReviewWorksheet();
  const blocking = compileEp001AnimationBlockingBoard();

  const rigRequirements = worksheet.characters.map((character) => ({
    characterId: character.characterId,
    displayName: character.displayName,
    requiredCheckCount: character.rows.length,
    requiredPoseCount: character.requiredTestPoses.length,
    sourceSha256Recorded: false as const,
    allBlockingChecksPass: false as const,
    allRequiredPosesPass: false as const,
    humanVisualApprovalIssued: false as const,
    admittedExactRigVersion: false as const,
    releaseState: 'BLOCKED_AWAITING_APPROVED_EXACT_RIG' as const,
  }));

  const gates = [
    {
      gateId: 'ANIM_RELEASE_01',
      label: 'Pip exact rig is SHA-bound, fully reviewed, human-approved, and admitted.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'ANIM_RELEASE_02',
      label: 'Goat exact rig is SHA-bound, fully reviewed, human-approved, and admitted.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'ANIM_RELEASE_03',
      label: 'All required deformation and character test poses pass for both exact rig versions.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'ANIM_RELEASE_04',
      label: 'Approved voice receipts are bound to exact dialogue timing before facial animation.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'ANIM_RELEASE_05',
      label: 'Foot, hoof, toe, hallux, map, fragment, and flexible-branch contact controls are usable.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'ANIM_RELEASE_06',
      label: 'Identity accessories and shot-to-shot scale, facing, prop, and movement continuity are protected.',
      state: 'BLOCKED' as const,
    },
    {
      gateId: 'ANIM_RELEASE_07',
      label: 'EP001 blocking board remains bound to the approved 1,800-frame / 30 fps package.',
      state: 'PLAN_READY' as const,
    },
    {
      gateId: 'ANIM_RELEASE_08',
      label: 'Human reviewer explicitly authorizes animation execution after every prior gate is satisfied.',
      state: 'BLOCKED' as const,
    },
  ];

  const body = {
    schemaVersion: EP001_ANIMATION_RELEASE_GATE_SCHEMA,
    episodeId: blocking.episodeId,
    workingTitle: blocking.workingTitle,
    rigReviewWorksheetSha256: worksheet.worksheetSha256,
    animationBlockingBoardSha256: blocking.blockingBoardSha256,
    state: 'ANIMATION_RELEASE_BLOCKED' as const,
    format: { ...blocking.format },
    rigRequirements,
    gates,
    plannedExecutionPasses: blocking.executionPasses.map((pass) => ({
      passId: pass.passId,
      label: pass.label,
      releaseState: 'BLOCKED_UNTIL_RELEASE_GATE_PASSES' as const,
    })),
    releaseRules: [
      'Do not bind animation to a filename; bind each character to the exact admitted rig SHA-256.',
      'A new artist rig version invalidates prior rig-specific review evidence until that new SHA is reviewed.',
      'Do not author final beak, mouth, blink, or facial timing until approved voice timing is bound.',
      'Do not start spline polish or secondary motion before stepped blocking receives human visual approval.',
      'Do not launch paid compute merely because the semantic blocking plan is complete.',
      'A technical pass cannot substitute for the final explicit human animation-release decision.',
    ],
    authority: {
      exactRigsAdmitted: false as const,
      exactVoiceTimingBound: false as const,
      blockingExecutionAllowed: false as const,
      animationBakeAllowed: false as const,
      playblastExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      humanAnimationReleaseIssued: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      rigBytesIncluded: false as const,
      audioBytesIncluded: false as const,
      blenderLaunched: false as const,
      keyframesAuthored: false as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, releaseGateSha256: sha256Canonical(body) };
}

export type Ep001AnimationReleaseGate = ReturnType<typeof compileEp001AnimationReleaseGate>;
