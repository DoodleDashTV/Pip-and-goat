import { compileEp001AnimationBlockingBoard } from '@/lib/tivvlejoy-ep001-animation-blocking-board';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';
import { compileEp001RigHandoffMatrix } from '@/lib/tivvlejoy-ep001-rig-handoff';
import { compileEp001SceneryPullSheet } from '@/lib/tivvlejoy-ep001-scenery-pull-sheet';
import { compileEp001StructuralAnimatic } from '@/lib/tivvlejoy-ep001-structural-animatic';
import { sha256Canonical } from '@/lib/tivvlejoy-nightshift-production';

export const EP001_PRODUCTION_HANDOFF_SCHEMA = 'TIVVLEJOY_EP001_PRODUCTION_HANDOFF_V1' as const;

const EXECUTION_STEPS = [
  {
    stepId: 'EP001_HANDOFF_01',
    department: 'STORY_REVIEW',
    label: 'Record explicit human story approval against the immutable episode package.',
    requires: ['HUMAN_STORY_APPROVAL_REQUIRED'],
  },
  {
    stepId: 'EP001_HANDOFF_02',
    department: 'CHARACTER_INTAKE',
    label: 'Admit hash-verified artist-authored Pip and Goat rigs.',
    requires: ['PIP_APPROVED_RIG_REQUIRED', 'GOAT_APPROVED_RIG_REQUIRED'],
  },
  {
    stepId: 'EP001_HANDOFF_03',
    department: 'SCENERY_INTAKE',
    label: 'Resolve every scenery role to an approved immutable asset.',
    requires: ['APPROVED_SCENERY_BINDINGS_REQUIRED'],
  },
  {
    stepId: 'EP001_HANDOFF_04',
    department: 'VOICE_INTAKE',
    label: 'Bind exact approved Pip and Goat voice receipts to all eight lines.',
    requires: ['EXACT_VOICE_RECEIPTS_REQUIRED'],
  },
  {
    stepId: 'EP001_HANDOFF_05',
    department: 'ANIMATION_BLOCKING',
    label: 'Execute the 80 locked pose cues with real admitted rigs and exact dialogue timing.',
    requires: ['EP001_HANDOFF_02', 'EP001_HANDOFF_04'],
  },
  {
    stepId: 'EP001_HANDOFF_06',
    department: 'SHOT_ASSEMBLY',
    label: 'Assemble all ten shots from approved character, scenery, camera, and audio bindings.',
    requires: ['EP001_HANDOFF_03', 'EP001_HANDOFF_05'],
  },
  {
    stepId: 'EP001_HANDOFF_07',
    department: 'DEFORMATION_AND_CONTACT_QA',
    label: 'Review deformation, contacts, props, accessories, silhouettes, and continuity.',
    requires: ['EP001_HANDOFF_06'],
  },
  {
    stepId: 'EP001_HANDOFF_08',
    department: 'HUMAN_VISUAL_REVIEW',
    label: 'Issue explicit human visual approval from real-rig playblast media.',
    requires: ['HUMAN_VISUAL_APPROVAL_REQUIRED', 'EP001_HANDOFF_07'],
  },
  {
    stepId: 'EP001_HANDOFF_09',
    department: 'PAID_RENDER_AUTHORIZATION',
    label: 'Issue a separate immutable, cost-capped final-render authorization.',
    requires: ['PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED', 'EP001_HANDOFF_08'],
  },
  {
    stepId: 'EP001_HANDOFF_10',
    department: 'CONTROLLED_EXECUTION_PREFLIGHT',
    label: 'Recompute every binding and gate before any launch or Production mutation.',
    requires: ['EP001_HANDOFF_01', 'EP001_HANDOFF_09'],
  },
] as const;

export function compileEp001ProductionHandoff() {
  const episode = compileEp001ProductionPackage();
  const rigHandoff = compileEp001RigHandoffMatrix(episode);
  const scenery = compileEp001SceneryPullSheet(episode);
  const audio = compileEp001AudioCueSheet(episode);
  const blocking = compileEp001AnimationBlockingBoard(episode, audio);
  const animatic = compileEp001StructuralAnimatic(episode, audio, blocking);

  if (
    rigHandoff.productionPackageSha256 !== episode.packageSha256 ||
    scenery.productionPackageSha256 !== episode.packageSha256 ||
    audio.productionPackageSha256 !== episode.packageSha256 ||
    blocking.productionPackageSha256 !== episode.packageSha256 ||
    animatic.productionPackageSha256 !== episode.packageSha256
  ) {
    throw new Error('EP001_HANDOFF_PRODUCTION_PACKAGE_MISMATCH');
  }
  if (
    blocking.audioCueSheetSha256 !== audio.cueSheetSha256 ||
    animatic.audioCueSheetSha256 !== audio.cueSheetSha256 ||
    animatic.animationBlockingBoardSha256 !== blocking.blockingBoardSha256
  ) {
    throw new Error('EP001_HANDOFF_DERIVED_DEPENDENCY_MISMATCH');
  }

  const dependencyGraph = [
    {
      nodeId: 'EP001_PRODUCTION_PACKAGE',
      sha256: episode.packageSha256,
      dependsOn: [],
      state: 'VERIFIED_PLANNING_INPUT',
    },
    {
      nodeId: 'EP001_RIG_HANDOFF_MATRIX',
      sha256: rigHandoff.matrixSha256,
      dependsOn: ['EP001_PRODUCTION_PACKAGE'],
      state: 'VERIFIED_PLANNING_INPUT',
    },
    {
      nodeId: 'EP001_SCENERY_PULL_SHEET',
      sha256: scenery.pullSheetSha256,
      dependsOn: ['EP001_PRODUCTION_PACKAGE'],
      state: 'VERIFIED_PLANNING_INPUT',
    },
    {
      nodeId: 'EP001_AUDIO_CUE_SHEET',
      sha256: audio.cueSheetSha256,
      dependsOn: ['EP001_PRODUCTION_PACKAGE'],
      state: 'VERIFIED_PLANNING_INPUT',
    },
    {
      nodeId: 'EP001_ANIMATION_BLOCKING_BOARD',
      sha256: blocking.blockingBoardSha256,
      dependsOn: ['EP001_PRODUCTION_PACKAGE', 'EP001_AUDIO_CUE_SHEET'],
      state: 'VERIFIED_PLANNING_INPUT',
    },
    {
      nodeId: 'EP001_STRUCTURAL_ANIMATIC',
      sha256: animatic.structuralAnimaticSha256,
      dependsOn: [
        'EP001_PRODUCTION_PACKAGE',
        'EP001_AUDIO_CUE_SHEET',
        'EP001_ANIMATION_BLOCKING_BOARD',
      ],
      state: 'VERIFIED_PLANNING_INPUT',
    },
  ] as const;

  const executionPlan = EXECUTION_STEPS.map((step, index) => ({
    ...step,
    ordinal: index + 1,
    state: 'BLOCKED_PENDING_EXPLICIT_EVIDENCE' as const,
    complete: false as const,
    autoAdvance: false as const,
  }));
  const body = {
    schemaVersion: EP001_PRODUCTION_HANDOFF_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    state: 'PLANNING_HANDOFF_COMPLETE_REAL_EXECUTION_BLOCKED' as const,
    dependencyGraph,
    executionPlan,
    remainingBlockers: episode.readiness.blockers.map((blocker) => ({ ...blocker })),
    metrics: {
      immutablePlanningInputCount: dependencyGraph.length,
      executionStepCount: executionPlan.length,
      blockerCount: episode.readiness.blockers.length,
      shotCount: episode.shots.length,
      dialogueLineCount: episode.dialogue.length,
      characterTrackCount: blocking.metrics.characterTrackCount,
      poseCueCount: blocking.metrics.poseCueCount,
      sfxMarkerCount: audio.metrics.sfxCueCount,
      structuralAnimaticFrames: animatic.renderContract.totalFrames,
    },
    handoffRules: [
      'Recompile and compare every dependency SHA before admitting any real asset or receipt.',
      'Advance only the next blocked step whose exact required evidence has been supplied.',
      'Render the structural animatic locally for timing review; it is never real-rig approval media.',
      'Never infer story, deformation, visual, voice, cost, or Production approval from planning work.',
      'Require a fresh cost-capped authorization immediately before any paid final-render launch.',
      'Keep source assets immutable and write only worker-local derivatives until final approval.',
    ],
    authority: {
      planningHandoffComplete: true as const,
      assetAdmissionGranted: false as const,
      storyApprovalIssued: false as const,
      visualApprovalIssued: false as const,
      voiceProviderCallsAllowed: false as const,
      animationExecutionAllowed: false as const,
      shotAssemblyAllowed: false as const,
      paidComputeAllowed: false as const,
      launchAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      planningDataOnly: true as const,
      realRigBytesIncluded: false as const,
      realSceneryBytesIncluded: false as const,
      audioBytesIncluded: false as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      remoteStorageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, handoffSha256: sha256Canonical(body) };
}

export type Ep001ProductionHandoff = ReturnType<typeof compileEp001ProductionHandoff>;
