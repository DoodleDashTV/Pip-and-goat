/**
 * Canonical character and voice locks.
 *
 * These are assertions about *plans*, never edits to assets. No code in this
 * package writes to `production-library/`; the locks exist so that a planner
 * cannot ask a renderer to make Pip a boy, recolour Goat's nose, drop Pip's
 * backpack, deepen a voice, or squash a beak past what the rig approves.
 *
 * Sourced from docs/CHARACTERS/PIP.md and docs/CHARACTERS/GOAT.md plus the
 * approved v1.1 visual sign-off. Changing anything here is a canon change and
 * must go through character approval, not a code review.
 *
 * What is *canon* and what is *this rig* are separate concerns, and they are
 * separated: identity, colour, personality, voice and protected features live
 * here permanently, while channel names, authored actions and deformation limits
 * live in `rig.ts` and are expected to be replaced wholesale when the theatrical
 * assets land. The rig-shaped fields below are re-exported from the prototype rig
 * profiles rather than duplicated, so there is exactly one place to change each
 * fact and today's plans are unchanged by the split.
 */
import { FOUNDING_CODES } from '@doodle-dash/domain';
import type { CharacterCode } from './schema/common';
import type { PlanIssue } from './schema/common';
import { GOAT_PROTOTYPE_RIG, PIP_PROTOTYPE_RIG, defaultRigFor, type RigProfile } from './rig';

export type VoiceLock = {
  /** Permanent voice identity. Never regenerated, never swapped per episode. */
  readonly voiceId: string;
  readonly descriptors: readonly string[];
  /** Pitch band in semitones relative to the character's own reference delivery. */
  readonly pitchRange: { readonly minSemitones: number; readonly maxSemitones: number };
  /** Speaking rate multiplier bounds. Outside these the identity stops reading. */
  readonly rateRange: { readonly min: number; readonly max: number };
  readonly forbidden: readonly string[];
};

export type CharacterLock = {
  readonly characterCode: CharacterCode;
  readonly name: string;
  readonly sex: 'girl' | 'boy';
  readonly species: string;
  readonly agePresentation: 'child';
  readonly role: string;
  readonly bodyColor: string;
  readonly signatureFeatures: readonly string[];
  readonly requiredAccessories: readonly string[];
  readonly personality: readonly string[];
  readonly voice: VoiceLock;
  /**
   * Parts a facial or acting plan may not deform beyond `maxDeformUnit`, a
   * fraction of the part's own scale. Small on purpose: these are the features an
   * audience recognises the character by.
   */
  readonly protectedFeatures: readonly string[];
  /**
   * Deformation ceiling on protected features.
   *
   * A rig property, not a canon one: a better rig deforms a beak further without
   * breaking its silhouette. Mirrored from the character's default rig profile so
   * existing callers keep working, and superseded by `rig.limits` once a shot
   * binds a specific rig.
   */
  readonly maxDeformUnit: number;
  /** Squash/stretch ceiling for the whole character, as a scale multiplier delta. */
  readonly maxSquashStretch: number;
  /**
   * Blend-shape channels the character's default rig exposes.
   *
   * Mirrors `rig.ts`. Prefer resolving channels through `semanticChannel()` on the
   * bound rig profile; this list is the default rig's view of the same data and
   * exists so pre-existing callers do not break.
   */
  readonly facialChannels: readonly string[];
  /** Gesture vocabulary this character performs, by semantic code. */
  readonly gestureCodes: readonly string[];
  /** Actions authored into the approved .blend, usable as base body motion. */
  readonly authoredActions: readonly string[];
  /** Footfall/foley signature — a chick patters, a goat clops. */
  readonly foleySignature: string;
};

export const PIP_LOCK: CharacterLock = {
  characterCode: FOUNDING_CODES.PIP,
  name: 'Pip',
  sex: 'girl',
  species: 'chick',
  agePresentation: 'child',
  role: 'Founding protagonist — explorer',
  bodyColor: 'warm golden-yellow',
  signatureFeatures: [
    'red crest / top feather',
    'orange beak',
    'three-toed orange feet',
    'large expressive eyes with catchlights',
  ],
  requiredAccessories: ['purple backpack'],
  personality: ['curious', 'cheerful', 'kind', 'enthusiastic'],
  voice: {
    voiceId: 'pip_default_v1',
    descriptors: ['youthful', 'bright', 'sweet', 'curious', 'energetic'],
    pitchRange: { minSemitones: -1.5, maxSemitones: 2.5 },
    rateRange: { min: 0.9, max: 1.18 },
    forbidden: ['squeaky', 'shrill', 'adult', 'breathy-whisper', 'gravelly'],
  },
  protectedFeatures: ['beak', 'eyes', 'crest'],
  maxDeformUnit: PIP_PROTOTYPE_RIG.limits.protectedFeatureDeform,
  maxSquashStretch: PIP_PROTOTYPE_RIG.limits.squashStretch,
  facialChannels: PIP_PROTOTYPE_RIG.channels,
  gestureCodes: PIP_PROTOTYPE_RIG.gestureCodes,
  authoredActions: PIP_PROTOTYPE_RIG.authoredActions,
  foleySignature: 'light patter on soil',
};

export const GOAT_LOCK: CharacterLock = {
  characterCode: FOUNDING_CODES.GOAT,
  name: 'Goat',
  sex: 'boy',
  species: 'goat',
  agePresentation: 'child',
  role: 'Founding companion',
  bodyColor: 'warm cream',
  signatureFeatures: ['curled horns', 'pink nose', 'large expressive eyes with catchlights'],
  requiredAccessories: ['collar', 'Goat tag'],
  personality: ['warm', 'playful', 'adventurous'],
  voice: {
    voiceId: 'goat_default_v1',
    descriptors: ['youthful', 'warm', 'playful', 'adventurous'],
    pitchRange: { minSemitones: -2.0, maxSemitones: 1.5 },
    rateRange: { min: 0.88, max: 1.12 },
    forbidden: ['deep', 'babyish', 'growling', 'adult-authoritative'],
  },
  protectedFeatures: ['muzzle', 'horns', 'eyes', 'tag'],
  maxDeformUnit: GOAT_PROTOTYPE_RIG.limits.protectedFeatureDeform,
  maxSquashStretch: GOAT_PROTOTYPE_RIG.limits.squashStretch,
  facialChannels: GOAT_PROTOTYPE_RIG.channels,
  gestureCodes: GOAT_PROTOTYPE_RIG.gestureCodes,
  authoredActions: GOAT_PROTOTYPE_RIG.authoredActions,
  foleySignature: 'cloven hoof clop on soil',
};

export const CHARACTER_LOCKS: Readonly<Record<CharacterCode, CharacterLock>> = {
  [FOUNDING_CODES.PIP]: PIP_LOCK,
  [FOUNDING_CODES.GOAT]: GOAT_LOCK,
};

export const LOCKED_CHARACTER_CODES = Object.keys(CHARACTER_LOCKS).sort() as CharacterCode[];

export function characterLock(characterCode: CharacterCode): CharacterLock {
  const lock = CHARACTER_LOCKS[characterCode];
  if (!lock) {
    throw new Error(`No character lock for ${characterCode}; refusing to plan unlocked characters.`);
  }
  return lock;
}

/** The permanent voice identity for a character. Never derived per episode. */
export function voiceIdFor(characterCode: CharacterCode): string {
  return characterLock(characterCode).voice.voiceId;
}

/**
 * Child-content emotion ceiling.
 *
 * The emotion engine may not exceed these without an explicit policy approval,
 * and the approval is recorded on the blueprint rather than assumed.
 */
export const CHILD_SAFE_POLICY = {
  /** Hard ceiling on any negative-valence emotion intensity. */
  maxNegativeIntensity: 0.55,
  /** Hard ceiling on any emotion intensity at all, positive included. */
  maxIntensity: 0.92,
  /** Emotions that require explicit story approval to appear at all. */
  gatedEmotions: ['angry', 'afraid'] as const,
  /** Emotions no plan may produce for this audience, approved or not. */
  forbiddenEmotions: ['terrified', 'enraged', 'disgusted', 'anguished', 'menacing'] as const,
  /** Minimum seconds a shot must give an emotion to settle, so it never snaps. */
  minSettleSeconds: 0.25,
} as const;

export type LockViolationContext = {
  readonly system: string;
  readonly shotId?: string;
};

/**
 * Assert that a plan does not contradict a character's lock.
 *
 * Returns issues rather than throwing so a caller can collect every violation in
 * one pass and show the director all of them; the blueprint still fails closed
 * because these are all `ERROR`.
 */
export function checkCharacterLock(
  characterCode: CharacterCode,
  claim: {
    readonly sex?: string;
    readonly species?: string;
    readonly agePresentation?: string;
    readonly bodyColor?: string;
    readonly accessoriesRemoved?: readonly string[];
    readonly personality?: readonly string[];
    readonly voiceId?: string;
    readonly deformations?: ReadonlyArray<{ feature: string; amountUnit: number }>;
    readonly facialChannels?: readonly string[];
    readonly squashStretch?: number;
    /**
     * The rig this plan targets.
     *
     * Channel support and deformation ceilings are checked against it rather than
     * against the lock, so a theatrical rig with action-unit controls validates
     * against its own vocabulary instead of the prototype's shape-key names.
     * Defaults to the character's default rig, which is the prototype today, so
     * omitting it reproduces the previous behaviour exactly.
     */
    readonly rig?: RigProfile;
  },
  context: LockViolationContext,
): PlanIssue[] {
  const lock = characterLock(characterCode);
  const rig = claim.rig ?? defaultRigFor(characterCode);
  const issues: PlanIssue[] = [];
  const fail = (code: string, message: string, measured?: PlanIssue['measured']) =>
    issues.push({ code, severity: 'ERROR', system: context.system, message, shotId: context.shotId, characterCode, measured });

  if (claim.sex !== undefined && claim.sex !== lock.sex) {
    fail('CHARACTER_LOCK_SEX', `${lock.name} is a ${lock.sex}; plan claimed "${claim.sex}".`);
  }
  if (claim.species !== undefined && claim.species !== lock.species) {
    fail('CHARACTER_LOCK_SPECIES', `${lock.name} is a ${lock.species}; plan claimed "${claim.species}".`);
  }
  if (claim.agePresentation !== undefined && claim.agePresentation !== lock.agePresentation) {
    fail(
      'CHARACTER_LOCK_AGE',
      `${lock.name} presents as a ${lock.agePresentation}; plan claimed "${claim.agePresentation}".`,
    );
  }
  if (claim.bodyColor !== undefined && claim.bodyColor !== lock.bodyColor) {
    fail('CHARACTER_LOCK_COLOR', `${lock.name} is ${lock.bodyColor}; plan claimed "${claim.bodyColor}".`);
  }
  for (const removed of claim.accessoriesRemoved ?? []) {
    if (lock.requiredAccessories.some((item) => item.toLowerCase().includes(removed.toLowerCase()))) {
      fail('CHARACTER_LOCK_ACCESSORY', `${lock.name} must keep "${removed}"; plan removed it.`);
    }
  }
  for (const trait of claim.personality ?? []) {
    if (!lock.personality.includes(trait)) {
      fail(
        'CHARACTER_LOCK_PERSONALITY',
        `"${trait}" is not part of ${lock.name}'s locked personality (${lock.personality.join(', ')}).`,
      );
    }
  }
  if (claim.voiceId !== undefined && claim.voiceId !== lock.voice.voiceId) {
    fail(
      'VOICE_LOCK_IDENTITY',
      `${lock.name}'s permanent voice is ${lock.voice.voiceId}; plan asked for "${claim.voiceId}".`,
    );
  }
  const deformLimit = rig.limits.protectedFeatureDeform;
  for (const deformation of claim.deformations ?? []) {
    const protectedFeature = lock.protectedFeatures.find((feature) =>
      deformation.feature.toLowerCase().includes(feature.toLowerCase()),
    );
    if (protectedFeature && deformation.amountUnit > deformLimit) {
      fail(
        'CHARACTER_LOCK_DEFORMATION',
        `${lock.name}'s ${protectedFeature} may deform at most ${deformLimit} on rig ${rig.rigId}@${rig.rigVersion}; plan asked for ${deformation.amountUnit}.`,
        { limit: deformLimit, requested: deformation.amountUnit },
      );
    }
  }
  for (const channel of claim.facialChannels ?? []) {
    if (!rig.channels.includes(channel)) {
      fail(
        'FACIAL_CHANNEL_UNSUPPORTED',
        `Rig ${rig.rigId}@${rig.rigVersion} for ${lock.name} has no "${channel}" channel; planning it would deform geometry the rig does not drive.`,
      );
    }
  }
  if (claim.squashStretch !== undefined && Math.abs(claim.squashStretch) > rig.limits.squashStretch) {
    fail(
      'CHARACTER_LOCK_SQUASH',
      `${lock.name} on rig ${rig.rigId} allows ${rig.limits.squashStretch} squash/stretch; plan asked for ${claim.squashStretch}.`,
      { limit: rig.limits.squashStretch, requested: claim.squashStretch },
    );
  }
  return issues;
}
