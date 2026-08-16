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
  'animation_retopo_with_clean_deformation_loops',
  'production_weights_on_retopo_not_envelopes',
  'production_facial_rig_with_lid_and_viseme_targets',
  'groom_or_feather_cards_that_deform',
  'uv_rebuild_if_retopo_changes_seams',
  'justin_visual_approval_of_this_conversion',
  'production_library_replace_still_closed',
  'theatrical_binding_still_closed',
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
    'Safe conversion may separate disconnected islands and add a validation armature only.',
    'Voxel remesh, Quadriflow of this density, and primitive rebuild remain refused.',
    'A later animation retopo is still required for eyelid, mouth, and wing-fold loops.',
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
