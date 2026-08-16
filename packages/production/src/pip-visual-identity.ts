/**
 * Justin-approved Pip visual identity.
 *
 * This is the official backpack Pip design for future TivvleJoy work. It is
 * not a production-library replacement, not a THEATRICAL asset binding, and
 * not a production-ready mesh. The dense fused source still needs retopo,
 * deformation-safe accessories, UVs, rig, facial controls, and animation
 * validation before those later gates may open.
 */
import { z } from 'zod';

export const APPROVED_PIP_PACKAGE_ID =
  '20260816T025617Z_pip_backpack_replacement.glb_dca239475c78';

export const APPROVED_PIP_SOURCE_SHA256 =
  'dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696';

export const APPROVED_PIP_SOURCE_BYTES = 62876180;

export const APPROVED_PIP_WORKING_BLEND =
  'theatrical-foundation/proposed/final-character-production/working/pip_backpack_canonical_working.blend';

export const APPROVED_PIP_ARCHIVE_DIR =
  'theatrical-foundation/proposed/final-character-production/archive/pip-visual-identity/';

export const PIP_BOUND_DESIGN_ELEMENTS = [
  'approved_face_eyes_cheerful_expression',
  'bright_yellow_polished_cgi_appearance',
  'three_coral_crest_feathers',
  'long_layered_yellow_wings',
  'teal_scarf',
  'orange_beak_and_feet',
  'centered_backpack',
  'two_symmetrical_shoulder_straps',
  'no_satchel',
  'no_cross_body_strap',
  'no_hip_bag',
] as const;

export const SUPERSEDED_PIP_MODELS = [
  {
    id: 'PIP_SATCHEL_REPLACEMENT',
    sha256: '2e06f4285448167e0441c97ed73d2f1e14166db35e8d6f9eadc0fb9b14a7fb7e',
    path: 'theatrical-foundation/proposed/pip-replacement-intake/inbox/pip_replacement.glb.part{1,2,3}.bin',
    reason: 'Satchel / cross-body replacement candidate. Superseded by backpack Pip.',
  },
  {
    id: 'PIP_CURRENT_PRISM_WORKING',
    path: 'theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend',
    reason: 'Earlier Prism working Pip. Superseded as visual foundation. Keep for rollback.',
  },
  {
    id: 'PIP_LONG_WING_ORIGINAL',
    sha256: '9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2',
    path: 'theatrical-foundation/proposed/final-character-production/pip_long_wing_original.part0{1,2,3}.bin',
    reason: 'Earlier long-wing original. Archive for rollback. Do not delete.',
  },
] as const;

export const PipVisualIdentitySchema = z.object({
  schema: z.literal('tivvlejoy.pip_visual_identity.v1'),
  characterCode: z.literal('CHAR_PIP_001'),
  displayName: z.literal('Pip'),
  role: z.literal('official_permanent_visual_identity'),
  packageId: z.literal(APPROVED_PIP_PACKAGE_ID),
  sourceSha256: z.literal(APPROVED_PIP_SOURCE_SHA256),
  sourceBytes: z.literal(APPROVED_PIP_SOURCE_BYTES),
  workingBlend: z.string().min(1),
  productionReady: z.literal(false),
  productionLibraryReplaced: z.literal(false),
  theatricalBound: z.literal(false),
  mergeAuthorized: z.literal(false),
  destructiveCleanupAuthorized: z.literal(false),
  paidResources: z.literal(false),
  goatTouched: z.literal(false),
  boundDesignElements: z.array(z.string()).min(1),
  remainingBeforeProductionReady: z.array(z.string()).min(1),
});
export type PipVisualIdentity = z.infer<typeof PipVisualIdentitySchema>;

export function parsePipVisualIdentity(raw: unknown): PipVisualIdentity {
  return PipVisualIdentitySchema.parse(raw);
}

export function assertPipVisualIdentityDoesNotPromote(identity: PipVisualIdentity) {
  if (
    identity.productionReady ||
    identity.productionLibraryReplaced ||
    identity.theatricalBound ||
    identity.mergeAuthorized ||
    identity.destructiveCleanupAuthorized ||
    identity.paidResources
  ) {
    throw new Error('Pip visual identity must not claim production-ready, library replace, theatrical bind, merge, or paid work.');
  }
  if (identity.sourceSha256 !== APPROVED_PIP_SOURCE_SHA256) {
    throw new Error('Pip visual identity hash does not match the Justin-approved source.');
  }
  return true;
}

export function evaluatePipPromotionGate(raw: {
  justinSelectedBackpackPip?: boolean;
  requestProductionLibraryReplace?: boolean;
  requestTheatricalBind?: boolean;
  requestMerge?: boolean;
  requestDestructiveCleanup?: boolean;
  requestPaidResources?: boolean;
} = {}) {
  const selected = raw.justinSelectedBackpackPip === true;
  const blockers = [
    'Approved visual identity is not a production-ready mesh.',
    'Retopo, deformation-safe backpack treatment, UV/material preservation, rigging, facial controls, and animation validation remain open.',
  ];
  if (!selected) blockers.push('Justin has not selected the backpack Pip as official visual identity.');
  if (raw.requestProductionLibraryReplace) blockers.push('production-library replacement requested and refused.');
  if (raw.requestTheatricalBind) blockers.push('Final theatrical binding requested and refused.');
  if (raw.requestMerge) blockers.push('Draft PR merge requested and refused.');
  if (raw.requestDestructiveCleanup) blockers.push('Destructive mesh cleanup requested and refused.');
  if (raw.requestPaidResources) blockers.push('Paid resources requested and refused.');
  return {
    schema: 'tivvlejoy.pip_visual_identity.gate.v1' as const,
    visualIdentityApproved: selected,
    productionReady: false,
    productionLibraryReplaced: false,
    theatricalBound: false,
    mergeAuthorized: false,
    currentPipHighresOverwritten: false,
    goatTouched: false,
    paidResources: false,
    stopForJustin: true,
    blockers,
  };
}
