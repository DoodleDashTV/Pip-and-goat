import {
  CAPABILITY_FAMILIES,
  GOAT_CAPABILITY_PROFILE,
  GOAT_TEST_POSES,
  PIP_CAPABILITY_PROFILE,
  PIP_TEST_POSES,
  sha256Canonical,
  type ActionId,
  type CapabilityFamily,
  type CapabilitySpec,
} from '@/lib/tivvlejoy-character-animation';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';
import type { Ep001CharacterId } from '@/lib/tivvlejoy-ep001-production-package/types';
import {
  compileRigArrivalChecklist,
  compileRigHandoffPackage,
} from '@/lib/tivvlejoy-real-production-unblock';

export const EP001_RIG_HANDOFF_MATRIX_SCHEMA = 'TIVVLEJOY_EP001_RIG_HANDOFF_MATRIX_V1' as const;

type Ep001Package = ReturnType<typeof compileEp001ProductionPackage>;

type ActionRequirement = {
  requiredCapabilityFamilies: CapabilityFamily[];
  acceptanceEvidence: string;
  supportExpectation: 'REQUIRED' | 'REQUIRED_WITH_ALLOWED_FALLBACK';
};

const LOCOMOTION_FAMILIES: CapabilityFamily[] = [
  'ROOT_MOTION',
  'BODY_CENTER',
  'LEG_LEFT',
  'LEG_RIGHT',
  'FOOT_LEFT',
  'FOOT_RIGHT',
];

const GAZE_FAMILIES: CapabilityFamily[] = ['HEAD', 'EYE_LEFT', 'EYE_RIGHT', 'EYE_AIM'];

const ACTION_REQUIREMENTS = {
  WALK_FORWARD: {
    requiredCapabilityFamilies: LOCOMOTION_FAMILIES,
    acceptanceEvidence: 'Clean walk contact, stable weight transfer, and no visible foot slide.',
    supportExpectation: 'REQUIRED',
  },
  WALK_SLOW: {
    requiredCapabilityFamilies: LOCOMOTION_FAMILIES,
    acceptanceEvidence: 'Slow walk keeps deliberate weight shifts and planted feet readable.',
    supportExpectation: 'REQUIRED',
  },
  WALK_EXCITED: {
    requiredCapabilityFamilies: [...LOCOMOTION_FAMILIES, 'CHEST'],
    acceptanceEvidence:
      'Excited walk preserves foot plants while the chest and body carry extra energy.',
    supportExpectation: 'REQUIRED',
  },
  RUN: {
    requiredCapabilityFamilies: [...LOCOMOTION_FAMILIES, 'CHEST'],
    acceptanceEvidence:
      'Run contact and passing poses hold without sliding or collapsing the silhouette.',
    supportExpectation: 'REQUIRED',
  },
  STOP: {
    requiredCapabilityFamilies: LOCOMOTION_FAMILIES,
    acceptanceEvidence:
      'Character can settle from motion with both feet planted and the root stable.',
    supportExpectation: 'REQUIRED',
  },
  TURN_RIGHT: {
    requiredCapabilityFamilies: LOCOMOTION_FAMILIES,
    acceptanceEvidence: 'Right turn preserves balance, facing direction, and hoof or toe contact.',
    supportExpectation: 'REQUIRED',
  },
  LOOK_LEFT: {
    requiredCapabilityFamilies: GAZE_FAMILIES,
    acceptanceEvidence: 'Eyes and head can aim left without eye drift or mesh collapse.',
    supportExpectation: 'REQUIRED',
  },
  LOOK_RIGHT: {
    requiredCapabilityFamilies: GAZE_FAMILIES,
    acceptanceEvidence: 'Eyes and head can aim right without eye drift or mesh collapse.',
    supportExpectation: 'REQUIRED',
  },
  LOOK_UP: {
    requiredCapabilityFamilies: GAZE_FAMILIES,
    acceptanceEvidence: 'Upward gaze remains readable in the face and does not break the neck.',
    supportExpectation: 'REQUIRED',
  },
  LOOK_DOWN: {
    requiredCapabilityFamilies: GAZE_FAMILIES,
    acceptanceEvidence: 'Downward gaze remains readable in the face and does not break the neck.',
    supportExpectation: 'REQUIRED',
  },
  LOOK_AT_CHARACTER: {
    requiredCapabilityFamilies: GAZE_FAMILIES,
    acceptanceEvidence: 'Eye aim and head follow can hold the scene partner as a stable target.',
    supportExpectation: 'REQUIRED',
  },
  LOOK_AT_PROP: {
    requiredCapabilityFamilies: GAZE_FAMILIES,
    acceptanceEvidence: 'Eye aim and head follow can hold the map or fragment as a stable target.',
    supportExpectation: 'REQUIRED',
  },
  HEAD_TILT: {
    requiredCapabilityFamilies: ['HEAD', 'NECK'],
    acceptanceEvidence: 'Curious head tilt keeps the neck volume and character silhouette intact.',
    supportExpectation: 'REQUIRED',
  },
  HEAD_NOD: {
    requiredCapabilityFamilies: ['HEAD', 'NECK'],
    acceptanceEvidence: 'Head nod has clean neck follow-through and no visible mesh pinching.',
    supportExpectation: 'REQUIRED',
  },
  GOAT_HEAD_BOB: {
    requiredCapabilityFamilies: ['HEAD', 'NECK', 'BODY_CENTER'],
    acceptanceEvidence:
      'Goat head bob can overlap through the neck and body without deformation failure.',
    supportExpectation: 'REQUIRED',
  },
  GOAT_EAR_REACTION: {
    requiredCapabilityFamilies: ['FACE_EXPRESSION'],
    acceptanceEvidence:
      'Ear controls perform the reaction, or the approved face control carries a readable fallback.',
    supportExpectation: 'REQUIRED_WITH_ALLOWED_FALLBACK',
  },
  BEAK_OR_MOUTH_OPEN: {
    requiredCapabilityFamilies: ['MOUTH_OR_BEAK_UPPER', 'MOUTH_OR_BEAK_LOWER'],
    acceptanceEvidence:
      'Open and closed mouth shapes are clean enough for dialogue and do not intersect.',
    supportExpectation: 'REQUIRED',
  },
  POINT: {
    requiredCapabilityFamilies: [
      'ARM_OR_WING_LEFT',
      'ARM_OR_WING_RIGHT',
      'BODY_CENTER',
      'HEAD',
      'EYE_AIM',
    ],
    acceptanceEvidence:
      'Pip can point clearly toward the path while keeping a readable wing silhouette.',
    supportExpectation: 'REQUIRED',
  },
  REACH: {
    requiredCapabilityFamilies: [
      'ARM_OR_WING_LEFT',
      'ARM_OR_WING_RIGHT',
      'BODY_CENTER',
      'PROP_ATTACHMENT_POINTS',
    ],
    acceptanceEvidence:
      'Pip can reach the fragment without collapsing the wing or losing prop alignment.',
    supportExpectation: 'REQUIRED',
  },
  PICK_UP: {
    requiredCapabilityFamilies: [
      'ARM_OR_WING_LEFT',
      'ARM_OR_WING_RIGHT',
      'BODY_CENTER',
      'PROP_ATTACHMENT_POINTS',
    ],
    acceptanceEvidence: 'Map pickup keeps the prop attached and the wing deformation clean.',
    supportExpectation: 'REQUIRED',
  },
  HOLD_PROP: {
    requiredCapabilityFamilies: [
      'ARM_OR_WING_LEFT',
      'ARM_OR_WING_RIGHT',
      'BODY_CENTER',
      'PROP_ATTACHMENT_POINTS',
    ],
    acceptanceEvidence:
      'Pip can carry the map across locomotion without drift, clipping, or accessory collision.',
    supportExpectation: 'REQUIRED',
  },
  PIP_WING_GESTURE_SMALL: {
    requiredCapabilityFamilies: ['ARM_OR_WING_LEFT', 'ARM_OR_WING_RIGHT', 'BODY_CENTER', 'CHEST'],
    acceptanceEvidence:
      'Small wing gesture reads in silhouette without pinching the shoulder or chest.',
    supportExpectation: 'REQUIRED',
  },
  SURPRISE_RECOIL: {
    requiredCapabilityFamilies: ['ROOT_MOTION', 'BODY_CENTER', 'CHEST', 'HEAD'],
    acceptanceEvidence: 'Surprise recoil preserves balance and keeps the face visible to camera.',
    supportExpectation: 'REQUIRED',
  },
  HAPPY_BOUNCE: {
    requiredCapabilityFamilies: [...LOCOMOTION_FAMILIES, 'CHEST'],
    acceptanceEvidence: 'Happy bounce has a clean lift and landing with stable hoof contact.',
    supportExpectation: 'REQUIRED',
  },
} satisfies Partial<Record<ActionId, ActionRequirement>>;

const PIP_REQUIRED_TEST_POSES = [
  'neutral',
  'curious',
  'surprised',
  'beak open',
  'beak closed',
  'look left',
  'look right',
  'wing raised',
  'walk contact',
  'run contact',
  'one-foot balance',
  'map carry',
  'backpack continuity',
] as const satisfies readonly (typeof PIP_TEST_POSES)[number][];

const GOAT_REQUIRED_TEST_POSES = [
  'neutral',
  'happy',
  'confused',
  'surprised',
  'mouth open',
  'look left/right',
  'walk',
  'run',
  'jump',
  'turn',
  'collar/tag stability',
] as const satisfies readonly (typeof GOAT_TEST_POSES)[number][];

function orderedUniqueFamilies(families: readonly CapabilityFamily[]): CapabilityFamily[] {
  const unique = new Set(families);
  return CAPABILITY_FAMILIES.filter((family) => unique.has(family));
}

function actionRequirement(actionId: ActionId, characterId: Ep001CharacterId): ActionRequirement {
  const requirement = ACTION_REQUIREMENTS[actionId as keyof typeof ACTION_REQUIREMENTS];
  if (!requirement) throw new Error(`EP001_RIG_HANDOFF_ACTION_UNMAPPED:${characterId}:${actionId}`);

  const pipFootRequirement =
    characterId === 'PIP' &&
    ['WALK_FORWARD', 'WALK_SLOW', 'WALK_EXCITED', 'RUN', 'STOP', 'TURN_RIGHT'].includes(actionId)
      ? (['TOE_OR_DIGIT_CONTROLS'] satisfies CapabilityFamily[])
      : [];

  return {
    ...requirement,
    requiredCapabilityFamilies: orderedUniqueFamilies([
      ...requirement.requiredCapabilityFamilies,
      ...pipFootRequirement,
    ]),
  };
}

function controlsForFamilies(
  profile: readonly CapabilitySpec[],
  families: readonly CapabilityFamily[],
): CapabilitySpec[] {
  const familySet = new Set(families);
  return profile.filter(
    (control) => control.requirement === 'REQUIRED' && familySet.has(control.family),
  );
}

function compileCharacterMatrix(
  episode: Ep001Package,
  characterId: Ep001CharacterId,
  sourceFiles: ReturnType<typeof compileRigHandoffPackage>['pip'],
) {
  const coverage = new Map<ActionId, Set<string>>();
  for (const shot of episode.shots) {
    const cue = shot.performance[characterId];
    if (!cue) continue;
    for (const actionId of cue.intendedActions) {
      const shotIds = coverage.get(actionId) ?? new Set<string>();
      shotIds.add(shot.shotId);
      coverage.set(actionId, shotIds);
    }
  }

  const actionCoverage = [...coverage].map(([actionId, shotIds]) => ({
    actionId,
    shotIds: [...shotIds],
    ...actionRequirement(actionId, characterId),
  }));
  const profile = characterId === 'PIP' ? PIP_CAPABILITY_PROFILE : GOAT_CAPABILITY_PROFILE;
  const episodeRequiredCapabilityFamilies = orderedUniqueFamilies(
    actionCoverage.flatMap((action) => action.requiredCapabilityFamilies),
  );
  const admissionRequiredControls = profile.filter((control) => control.requirement === 'REQUIRED');
  const episodeRequiredControls = controlsForFamilies(profile, episodeRequiredCapabilityFamilies);
  const preferredEpisodeControls = profile.filter((control) =>
    characterId === 'PIP'
      ? control.controlId === 'PIP.HALLUX'
      : control.controlId === 'GOAT.EAR_LEFT' || control.controlId === 'GOAT.EAR_RIGHT',
  );

  return {
    characterId,
    displayName: characterId === 'PIP' ? ('Pip' as const) : ('Goat' as const),
    status: 'WAITING_FOR_ARTIST_RIG' as const,
    sourceFiles,
    actionCoverage,
    uniqueActionCount: actionCoverage.length,
    episodeRequiredCapabilityFamilies,
    episodeRequiredControls,
    admissionRequiredControls,
    preferredEpisodeControls,
    identityControls: admissionRequiredControls.filter(
      (control) => control.family === 'ACCESSORY_CONTROLS',
    ),
    requiredTestPoses:
      characterId === 'PIP' ? [...PIP_REQUIRED_TEST_POSES] : [...GOAT_REQUIRED_TEST_POSES],
    rigReceived: false as const,
    rigHashVerified: false as const,
    deformationEvidenceReviewed: false as const,
    humanVisualApprovalIssued: false as const,
  };
}

export function compileEp001RigHandoffMatrix(
  episode: Ep001Package = compileEp001ProductionPackage(),
) {
  if (episode.episodeId !== 'EP001') throw new Error('EP001_RIG_HANDOFF_WRONG_EPISODE');
  const sourceHandoff = compileRigHandoffPackage();
  const characters = [
    compileCharacterMatrix(episode, 'PIP', sourceHandoff.pip),
    compileCharacterMatrix(episode, 'GOAT', sourceHandoff.goat),
  ];
  const acceptanceChecklist = compileRigArrivalChecklist();
  const body = {
    schemaVersion: EP001_RIG_HANDOFF_MATRIX_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    productionPackageSha256: episode.packageSha256,
    state: 'WAITING_FOR_PIP_AND_GOAT_RIGS' as const,
    characters,
    acceptanceChecklist,
    deliveryNotes: [
      'Send one canonical Blender source per character; FBX or GLB is optional when the .blend is present.',
      'Pack textures into the Blender source, or include every external texture beside it.',
      'Include stills or a short playblast covering the listed test poses and visible deformation.',
      'Include the Blender version and a short rig version note. File hashes become the immutable identity.',
    ],
    authority: {
      rigAdmissionGranted: false as const,
      humanVisualApprovalIssued: false as const,
      characterAnimationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      semanticRequirementsOnly: true as const,
      rigBytesIncluded: false as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
    },
  };

  return { ...body, matrixSha256: sha256Canonical(body) };
}

export type Ep001RigHandoffMatrix = ReturnType<typeof compileEp001RigHandoffMatrix>;
