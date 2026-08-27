import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001DialoguePerformanceTiming } from '@/lib/tivvlejoy-ep001-dialogue-performance-timing';

export const CHARACTER_ANIMATION_QUALITY_STANDARD_SCHEMA =
  'TIVVLEJOY_CHARACTER_ANIMATION_QUALITY_STANDARD_V1' as const;

const PILLARS = [
  ['POSE_APPEAL', 'Every key pose has a readable silhouette, clear line of action, intentional asymmetry, and character-specific appeal.'],
  ['TIMING_SPACING', 'Timing and spacing communicate thought, weight, energy, and age; motion never defaults to uniform robotic interpolation.'],
  ['ARCS_PATHS', 'Heads, hands/wings, feet/hooves, props, and body masses travel on clean intentional arcs unless a deliberate mechanical action requires otherwise.'],
  ['ANTICIPATION_SETTLE', 'Major actions have appropriate anticipation, overshoot, follow-through, settle, and holds without unnecessary motion.'],
  ['WEIGHT_BALANCE', 'Center of mass, balance, planted contacts, impact, acceleration, braking, and recovery feel believable for the character.'],
  ['CONTACT_FIDELITY', 'Feet, hooves, toes, hallux, hands/wings, and props do not visibly slide, float, penetrate, detach, or change grip unintentionally.'],
  ['FACIAL_PERFORMANCE', 'Eyes, brows/face, lids, beak/jaw, expressions, and dialogue shapes support the thought and never read as mechanical mouth-flapping.'],
  ['GAZE_THOUGHT', 'Eye direction leads or supports thought, interaction, discovery, and reaction; gaze targets remain stable and intentional.'],
  ['SECONDARY_MOTION', 'Ears, wings, scarf, backpack, straps, tag, tail, crest, and other secondary elements support the primary action without noise.'],
  ['IDENTITY_PRESERVATION', 'Animation never breaks approved proportions, characteristic silhouette, accessory identity, or character-specific anatomy.'],
  ['SHOT_CONTINUITY', 'Facing, scale, screen direction, prop state, contact state, pose intent, and emotional continuity remain coherent across cuts.'],
  ['VERTICAL_READABILITY', 'Critical acting, faces, props, and action remain immediately readable in the 9:16 composition and caption-safe layout.'],
] as const;

export function compileCharacterAnimationQualityStandard() {
  const dialogueTiming = compileEp001DialoguePerformanceTiming();

  const pillars = PILLARS.map(([pillarId, acceptanceStandard], index) => ({
    order: index + 1,
    pillarId,
    acceptanceStandard,
    defaultState: 'NOT_REVIEWED' as const,
    humanReviewRequired: true as const,
    autoApprovalAllowed: false as const,
  }));

  const characterRules = {
    PIP: [
      'Wing acting must read as expressive arms while preserving feather layering and shoulder/chest volume.',
      'Beak dialogue must remain readable without chatter, mesh intersection, or disconnected upper/lower motion.',
      'Feet, toes, and rear hallux must support convincing planted contacts and one-foot balance.',
      'Scarf, backpack, both backpack straps, crest feathers, and copper accessory must remain stable and intentional.',
      'Map holding must preserve a clear grip/contact relationship while allowing readable wing gestures.',
    ],
    GOAT: [
      'Leg and hoof contacts must communicate weight and avoid skating during walks, runs, turns, jumps, and stops.',
      'Jaw/mouth dialogue must support speech and expression without mechanical open-close motion.',
      'Eye acting and head/ear behavior must support his warm, playful personality without random secondary motion.',
      'Horns, collar, round tag, and tail must remain stable, readable, and free of distracting clipping.',
      'Body mechanics must preserve the approved upright stylized design while still feeling grounded and energetic.',
    ],
  } as const;

  const reviewPasses = [
    ['PASS_01_STEPPED', 'Review storytelling, staging, silhouettes, poses, timing intent, contacts, and eye lines in stepped blocking.'],
    ['PASS_02_SPLINE', 'Review arcs, spacing, weight, overlap, settles, contacts, and removal of interpolation artifacts.'],
    ['PASS_03_FACIAL', 'Review dialogue, blinks, gaze, expressions, thought changes, and facial/body performance integration.'],
    ['PASS_04_SECONDARY', 'Review wings/ears/scarf/backpack/tag/tail/crest/props for purposeful overlap and stability.'],
    ['PASS_05_SHOT_QA', 'Review every shot at delivery framing for continuity, 9:16 readability, caption-safe action, and visual defects.'],
    ['PASS_06_SEQUENCE_QA', 'Review the full episode at speed for rhythm, character consistency, emotional continuity, and distracting repeated motion.'],
  ] as const;

  const rejectionTriggers = [
    'Stiff, robotic, floaty, or uniformly eased motion that obscures weight or intent.',
    'Unclear silhouettes, accidental tangencies, weak posing, or poses that do not communicate the story beat.',
    'Foot/hoof/toe/prop sliding, visible penetration, grip drift, popping, or unstable constraints.',
    'Broken arcs, uncontrolled IK/FK pops, sudden volume collapse, or deformation that changes character identity.',
    'Mechanical lip-sync, dead eyes, excessive blinking, gaze drift, or expression/body acting that contradicts the line.',
    'Secondary motion that distracts from the face/story, clips visibly, or behaves independently of the primary action.',
    'Continuity errors in facing, scale, prop state, accessory state, emotional state, or screen direction across shots.',
    'Critical action or facial performance obscured by vertical framing, captions, crop, or excessive background competition.',
  ];

  const body = {
    schemaVersion: CHARACTER_ANIMATION_QUALITY_STANDARD_SCHEMA,
    state: 'QUALITY_STANDARD_LOCKED_EXECUTION_NOT_AUTHORIZED' as const,
    dialogueTimingManifestSha256: dialogueTiming.timingManifestSha256,
    target: {
      style: 'HIGH_QUALITY_STYLIZED_CHILDRENS_CGI' as const,
      qualityIntent: 'EXPRESSIVE_FILM_QUALITY_NOT_BASIC_AUTORIG_ANIMATION' as const,
      primaryDelivery: { width: 1080 as const, height: 1920 as const, aspectRatio: '9:16' as const, fps: 30 as const },
    },
    pillars,
    characterRules,
    reviewPasses: reviewPasses.map(([passId, purpose]) => ({ passId, purpose, state: 'NOT_STARTED' as const, humanApprovalRequired: true as const })),
    rejectionTriggers,
    approvalRule: 'Animation is accepted only after the exact reviewed sequence passes all applicable pillars and an explicit human visual approval is issued.' as const,
    authority: {
      animationExecutionAllowed: false as const,
      rigAdmissionAllowed: false as const,
      facialAnimationAllowed: false as const,
      finalAnimationApprovalIssued: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      animationBytesIncluded: false as const,
      rigBytesIncluded: false as const,
      blenderLaunched: false as const,
      keyframesAuthored: false as const,
      paidRequests: 0 as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, qualityStandardSha256: sha256Canonical(body) };
}

export type CharacterAnimationQualityStandard = ReturnType<typeof compileCharacterAnimationQualityStandard>;
