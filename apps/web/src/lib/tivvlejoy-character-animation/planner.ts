import { identityAccessories } from './accessories';
import { resolveCharacterAction } from './action-resolver';
import { evaluateRigAdmission, type AdmissionInput } from './admission';
import { buildBlinkPlan } from './blink';
import { buildBodyActingPlan } from './body-acting';
import { buildAnimationClipPlan, defaultActionsForBeat } from './clip-plan';
import { buildContactPlan } from './contact';
import { buildDialogueTiming, type DialogueTimingPlan } from './dialogue';
import { buildGazePlan } from './gaze';
import { intentFromBeat } from './intent';
import { buildLocomotionPlan, classifyLocomotion } from './locomotion';
import { buildShotAnimationManifest, type ShotAnimationManifest } from './manifest';
import { buildPropInteraction } from './props';
import { sha256Canonical } from './hash';
import { buildVisemePlan } from './viseme';
import type { CharacterRigContract } from './rig-contract';
import type { ActionId } from './types';

export type ShotAnimationPlan = {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  admitted: boolean;
  synthetic: boolean;
  speaking: boolean;
  locomotionClass: ReturnType<typeof classifyLocomotion>;
  intent: ReturnType<typeof intentFromBeat>;
  timing: DialogueTimingPlan;
  viseme: ReturnType<typeof buildVisemePlan>;
  blink: ReturnType<typeof buildBlinkPlan>;
  gaze: ReturnType<typeof buildGazePlan>;
  body: ReturnType<typeof buildBodyActingPlan>;
  locomotion: ReturnType<typeof buildLocomotionPlan>;
  contact: ReturnType<typeof buildContactPlan>;
  props: ReturnType<typeof buildPropInteraction>;
  clip: ReturnType<typeof buildAnimationClipPlan>;
  accessories: ReturnType<typeof identityAccessories>;
  manifest: ShotAnimationManifest;
  visemeLowConfidence: boolean;
  usesLocomotion: boolean;
  usesProp: boolean;
};

export function planCharacterShot(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  contract?: CharacterRigContract | null;
  speaking?: boolean;
  locomotion?: string;
  prop?: string;
  partner?: 'PIP' | 'GOAT';
  durationMs?: number;
  seed?: number;
  voice?: {
    audioReceiptRef?: string | null;
    audioSha256?: string | null;
    durationMs?: number | null;
    wordTimings?: DialogueTimingPlan['wordTimings'];
    phonemeTimings?: DialogueTimingPlan['phonemeTimings'];
  };
  storyCriticalProp?: boolean;
}): ShotAnimationPlan {
  const admissionInput: AdmissionInput & { characterId: 'PIP' | 'GOAT' } = {
    characterId: input.characterId,
    contract: input.contract,
  };
  const admission = evaluateRigAdmission(admissionInput);
  const speaking = input.speaking === true;
  const durationMs = input.durationMs ?? input.voice?.durationMs ?? 2400;
  const locomotionClass = classifyLocomotion(input.locomotion);
  const intent = intentFromBeat({
    shotId: input.shotId,
    characterId: input.characterId,
    speaking,
    locomotion: input.locomotion,
    prop: input.prop,
    partner: input.partner,
  });
  const timing = buildDialogueTiming({
    lineId: `${input.shotId}:${input.characterId}`,
    characterId: input.characterId,
    audioReceiptRef: input.voice?.audioReceiptRef,
    audioSha256: input.voice?.audioSha256,
    durationMs: speaking ? (input.voice?.durationMs ?? durationMs) : null,
    wordTimings: input.voice?.wordTimings,
    phonemeTimings: input.voice?.phonemeTimings,
  });
  const viseme = buildVisemePlan(timing);
  const blink = buildBlinkPlan({
    shotId: input.shotId,
    characterId: input.characterId,
    durationMs,
    emotion: intent.emotion,
    speaking,
    attentionShifts: speaking ? [800] : [600, 1400],
    seed: input.seed ?? 4170179,
  });
  const gaze = buildGazePlan({
    shotId: input.shotId,
    characterId: input.characterId,
    speaking,
    partnerVisible: Boolean(input.partner),
    propId: input.prop ?? null,
    moving: locomotionClass !== 'STATIONARY',
    storyCritical: input.storyCriticalProp,
  });
  const body = buildBodyActingPlan(intent);
  const locomotion = buildLocomotionPlan({
    shotId: input.shotId,
    characterId: input.characterId,
    speedClass: locomotionClass,
    durationMs,
  });
  const contact = buildContactPlan(locomotion);
  const props = buildPropInteraction(
    input.prop
      ? [
          {
            shotId: input.shotId,
            propId: 'STORY_MAP',
            fromCarrier: input.prop === 'RECEIVE' ? (input.partner ?? null) : input.characterId,
            toCarrier: input.prop === 'PUT_DOWN' ? null : input.characterId,
            state:
              input.prop === 'PICK_UP'
                ? 'ATTACHED'
                : input.prop === 'HAND_OVER'
                  ? 'TRANSFERRING'
                  : input.prop === 'PUT_DOWN'
                    ? 'RELEASED'
                    : 'HELD',
          },
        ]
      : [{ shotId: input.shotId, propId: 'NONE', fromCarrier: null, toCarrier: null, state: 'FREE' }],
  );
  const actions = defaultActionsForBeat({
    characterId: input.characterId,
    speaking,
    locomotion: input.locomotion ?? 'stationary',
    prop: input.prop,
  });
  const clip = buildAnimationClipPlan({
    shotId: input.shotId,
    characterId: input.characterId,
    actions: actions.map((actionId: ActionId) =>
      resolveCharacterAction({
        characterId: input.characterId,
        actionId,
        contract: input.contract,
        admitted: admission.approvedForAnimation,
      }),
    ),
  });
  const continuityDependencySha256 = sha256Canonical({
    shotId: input.shotId,
    characterId: input.characterId,
    prop: input.prop ?? 'none',
    locomotion: locomotionClass,
  });
  const identity = input.contract ?? {
    characterId: input.characterId,
    rigId: 'UNRESOLVED_PRODUCTION_RIG',
    rigVersion: 'UNRESOLVED_PRODUCTION_RIG',
    rigDependencySha256: 'UNRESOLVED_PRODUCTION_RIG',
    sourceReceiptRef: null,
    sourceSha256: null,
    rigApprovalReceiptRef: null,
    rigApprovalSha256: null,
    blenderVersionCompatibility: 'unresolved',
    evidenceClass: 'SYNTHETIC_PREVIEW' as const,
  };
  const manifest = buildShotAnimationManifest({
    shotId: input.shotId,
    characterId: input.characterId,
    rig: identity,
    performanceIntentSha256: intent.intentSha256,
    dialogueTimingSha256: timing.timingSha256,
    visemePlanSha256: viseme.visemePlanSha256,
    blinkPlanSha256: blink.blinkPlanSha256,
    gazePlanSha256: gaze.gazePlanSha256,
    bodyActingPlanSha256: body.bodyActingPlanSha256,
    locomotionPlanSha256: locomotion.locomotionPlanSha256,
    contactPlanSha256: contact.contactPlanSha256,
    propInteractionSha256: props.propInteractionSha256,
    continuityDependencySha256,
  });
  return {
    shotId: input.shotId,
    characterId: input.characterId,
    admitted: admission.approvedForAnimation,
    synthetic: identity.evidenceClass === 'SYNTHETIC_PREVIEW',
    speaking,
    locomotionClass,
    intent,
    timing,
    viseme,
    blink,
    gaze,
    body,
    locomotion,
    contact,
    props,
    clip,
    accessories: identityAccessories(input.characterId),
    manifest,
    visemeLowConfidence: viseme.confidence === 'LOW' || timing.fallbackTimingSource === 'TIMING_UNAVAILABLE',
    usesLocomotion: locomotionClass !== 'STATIONARY',
    usesProp: Boolean(input.prop),
  };
}
