import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileCharacterMotionLibraryContract } from '@/lib/tivvlejoy-character-motion-library-contract';

export const CHARACTER_EXPRESSION_POSE_LIBRARY_SCHEMA =
  'TIVVLEJOY_CHARACTER_EXPRESSION_POSE_LIBRARY_V1' as const;

const SHARED_EXPRESSIONS = [
  ['NEUTRAL', 'Relaxed neutral face/body baseline with alive eyes and restrained breathing.'],
  ['HAPPY', 'Warm readable smile/brightened eyes without over-stretching facial forms.'],
  ['CURIOUS', 'Thoughtful discovery expression led by eyes, brows/face, and head attitude.'],
  ['SURPRISED', 'Readable surprise with controlled eye/mouth opening and no deformation breakage.'],
  ['CONFUSED', 'Curious confusion with asymmetry, gaze change, and readable thought process.'],
  ['WORRIED', 'Gentle concern appropriate for the audience without harsh fear intensity.'],
  ['DETERMINED', 'Focused adventure-ready expression with clear gaze and stable silhouette.'],
  ['EXCITED', 'High-energy delight that preserves character identity and avoids facial distortion.'],
  ['SAD_SOFT', 'Soft disappointment/sadness with restrained readable performance.'],
  ['RELIEVED', 'Release from tension with natural eye and body settle.'],
  ['BLINK_OPEN', 'Fully open eye baseline for blink cycle reference.'],
  ['BLINK_HALF', 'Mid-blink pose preserving eyelid/eye surface relationship.'],
  ['BLINK_CLOSED', 'Clean closed-eye pose without interpenetration or eyelid collapse.'],
  ['LOOK_LEFT', 'Eye-led left gaze pose without cross-eye drift.'],
  ['LOOK_RIGHT', 'Eye-led right gaze pose without cross-eye drift.'],
  ['LOOK_UP', 'Eye-led upward gaze pose with appropriate head support.'],
  ['LOOK_DOWN', 'Eye-led downward gaze pose with appropriate head support.'],
] as const;

const DIALOGUE_SHAPES = [
  ['REST', 'Closed/neutral speech rest pose.'],
  ['OPEN', 'General open vowel shape for broad dialogue coverage.'],
  ['WIDE', 'Wide vowel/smile-compatible speech shape.'],
  ['ROUND', 'Rounded vowel shape.'],
  ['NARROW', 'Narrow/forward consonant-vowel transition shape.'],
  ['LABIAL', 'Closed-lip contact shape for M/B/P-like moments.'],
  ['TEETH', 'Teeth/lip contact family for F/V-like moments where rig design supports it.'],
] as const;

const CHARACTER_RULES = {
  PIP: [
    'Pip beak open/closed dialogue shapes must preserve upper/lower beak alignment and face silhouette.',
    'Blink poses must preserve eye identity and avoid eyelid clipping into the eyeball.',
    'Crest feathers, scarf, backpack straps, and wing roots must remain visually coherent with head/body acting.',
    'Expression intensity must remain bright, curious, and age-appropriate rather than babyish or uncanny.',
  ],
  GOAT: [
    'Goat mouth/jaw shapes must preserve muzzle volume and avoid jaw detachment or rubbery stretching.',
    'Eye/gaze poses must retain the warm playful expression and avoid dead-eye or cross-eye artifacts.',
    'Horns, ears, collar, and round tag must remain stable during facial/head performance.',
    'Expression intensity must stay warm and playful without becoming aggressive or frightening.',
  ],
} as const;

export function compileCharacterExpressionPoseLibrary() {
  const motionLibrary = compileCharacterMotionLibraryContract();

  const characters = (['PIP', 'GOAT'] as const).map((characterId) => ({
    characterId,
    displayName: characterId === 'PIP' ? 'Pip / Bird' : 'Goat',
    exactRigSha256: null,
    expressions: SHARED_EXPRESSIONS.map(([poseId, purpose], index) => ({
      order: index + 1,
      poseId,
      purpose,
      poseSha256: null,
      reviewState: 'NOT_AUTHORED_NOT_REVIEWED' as const,
      humanApproved: false as const,
    })),
    dialogueShapes: DIALOGUE_SHAPES.map(([shapeId, purpose], index) => ({
      order: index + 1,
      shapeId,
      purpose,
      rigControlBinding: null,
      poseSha256: null,
      reviewState: 'NOT_AUTHORED_NOT_REVIEWED' as const,
      humanApproved: false as const,
    })),
    characterRules: [...CHARACTER_RULES[characterId]],
  }));

  const body = {
    schemaVersion: CHARACTER_EXPRESSION_POSE_LIBRARY_SCHEMA,
    motionLibraryContractSha256: motionLibrary.motionLibraryContractSha256,
    state: 'EXPRESSION_LIBRARY_SPEC_READY_RIG_BOUND_POSES_NOT_AUTHORED' as const,
    characters,
    bindingRules: [
      'Every expression and dialogue pose must bind to the exact admitted character rig SHA-256.',
      'Pose names are semantic identities only; they do not imply a specific bone, shape key, or facial-control implementation.',
      'Rig control bindings are recorded only after the real rig is inspected and admitted.',
      'A rig version change requires compatibility review before any prior facial pose may be reused.',
      'Final lip-sync must use exact approved audio timing and line-specific acting; reusable shapes never constitute final dialogue animation.',
      'Every pose must pass deformation, silhouette, identity, and human visual review before reusable approval.',
      'Corrected poses create new immutable pose versions rather than overwriting previously approved identities.',
    ],
    qualityChecks: [
      'No mesh tearing, clipping, inversion, or visible facial-control instability.',
      'Eyes remain alive, correctly aimed, and consistent with the intended thought/emotion.',
      'Blink open/half/closed states interpolate cleanly without eyeball exposure artifacts.',
      'Dialogue shapes preserve character identity at readable 9:16 framing distances.',
      'Expression transitions avoid pops, mechanical symmetry, and frozen holds.',
      'Accessories and identity features remain stable through head and facial motion.',
      'Human reviewer confirms appeal, readability, and age-appropriate emotional intensity.',
    ],
    metrics: {
      characterCount: characters.length,
      expressionSpecCountPerCharacter: SHARED_EXPRESSIONS.length,
      dialogueShapeSpecCountPerCharacter: DIALOGUE_SHAPES.length,
      totalPlannedReusablePoses: characters.length * (SHARED_EXPRESSIONS.length + DIALOGUE_SHAPES.length),
      authoredPoseCount: 0 as const,
      approvedPoseCount: 0 as const,
    },
    authority: {
      admittedRigsPresent: false as const,
      poseAuthoringAllowed: false as const,
      facialRigBindingAllowed: false as const,
      finalLipSyncAllowed: false as const,
      libraryPublishingAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      rigBytesIncluded: false as const,
      poseBytesIncluded: false as const,
      audioBytesIncluded: false as const,
      blenderLaunched: false as const,
      keyframesAuthored: false as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, expressionPoseLibrarySha256: sha256Canonical(body) };
}

export type CharacterExpressionPoseLibrary = ReturnType<typeof compileCharacterExpressionPoseLibrary>;
