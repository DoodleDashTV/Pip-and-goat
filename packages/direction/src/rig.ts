/**
 * Rig capability profiles — the implementation side of a character.
 *
 * `locks.ts` holds who a character *is*: Pip is a girl chick, yellow, red crest,
 * orange beak, purple backpack, voice `pip_default_v1`. That never changes. This
 * file holds what the current *rig* can do: which channels exist, what they are
 * called, which controls the rigger built. That is expected to change completely
 * when the prototype assets are replaced by feature-animation rigs.
 *
 * The separation is the point. A planner that asks "does Pip have a `beak_open`
 * shape key" has the prototype rig baked into it and will need rewriting. A
 * planner that asks "which channel is this rig's mouth" keeps working when the
 * answer becomes a FACS action unit named `AU25_lips_part` driven by a facial
 * board. Nothing in the direction layer may name a channel literally; it resolves
 * one through `semanticChannel()` or `visemeChannel()`.
 *
 * The profiles below describe the *prototype* rigs, unchanged, so today's plans
 * are byte-identical. Adding a theatrical rig is adding an entry here and a
 * binding in `assets.ts` — not editing a planner.
 */
import { z } from 'zod';
import { CharacterCodeSchema, NonEmptyStringSchema, UnitScalarSchema, type CharacterCode } from './schema/common';
import { QualityTierSchema } from './quality';

/**
 * How the rig exposes facial performance.
 *
 * The prototype rigs are shape keys driven directly. Feature rigs normally expose
 * action units with correctives behind them, and some expose both. The planner
 * does not care which — it names semantic intents and the profile resolves them —
 * but the render layer does, so the scheme travels with the plan.
 */
export const RIG_CONTROL_SCHEMES = ['SHAPE_KEYS', 'FACS_ACTION_UNITS', 'HYBRID'] as const;
export const RigControlSchemeSchema = z.enum(RIG_CONTROL_SCHEMES);
export type RigControlScheme = z.infer<typeof RigControlSchemeSchema>;

/**
 * Semantic facial intents a planner may ask for.
 *
 * Closed, and deliberately smaller than any real rig's channel list: these are
 * the intents Steps 1–8 plans. A rig with 300 controls maps the ones it needs
 * here and keeps the rest for hand animation.
 */
export const SEMANTIC_FACIAL_CHANNELS = [
  'MOUTH_OPEN',
  'SMILE',
  'BLINK',
  'BROW_UP',
  'BROW_DOWN',
  'BROW_INNER_UP',
  'SQUINT',
  'SIGNATURE',
  'REST',
] as const;
export const SemanticFacialChannelSchema = z.enum(SEMANTIC_FACIAL_CHANNELS);
export type SemanticFacialChannel = z.infer<typeof SemanticFacialChannelSchema>;

/**
 * The structured viseme set. Independent of rig naming and of language.
 *
 * Structured rather than string-typed so coarticulation can reason about
 * neighbours: `M_B_P` closing into `A` is a different blend from `A` into `E`,
 * and a planner cannot know that from a channel name it was handed.
 */
export const VISEMES = ['A', 'E', 'I', 'O', 'U', 'M_B_P', 'F_V', 'L', 'TH', 'REST'] as const;
export const VisemeSchema = z.enum(VISEMES);
export type Viseme = z.infer<typeof VisemeSchema>;

/**
 * What a rig is capable of, as facts a planner can branch on.
 *
 * Every flag is false-by-default in spirit: the prototype rigs set most of them
 * false, and a planner that needs one must check rather than assume. That is what
 * lets the same director drive a rig with foot locking and one without, and
 * report honestly which it got.
 */
export const RigCapabilitySchema = z.object({
  /** FK/IK switching on limbs. */
  ikfk: z.boolean(),
  /** Foot/hoof locking, so a planted foot stays planted through a weight shift. */
  footLock: z.boolean(),
  /** Ground-contact solving against terrain rather than a flat plane. */
  groundContact: z.boolean(),
  /** Volume preservation on squash and stretch. */
  volumePreservation: z.boolean(),
  /** Corrective shape keys driven by pose. */
  correctiveShapeKeys: z.boolean(),
  /** Pose-space deformation corrections. */
  poseSpaceCorrections: z.boolean(),
  /** Eyes that aim independently of the head. */
  independentEyeAim: z.boolean(),
  eyelidControls: z.boolean(),
  browControls: z.boolean(),
  cheekControls: z.boolean(),
  /** Rig-level viseme coarticulation blending, rather than planner-side overlap. */
  coarticulation: z.boolean(),
  /** Groom (fur/feather) that deforms with the surface it grows from. */
  groomDeformation: z.boolean(),
  /** Accessory dynamics — backpack sway, collar and tag swing. */
  accessoryDynamics: z.boolean(),
  /** Rigged secondary motion, as opposed to the planner's frame-lag hints. */
  secondaryMotionRig: z.boolean(),
  /** Named emotion shapes above the channel level. */
  emotionShapes: z.boolean(),
});
export type RigCapability = z.infer<typeof RigCapabilitySchema>;

export const RigProfileSchema = z.object({
  /** Stable rig identity. `pip_prototype` and `pip_theatrical` are different rigs. */
  rigId: NonEmptyStringSchema,
  /** Bumped whenever the rig's channels, actions or limits change. */
  rigVersion: NonEmptyStringSchema,
  characterCode: CharacterCodeSchema,
  controlScheme: RigControlSchemeSchema,
  quality: QualityTierSchema,
  /** Every channel this rig drives, as the render layer names them. */
  channels: z.array(NonEmptyStringSchema).min(1),
  /** Semantic intent → this rig's channel name. */
  semanticChannels: z.record(SemanticFacialChannelSchema, NonEmptyStringSchema),
  /** Structured viseme → this rig's channel name. */
  visemeChannels: z.record(VisemeSchema, NonEmptyStringSchema),
  /** Actions authored into the asset, usable as base body motion. */
  authoredActions: z.array(NonEmptyStringSchema).min(1),
  /** Gesture vocabulary the rig can perform, by semantic code. */
  gestureCodes: z.array(NonEmptyStringSchema).min(1),
  /** Parts that lag the body, with the rig's own naming. */
  overlapParts: z.array(NonEmptyStringSchema).default([]),
  capabilities: RigCapabilitySchema,
  /** Per-rig deformation ceilings. A better rig deforms further without breaking. */
  limits: z.object({
    /** Ceiling on the mouth channel group, as a summed weight. */
    mouthGroupWeight: UnitScalarSchema,
    /** Ceiling on the mouth-open channel specifically. */
    mouthOpen: UnitScalarSchema,
    /** Squash/stretch the rig holds without tearing, as a scale delta. */
    squashStretch: z.number().min(0).max(0.5),
    /** Deformation ceiling on protected features, as a fraction of their scale. */
    protectedFeatureDeform: z.number().min(0).max(1),
  }),
  provenance: z.object({
    author: NonEmptyStringSchema,
    license: NonEmptyStringSchema,
    origin: NonEmptyStringSchema,
  }),
});
export type RigProfile = z.infer<typeof RigProfileSchema>;

const STUDIO_RIG_PROVENANCE = {
  author: 'TivvleJoy Studios',
  license: 'Proprietary — TivvleJoy Studios internal use',
  origin: 'Authored in-house; no third-party rig or character imported',
} as const;

/**
 * Capability set of the prototype rigs.
 *
 * Honest, not aspirational. These rigs are shape keys and a handful of authored
 * actions: no IK, no foot locking, no groom, no accessory dynamics. Recording
 * that truthfully is what lets a planner say "this shot needs foot locking and
 * this rig has none" instead of planning a slide and discovering it in a render.
 */
const PROTOTYPE_CAPABILITIES: RigCapability = {
  ikfk: false,
  footLock: false,
  groundContact: false,
  volumePreservation: false,
  correctiveShapeKeys: false,
  poseSpaceCorrections: false,
  independentEyeAim: false,
  eyelidControls: true,
  browControls: true,
  cheekControls: true,
  coarticulation: false,
  groomDeformation: false,
  accessoryDynamics: false,
  secondaryMotionRig: false,
  emotionShapes: false,
};

const PROTOTYPE_VISEME_CHANNELS: Record<Viseme, string> = {
  A: 'viseme_A',
  E: 'viseme_E',
  I: 'viseme_I',
  O: 'viseme_O',
  U: 'viseme_U',
  M_B_P: 'viseme_M_B_P',
  F_V: 'viseme_F_V',
  L: 'viseme_L',
  TH: 'viseme_TH',
  REST: 'viseme_REST',
};

/**
 * Pip's prototype rig, exactly as the approved .blend exposes it.
 *
 * The channel list, action list and limits are the ones the accepted FINAL_1080P
 * render was planned against. They are reproduced rather than reinterpreted: this
 * profile has to describe the asset that exists, or the regression fixtures stop
 * proving anything.
 */
export const PIP_PROTOTYPE_RIG: RigProfile = RigProfileSchema.parse({
  rigId: 'pip_prototype',
  rigVersion: '1.0.0',
  characterCode: 'CHAR_PIP_001',
  controlScheme: 'SHAPE_KEYS',
  quality: 'PROTOTYPE',
  channels: [
    ...Object.values(PROTOTYPE_VISEME_CHANNELS),
    'blink',
    'brow_up',
    'brow_down',
    'brow_inner_up',
    'smile',
    'beak_open',
    'cheek_puff',
    'squint',
  ],
  semanticChannels: {
    MOUTH_OPEN: 'beak_open',
    SMILE: 'smile',
    BLINK: 'blink',
    BROW_UP: 'brow_up',
    BROW_DOWN: 'brow_down',
    BROW_INNER_UP: 'brow_inner_up',
    SQUINT: 'squint',
    // A chick puffs her cheeks; a goat perks an ear. Same intent, different part.
    SIGNATURE: 'cheek_puff',
    REST: 'viseme_REST',
  },
  visemeChannels: PROTOTYPE_VISEME_CHANNELS,
  authoredActions: ['PIP_IDLE', 'PIP_WALK', 'PIP_RUN', 'PIP_POINT', 'PIP_WAVE', 'PIP_NOD', 'PIP_LOOK'],
  gestureCodes: ['POINT', 'WAVE', 'NOD', 'SHAKE_HEAD', 'LOOK', 'THINK', 'CELEBRATE', 'PICK_UP', 'HOLD'],
  overlapParts: ['crest', 'backpack', 'wing_tips'],
  capabilities: PROTOTYPE_CAPABILITIES,
  limits: { mouthGroupWeight: 1.0, mouthOpen: 0.85, squashStretch: 0.08, protectedFeatureDeform: 0.12 },
  provenance: STUDIO_RIG_PROVENANCE,
});

export const GOAT_PROTOTYPE_RIG: RigProfile = RigProfileSchema.parse({
  rigId: 'goat_prototype',
  rigVersion: '1.0.0',
  characterCode: 'CHAR_GOAT_001',
  controlScheme: 'SHAPE_KEYS',
  quality: 'PROTOTYPE',
  channels: [
    ...Object.values(PROTOTYPE_VISEME_CHANNELS),
    'blink',
    'brow_up',
    'brow_down',
    'brow_inner_up',
    'smile',
    'mouth_open',
    'ear_perk',
    'squint',
  ],
  semanticChannels: {
    MOUTH_OPEN: 'mouth_open',
    SMILE: 'smile',
    BLINK: 'blink',
    BROW_UP: 'brow_up',
    BROW_DOWN: 'brow_down',
    BROW_INNER_UP: 'brow_inner_up',
    SQUINT: 'squint',
    SIGNATURE: 'ear_perk',
    REST: 'viseme_REST',
  },
  visemeChannels: PROTOTYPE_VISEME_CHANNELS,
  authoredActions: ['GOAT_IDLE', 'GOAT_WALK', 'GOAT_RUN', 'GOAT_HEAD_NOD', 'GOAT_LOOK', 'GOAT_EAT'],
  gestureCodes: ['NOD', 'SHAKE_HEAD', 'LOOK', 'LISTEN', 'THINK', 'CELEBRATE', 'PUSH', 'STAND'],
  overlapParts: ['ears', 'tail', 'collar_tag'],
  capabilities: PROTOTYPE_CAPABILITIES,
  limits: { mouthGroupWeight: 1.0, mouthOpen: 0.8, squashStretch: 0.07, protectedFeatureDeform: 0.1 },
  provenance: STUDIO_RIG_PROVENANCE,
});

/**
 * The rig registry, keyed by rig id.
 *
 * Additive: a theatrical rig is a new entry, and the prototype entries stay
 * forever because the regression fixtures reference them by id.
 */
export const RIG_PROFILES: Readonly<Record<string, RigProfile>> = {
  [PIP_PROTOTYPE_RIG.rigId]: PIP_PROTOTYPE_RIG,
  [GOAT_PROTOTYPE_RIG.rigId]: GOAT_PROTOTYPE_RIG,
};

export const RIG_IDS = Object.keys(RIG_PROFILES).sort();

export function rigProfile(rigId: string): RigProfile {
  const profile = RIG_PROFILES[rigId];
  if (!profile) {
    throw new Error(`Unknown rig id "${rigId}"; known rigs are ${RIG_IDS.join(', ')}.`);
  }
  return profile;
}

/**
 * Resolve a semantic intent to this rig's channel name.
 *
 * Throws rather than falling back. A silent fallback here would emit a channel
 * the rig does not drive, which renders as a face that does not move — the exact
 * class of failure that is invisible until someone watches the frames.
 */
export function semanticChannel(rig: RigProfile, intent: SemanticFacialChannel): string {
  const channel = rig.semanticChannels[intent];
  if (!channel) {
    throw new Error(`Rig ${rig.rigId}@${rig.rigVersion} exposes no channel for intent ${intent}.`);
  }
  return channel;
}

export function visemeChannel(rig: RigProfile, viseme: Viseme): string {
  const channel = rig.visemeChannels[viseme];
  if (!channel) {
    throw new Error(`Rig ${rig.rigId}@${rig.rigVersion} exposes no channel for viseme ${viseme}.`);
  }
  return channel;
}

export function rigSupportsChannel(rig: RigProfile, channel: string): boolean {
  return rig.channels.includes(channel);
}

/** Default rig for a character until an asset binding says otherwise. */
export const DEFAULT_RIG_BY_CHARACTER: Readonly<Record<CharacterCode, string>> = {
  CHAR_PIP_001: PIP_PROTOTYPE_RIG.rigId,
  CHAR_GOAT_001: GOAT_PROTOTYPE_RIG.rigId,
};

export function defaultRigFor(characterCode: CharacterCode): RigProfile {
  return rigProfile(DEFAULT_RIG_BY_CHARACTER[characterCode]);
}

/**
 * Capabilities a shot's plan requires, checked against what the bound rig has.
 *
 * Returns the missing capability names. The caller decides severity: a missing
 * `footLock` on a walking shot is a warning against a prototype rig and an error
 * against a theatrical one, because the theatrical standard does not accept a
 * slide and the prototype tranche is not trying to.
 */
export function missingCapabilities(rig: RigProfile, required: readonly (keyof RigCapability)[]): string[] {
  return required.filter((capability) => !rig.capabilities[capability]).sort();
}
