import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileCharacterAnimationQualityStandard } from '@/lib/tivvlejoy-character-animation-quality-standard';

export const CHARACTER_MOTION_LIBRARY_CONTRACT_SCHEMA =
  'TIVVLEJOY_CHARACTER_MOTION_LIBRARY_CONTRACT_V1' as const;

const SHARED_MOTIONS = [
  ['IDLE_NEUTRAL', 'Neutral breathing/weight-shift idle with restrained secondary motion.'],
  ['IDLE_ALERT', 'Attentive discovery idle with readable gaze and thought change.'],
  ['WALK_LOOP', 'Clean forward walk cycle with grounded contacts and character-specific rhythm.'],
  ['RUN_LOOP', 'Energetic run cycle with readable weight, flight/contact phases, and stable accessories.'],
  ['TURN_90_LEFT', 'Controlled 90-degree left turn preserving contacts and balance.'],
  ['TURN_90_RIGHT', 'Controlled 90-degree right turn preserving contacts and balance.'],
  ['TURN_180', 'Readable 180-degree turn with anticipation and settle.'],
  ['JUMP_SMALL', 'Small expressive jump with anticipation, takeoff, airborne pose, landing, and settle.'],
  ['STOP_FROM_WALK', 'Natural deceleration and planted stop from walk.'],
  ['STOP_FROM_RUN', 'Natural braking and recovery from run.'],
  ['LOOK_LEFT', 'Head/eye look left with thought-led eye timing.'],
  ['LOOK_RIGHT', 'Head/eye look right with thought-led eye timing.'],
  ['LOOK_UP', 'Readable upward discovery/look pose.'],
  ['LOOK_DOWN', 'Readable downward search/look pose.'],
  ['HAPPY_REACTION', 'Warm happy reaction with facial and body integration.'],
  ['SURPRISED_REACTION', 'Readable surprise with controlled anticipation/overshoot and recovery.'],
  ['CONFUSED_REACTION', 'Curious/confused thought change with eyes, head, and body support.'],
  ['LISTENING', 'Natural listening performance that avoids frozen or random motion.'],
  ['DIALOGUE_NEUTRAL', 'Reusable neutral dialogue body performance layer; no baked final lip-sync.'],
  ['PROP_RECEIVE', 'Receive a small story prop with stable contact and readable focus.'],
  ['PROP_HOLD', 'Hold a small story prop while retaining expressive upper-body performance.'],
  ['PROP_PRESENT', 'Present a small story prop toward camera/partner with clear silhouette.'],
] as const;

const CHARACTER_MOTIONS = {
  PIP: [
    ['WING_POINT_LEFT', 'Point left with wing while preserving shoulder/chest volume and feather silhouette.'],
    ['WING_POINT_RIGHT', 'Point right with wing while preserving shoulder/chest volume and feather silhouette.'],
    ['WING_REACH', 'Reach toward a clue/prop with controlled wing articulation.'],
    ['MAP_CARRY', 'Carry the story map while walking without grip drift or strap/accessory instability.'],
    ['MAP_PRESENT', 'Present/open map with readable wing contact and face visibility.'],
    ['ONE_FOOT_BALANCE', 'One-foot balance preserving planted toe/hallux anatomy and body weight.'],
  ],
  GOAT: [
    ['EAGER_BOUNCE', 'Playful eager bounce with grounded landing and stable collar/tag.'],
    ['HOOF_POINT', 'Stylized hoof/arm pointing gesture with readable silhouette.'],
    ['HEAD_TILT', 'Warm curious head tilt with eye acting and restrained ear/secondary response.'],
    ['MAP_LOOKOVER', 'Lean/look toward a shared map without collision or collar/tag instability.'],
    ['QUICK_HOP', 'Small playful hop with clean hoof contacts and weight recovery.'],
    ['TAIL_WAG_REACTION', 'Restrained happy tail response that supports rather than distracts from acting.'],
  ],
} as const;

export function compileCharacterMotionLibraryContract() {
  const quality = compileCharacterAnimationQualityStandard();

  const buildEntries = (characterId: 'PIP' | 'GOAT') => [
    ...SHARED_MOTIONS.map(([motionId, purpose]) => ({ motionId, purpose, source: 'SHARED_SPEC' as const })),
    ...CHARACTER_MOTIONS[characterId].map(([motionId, purpose]) => ({ motionId, purpose, source: 'CHARACTER_SPECIFIC' as const })),
  ].map((motion, index) => ({
    order: index + 1,
    ...motion,
    exactRigSha256: null,
    actionSha256: null,
    frameRange: null as null | { startFrame: number; endFrame: number; fps: number },
    loopable: ['IDLE_NEUTRAL', 'IDLE_ALERT', 'WALK_LOOP', 'RUN_LOOP', 'DIALOGUE_NEUTRAL'].includes(motion.motionId),
    rootMotionPolicy: motion.motionId.includes('WALK') || motion.motionId.includes('RUN') ? 'EXPLICIT_VARIANT_REQUIRED' as const : 'IN_PLACE_DEFAULT' as const,
    reviewState: 'NOT_AUTHORED_NOT_REVIEWED' as const,
    humanApproved: false as const,
  }));

  const characters = [
    { characterId: 'PIP' as const, displayName: 'Pip / Bird', motions: buildEntries('PIP') },
    { characterId: 'GOAT' as const, displayName: 'Goat', motions: buildEntries('GOAT') },
  ];

  const body = {
    schemaVersion: CHARACTER_MOTION_LIBRARY_CONTRACT_SCHEMA,
    qualityStandardSha256: quality.qualityStandardSha256,
    state: 'LIBRARY_CONTRACT_READY_RIG_BOUND_ACTIONS_NOT_AUTHORED' as const,
    characters,
    bindingRules: [
      'Every motion action must be authored and approved against an exact admitted character rig SHA-256.',
      'A rig topology, control, or deformation change may invalidate library actions and requires compatibility review.',
      'Do not retarget blindly between Pip and Goat or between incompatible rig versions.',
      'Library actions are starting assets, not finished shot acting; episode-specific intent, contact, gaze, timing, and continuity still require review.',
      'Reusable dialogue-body actions never contain final line-specific lip-sync or facial timing.',
      'Prop actions must bind to named attachment points and still receive shot-specific contact review.',
      'Loops must have clean phase continuity, contact continuity, and no accessory pop at the loop boundary.',
      'All approved motions must pass the TivvleJoy animation quality standard before becoming reusable.',
    ],
    publishingRules: [
      'Store approved motion actions by immutable action SHA-256 plus exact rig SHA-256.',
      'Never overwrite a previously approved action in place; corrections create a new version.',
      'Retain preview/playblast and human approval receipts with every approved library action.',
    ],
    metrics: {
      sharedMotionSpecCount: SHARED_MOTIONS.length,
      pipSpecificMotionSpecCount: CHARACTER_MOTIONS.PIP.length,
      goatSpecificMotionSpecCount: CHARACTER_MOTIONS.GOAT.length,
      pipTotalMotionSpecCount: characters[0].motions.length,
      goatTotalMotionSpecCount: characters[1].motions.length,
      authoredMotionCount: 0 as const,
      approvedMotionCount: 0 as const,
    },
    authority: {
      admittedRigsPresent: false as const,
      motionAuthoringAllowed: false as const,
      libraryPublishingAllowed: false as const,
      retargetExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      rigBytesIncluded: false as const,
      animationBytesIncluded: false as const,
      blenderLaunched: false as const,
      keyframesAuthored: false as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, motionLibraryContractSha256: sha256Canonical(body) };
}

export type CharacterMotionLibraryContract = ReturnType<typeof compileCharacterMotionLibraryContract>;
