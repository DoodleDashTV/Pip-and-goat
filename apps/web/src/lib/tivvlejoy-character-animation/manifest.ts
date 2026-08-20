import { sha256Canonical } from './hash';
import { SHOT_MANIFEST_SCHEMA, type RigIdentity } from './types';

export interface ShotAnimationPlanRefs {
  performanceIntentSha256: string;
  dialogueTimingSha256: string;
  visemePlanSha256: string;
  blinkPlanSha256: string;
  gazePlanSha256: string;
  bodyActingPlanSha256: string;
  locomotionPlanSha256: string;
  contactPlanSha256: string;
  propInteractionSha256: string;
  continuityDependencySha256: string;
}

export interface ShotAnimationManifestInput extends ShotAnimationPlanRefs {
  shotId: string;
  characterId: string;
  rig: RigIdentity;
}

export interface ShotAnimationManifest extends ShotAnimationManifestInput {
  schema: typeof SHOT_MANIFEST_SCHEMA;
  shotAnimationDependencySha256: string;
}

export function buildShotAnimationDependencySha256(input: ShotAnimationManifestInput): string {
  return sha256Canonical({
    shotId: input.shotId,
    characterId: input.characterId,
    rigId: input.rig.rigId,
    rigVersion: input.rig.rigVersion,
    rigDependencySha256: input.rig.rigDependencySha256,
    performanceIntentSha256: input.performanceIntentSha256,
    dialogueTimingSha256: input.dialogueTimingSha256,
    visemePlanSha256: input.visemePlanSha256,
    blinkPlanSha256: input.blinkPlanSha256,
    gazePlanSha256: input.gazePlanSha256,
    bodyActingPlanSha256: input.bodyActingPlanSha256,
    locomotionPlanSha256: input.locomotionPlanSha256,
    contactPlanSha256: input.contactPlanSha256,
    propInteractionSha256: input.propInteractionSha256,
    continuityDependencySha256: input.continuityDependencySha256,
  });
}

export function buildShotAnimationManifest(input: ShotAnimationManifestInput): ShotAnimationManifest {
  return {
    schema: SHOT_MANIFEST_SCHEMA,
    ...input,
    shotAnimationDependencySha256: buildShotAnimationDependencySha256(input),
  };
}

/** Precise invalidation: scenery-only background changes do not appear in this hash. */
export function animationStaleAfter(args: {
  previous: ShotAnimationManifest;
  next: ShotAnimationManifestInput;
}): boolean {
  return args.previous.shotAnimationDependencySha256 !== buildShotAnimationDependencySha256(args.next);
}

export function sceneryOnlyChangeInvalidatesAnimation(): false {
  return false;
}
