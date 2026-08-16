/**
 * Protected Pip production-conversion gate.
 *
 * The official backpack Pip may be copied into a conversion path and prepared
 * as far as is safe. This module records that fact as data so no caller can
 * claim the fused mesh is production-ready, bind it theatrically, merge Draft
 * PR #24, write production-library/, remesh the likeness, or touch Goat.
 */
import { z } from 'zod';

import {
  APPROVED_PIP_PACKAGE_ID,
  APPROVED_PIP_SOURCE_BYTES,
  APPROVED_PIP_SOURCE_SHA256,
  APPROVED_PIP_WORKING_BLEND,
  PIP_BOUND_DESIGN_ELEMENTS,
} from './pip-visual-identity';

export const APPROVED_PIP_CONVERSION_BLEND =
  'theatrical-foundation/proposed/final-character-production/conversion/pip_backpack_production_conversion.blend';

export const PIP_CONVERSION_REMAINING = [
  'justin_will_assign_professional_retopo_separately',
  'animation_retopo_with_clean_deformation_loops',
  'isolated_backpack_straps_and_scarf',
  'production_weights_on_retopo_not_envelopes',
  'production_facial_rig_with_lid_and_viseme_targets',
  'groom_or_feather_cards_that_deform',
  'uv_rebuild_if_retopo_changes_seams',
  'envelope_approach_rejected_do_not_repeat',
  'production_library_replace_still_closed',
  'theatrical_binding_still_closed',
] as const;

export const PIP_RETOPO_PATH_CHOICES = [
  'human_artist_unpaid_unless_later_approved',
  'external_retopo_service_paid_needs_yes',
  'pause_keep_checkpoint',
  'refuse_automated_remesh',
] as const;

export const PipProductionConversionSchema = z.object({
  schema: z.literal('tivvlejoy.pip_production_conversion.v1'),
  characterCode: z.literal('CHAR_PIP_001'),
  displayName: z.literal('Pip'),
  role: z.literal('protected_production_conversion_in_progress'),
  packageId: z.literal(APPROVED_PIP_PACKAGE_ID),
  sourceSha256: z.literal(APPROVED_PIP_SOURCE_SHA256),
  sourceBytes: z.literal(APPROVED_PIP_SOURCE_BYTES),
  sourceWorkingBlend: z.string().min(1),
  conversionBlend: z.string().min(1),
  visualIdentityApproved: z.literal(true),
  conversionStarted: z.boolean(),
  conversionComplete: z.literal(false),
  justinConversionApproved: z.literal(false).optional(),
  conversionCheckpointOnly: z.literal(true).optional(),
  conversionPaused: z.literal(true).optional(),
  envelopeApproachRejected: z.literal(true).optional(),
  automatedRemeshRefused: z.literal(true).optional(),
  productionReady: z.literal(false),
  productionLibraryReplaced: z.literal(false),
  theatricalBound: z.literal(false),
  mergeAuthorized: z.literal(false),
  rigRegistryBound: z.literal(false),
  modularSpecBoundToFusedMesh: z.literal(false),
  workingBlendOverwritten: z.literal(false),
  approvedSourceOverwritten: z.literal(false),
  voxelRemesh: z.literal(false),
  primitiveRebuild: z.literal(false),
  paidResources: z.literal(false),
  goatTouched: z.literal(false),
  boundDesignElements: z.array(z.string()).min(1),
  remaining: z.array(z.string()).min(1),
});
export type PipProductionConversion = z.infer<typeof PipProductionConversionSchema>;

export function parsePipProductionConversion(raw: unknown): PipProductionConversion {
  return PipProductionConversionSchema.parse(raw);
}

export function assertPipConversionDoesNotPromote(conversion: PipProductionConversion) {
  if (
    conversion.conversionComplete ||
    conversion.productionReady ||
    conversion.productionLibraryReplaced ||
    conversion.theatricalBound ||
    conversion.mergeAuthorized ||
    conversion.rigRegistryBound ||
    conversion.modularSpecBoundToFusedMesh ||
    conversion.workingBlendOverwritten ||
    conversion.approvedSourceOverwritten ||
    conversion.voxelRemesh ||
    conversion.primitiveRebuild ||
    conversion.paidResources ||
    conversion.goatTouched
  ) {
    throw new Error(
      'Pip production conversion must not claim completion, production-ready, library replace, theatrical bind, merge, remesh, or Goat work.',
    );
  }
  if (conversion.sourceSha256 !== APPROVED_PIP_SOURCE_SHA256) {
    throw new Error('Pip conversion hash does not match the Justin-approved source.');
  }
  if (conversion.sourceWorkingBlend !== APPROVED_PIP_WORKING_BLEND) {
    throw new Error('Pip conversion must start from the official backpack working blend.');
  }
  return true;
}

export function evaluatePipConversionGate(
  raw: {
    justinApprovedVisualIdentity?: boolean;
    conversionStarted?: boolean;
    conversionArtifactsPresent?: boolean;
    requestProductionReady?: boolean;
    requestProductionLibraryReplace?: boolean;
    requestTheatricalBind?: boolean;
    requestMerge?: boolean;
    requestVoxelRemesh?: boolean;
    requestPrimitiveRebuild?: boolean;
    requestRigRegistryBind?: boolean;
    requestPaidResources?: boolean;
    requestGoatWork?: boolean;
  } = {},
) {
  const approved = raw.justinApprovedVisualIdentity !== false;
  const blockers = [
    'Official backpack Pip is the visual identity, not a production-ready mesh.',
    'Justin rejected the envelope conversion as animation-ready. Do not repeat that approach.',
    'Voxel remesh, Quadriflow replacement, primitive reconstruction, and envelope-on-fused remain refused.',
    'Justin paused conversion at the protected checkpoint. Do not resume until Justin assigns a professional retopo.',
  ];
  if (!approved) blockers.push('Justin has not approved the backpack Pip visual identity.');
  if (raw.requestProductionReady) blockers.push('Production-ready claim requested and refused.');
  if (raw.requestProductionLibraryReplace) blockers.push('production-library replacement requested and refused.');
  if (raw.requestTheatricalBind) blockers.push('Final theatrical binding requested and refused.');
  if (raw.requestMerge) blockers.push('Draft PR merge requested and refused.');
  if (raw.requestVoxelRemesh) blockers.push('Voxel remesh requested and refused.');
  if (raw.requestPrimitiveRebuild) blockers.push('Primitive rebuild requested and refused.');
  if (raw.requestRigRegistryBind) blockers.push('Live Pip rig registry bind requested and refused.');
  if (raw.requestPaidResources) blockers.push('Paid resources requested and refused.');
  if (raw.requestGoatWork) blockers.push('Goat work requested and refused.');
  return {
    schema: 'tivvlejoy.pip_production_conversion.gate.v1' as const,
    visualIdentityApproved: approved,
    conversionStarted: raw.conversionStarted === true,
    conversionComplete: false,
    justinConversionApproved: false,
    conversionCheckpointOnly: true,
    conversionPaused: true,
    envelopeApproachRejected: true,
    automatedRemeshRefused: true,
    productionReady: false,
    productionLibraryReplaced: false,
    theatricalBound: false,
    mergeAuthorized: false,
    rigRegistryBound: false,
    modularSpecBoundToFusedMesh: false,
    workingBlendOverwritten: false,
    approvedSourceOverwritten: false,
    goatTouched: false,
    paidResources: false,
    voxelRemesh: false,
    primitiveRebuild: false,
    stopForJustin: true,
    conversionArtifactsPresent: raw.conversionArtifactsPresent === true,
    blockers,
    boundDesignElements: PIP_BOUND_DESIGN_ELEMENTS,
    remaining: PIP_CONVERSION_REMAINING,
    conversionBlend: APPROVED_PIP_CONVERSION_BLEND,
  };
}

export const PIP_AUTOMATED_REMESH_REFUSALS = [
  'voxel_remesh',
  'quadriflow_replacement',
  'primitive_reconstruction',
  'envelope_rig_on_fused_source',
  'destructive_edits_to_approved_pip',
] as const;

export function evaluatePipRetopoPathDecision(
  choice?: (typeof PIP_RETOPO_PATH_CHOICES)[number],
  alsoConfirm: ReadonlyArray<(typeof PIP_RETOPO_PATH_CHOICES)[number]> = [],
) {
  if (choice && !PIP_RETOPO_PATH_CHOICES.includes(choice)) {
    throw new Error(`unknown retopo path choice: ${choice}`);
  }
  const confirmed = alsoConfirm.filter((item) => item !== choice);
  const paused = choice === 'pause_keep_checkpoint';
  const refusedAutomated =
    paused || choice === 'refuse_automated_remesh' || confirmed.includes('refuse_automated_remesh');
  return {
    schema: 'tivvlejoy.pip_retopo_path.v1' as const,
    choice: choice ?? null,
    alsoConfirmed: confirmed,
    chosen: Boolean(choice),
    paused,
    startsConversion: false,
    productionReady: false,
    animationReady: false,
    paidResourcesAuthorized: false,
    paidResourcesRequested: choice === 'external_retopo_service_paid_needs_yes',
    envelopeApproachRejected: true,
    automatedRemeshRefused: refusedAutomated,
    refused: refusedAutomated ? PIP_AUTOMATED_REMESH_REFUSALS : [],
    destructiveEditsToApprovedPip: false,
    retopoOwner: paused ? ('justin_will_assign_separately' as const) : null,
    goatTouched: false,
    productionLibraryReplaced: false,
    theatricalBound: false,
    mergeAuthorized: false,
    stopForJustin: true,
    choices: PIP_RETOPO_PATH_CHOICES,
    note: 'Pause keeps the checkpoint. Justin will separately decide who creates the professional animation retopo. Paid work still needs a later explicit yes.',
  };
}
