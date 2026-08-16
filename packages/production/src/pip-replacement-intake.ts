/**
 * Pip replacement intake gate.
 *
 * A newly uploaded Pip model is a comparison candidate. This module records
 * that fact as data so no caller can "helpfully" promote it to canon, bind it
 * theatrically, merge it, or write production-library/.
 */
import { z } from 'zod';

export const PIP_REPLACEMENT_INTAKE_SCHEMA = 'tivvlejoy.pip_replacement_intake.v1';

export const SUPPORTED_INTAKE_EXTENSIONS = [
  '.blend',
  '.glb',
  '.gltf',
  '.fbx',
  '.obj',
  '.png',
  '.jpg',
  '.jpeg',
  '.tga',
  '.exr',
  '.tif',
  '.tiff',
  '.webp',
  '.bmp',
  '.zip',
] as const;

export const MODEL_INTAKE_EXTENSIONS = ['.blend', '.glb', '.gltf', '.fbx', '.obj'] as const;

export const PIP_COMPARISON_ITEM_IDS = [
  'face_and_green_eyes',
  'bright_yellow_cgi_finish',
  'three_coral_crest_feathers',
  'long_layered_wings',
  'teal_scarf',
  'one_continuous_cross_body_strap',
  'character_right_shoulder_origin',
  'diagonal_front_and_rear_path',
  'character_left_hip_satchel',
  'copper_spiral',
  'feet_toes_rear_hallux',
  'accessories_separated_or_fused',
  'front_exactly_one_diagonal_strap',
] as const;

export const ChecklistStatusSchema = z.enum(['REQUIRES_JUSTIN', 'MEASURED_HINT', 'REJECTED']);
export type ChecklistStatus = z.infer<typeof ChecklistStatusSchema>;

export const PipComparisonItemSchema = z.object({
  id: z.enum(PIP_COMPARISON_ITEM_IDS),
  label: z.string().min(1),
  status: ChecklistStatusSchema,
  automated: z.boolean(),
  notes: z.string(),
  measuredHint: z.unknown().optional(),
});
export type PipComparisonItem = z.infer<typeof PipComparisonItemSchema>;

export const IntakeGateRequestSchema = z.object({
  justinApproved: z.boolean().default(false),
  visualChecklistPassed: z.boolean().default(false),
  requestCanonReplace: z.boolean().default(false),
  requestTheatricalBind: z.boolean().default(false),
  requestMerge: z.boolean().default(false),
  requestProductionLibraryWrite: z.boolean().default(false),
  requestRigBindToCurrentPip: z.boolean().default(false),
});
export type IntakeGateRequest = z.input<typeof IntakeGateRequestSchema>;

export const LONG_WING_ORIGINAL_SHA256 =
  '9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2';

export const PROTECTED_INTAKE_PATHS = [
  'production-library/',
  'theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend',
  'theatrical-foundation/proposed/final-character-production/high-resolution/goat_highres_candidate.blend',
  'theatrical-foundation/proposed/final-character-production/pip_long_wing_original.part01.bin',
  'theatrical-foundation/proposed/final-character-production/pip_long_wing_original.part02.bin',
  'theatrical-foundation/proposed/final-character-production/pip_long_wing_original.part03.bin',
] as const;

export function isSupportedIntakeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_INTAKE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isModelIntakeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return MODEL_INTAKE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function choosePrimaryModel(filenames: readonly string[]): string | null {
  for (const ext of MODEL_INTAKE_EXTENSIONS) {
    const match = filenames
      .filter((name) => name.toLowerCase().endsWith(ext))
      .sort((a, b) => a.localeCompare(b))[0];
    if (match) return match;
  }
  return null;
}

export function buildPendingChecklist(): PipComparisonItem[] {
  return PIP_COMPARISON_ITEM_IDS.map((id) =>
    PipComparisonItemSchema.parse({
      id,
      label: id.replace(/_/g, ' '),
      status: 'REQUIRES_JUSTIN',
      automated: false,
      notes: 'Visual comparison only. Intake never auto-approves this item.',
    }),
  );
}

export function evaluatePipReplacementGate(raw: IntakeGateRequest = {}) {
  const request = IntakeGateRequestSchema.parse(raw);
  const blockers = [
    'Current fused Tripo Pip is preserved for comparison only.',
    'Next upload is a replacement candidate, not automatic canon.',
    'Justin visual approval is required before retopo, rigging, canon replacement, theatrical binding, or merging.',
  ];
  if (!request.justinApproved) blockers.push('Justin has not visually approved this candidate.');
  if (!request.visualChecklistPassed) {
    blockers.push('Reference-comparison checklist is not fully approved.');
  }
  if (request.requestCanonReplace) blockers.push('Canon replacement requested and refused.');
  if (request.requestTheatricalBind) blockers.push('Theatrical binding requested and refused.');
  if (request.requestMerge) blockers.push('Merge requested and refused.');
  if (request.requestProductionLibraryWrite) {
    blockers.push('production-library write requested and refused.');
  }
  if (request.requestRigBindToCurrentPip) {
    blockers.push('Final Pip rig bind to current candidate requested and refused.');
  }

  return {
    schema: PIP_REPLACEMENT_INTAKE_SCHEMA,
    role: request.justinApproved ? ('approved_visual_foundation' as const) : ('replacement_candidate_only' as const),
    autoReplaceCurrentPip: false,
    visualIdentityApproved: request.justinApproved,
    approved: false,
    canonicalMutated: false,
    theatricalBound: false,
    merge: false,
    productionLibraryTouched: false,
    paidResources: false,
    currentPipOverwritten: false,
    goatTouched: false,
    stopForJustin: true,
    forbidden: {
      autoReplaceCurrentPip: false,
      canonReplace: false,
      theatricalBind: false,
      merge: false,
      productionLibraryWrite: false,
      finalRigBindToCurrentPip: false,
      paidResources: false,
    },
    blockers,
  };
}

export function assertUnpaidLocalIntake(env: Record<string, string | undefined> = process.env) {
  const cloud = String(env.CLOUD_RENDER_ENABLED ?? 'false').toLowerCase();
  const paid = String(env.ALLOW_PAID_GPU_LAUNCH ?? 'false').toLowerCase();
  const enabled = !['0', 'false', 'no', 'off', ''].includes(cloud);
  const allowPaid = !['0', 'false', 'no', 'off', ''].includes(paid);
  if (enabled || allowPaid) {
    throw new Error('Pip replacement intake refuses paid cloud render or GPU launch.');
  }
  return { cloudRenderEnabled: false, allowPaidGpuLaunch: false };
}
