import { createHash } from 'node:crypto';

export const EP001_RIG_INSPECTION_EVIDENCE_SCHEMA = 'TIVVLEJOY_EP001_RIG_INSPECTION_EVIDENCE_V1' as const;

export type RigCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';
export type RigEvidenceKind =
  | 'TURNAROUND'
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'TURN'
  | 'JUMP'
  | 'DIALOGUE'
  | 'BLINK_EYES'
  | 'EXPRESSIONS'
  | 'PROP_INTERACTION'
  | 'DEFORMATION_CLOSEUPS'
  | 'RIG_README';

export type RigEvidenceSlot = {
  id: string;
  characterId: RigCharacterId;
  kind: RigEvidenceKind;
  required: boolean;
  acceptedExtensions: readonly string[];
  purpose: string;
};

const VIDEO = ['.mp4', '.mov', '.webm'] as const;
const IMAGE = ['.png', '.jpg', '.jpeg', '.webp'] as const;
const DOC = ['.txt', '.md', '.pdf'] as const;

function characterSlots(characterId: RigCharacterId): RigEvidenceSlot[] {
  const prefix = characterId === 'CHAR_PIP_001' ? 'PIP' : 'GOAT';
  const common: RigEvidenceSlot[] = [
    { id: `${prefix}_TURNAROUND`, characterId, kind: 'TURNAROUND', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm silhouette, accessory stability, scale, and deformation from multiple angles.' },
    { id: `${prefix}_IDLE`, characterId, kind: 'IDLE', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm neutral pose, breathing/settle behavior, and no visible rig pops.' },
    { id: `${prefix}_WALK`, characterId, kind: 'WALK', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm locomotion deformation, foot contact, and weight transfer.' },
    { id: `${prefix}_RUN`, characterId, kind: 'RUN', required: true, acceptedExtensions: VIDEO, purpose: 'Stress test body, limb, accessory, and facial stability.' },
    { id: `${prefix}_TURN`, characterId, kind: 'TURN', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm root/body/head control during direction changes.' },
    { id: `${prefix}_JUMP`, characterId, kind: 'JUMP', required: true, acceptedExtensions: VIDEO, purpose: 'Stress test compression, extension, landing, and contact.' },
    { id: `${prefix}_DIALOGUE`, characterId, kind: 'DIALOGUE', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm dialogue controls and facial deformation under speech.' },
    { id: `${prefix}_BLINK_EYES`, characterId, kind: 'BLINK_EYES', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm blink, eye aim, lids, and gaze controls.' },
    { id: `${prefix}_EXPRESSIONS`, characterId, kind: 'EXPRESSIONS', required: true, acceptedExtensions: [...VIDEO, ...IMAGE], purpose: 'Confirm happy, curious/confused, surprised, and neutral expression range.' },
    { id: `${prefix}_PROP_INTERACTION`, characterId, kind: 'PROP_INTERACTION', required: true, acceptedExtensions: VIDEO, purpose: 'Confirm stable hand/wing/hoof interaction with an episode-style prop.' },
    { id: `${prefix}_DEFORMATION_CLOSEUPS`, characterId, kind: 'DEFORMATION_CLOSEUPS', required: true, acceptedExtensions: [...VIDEO, ...IMAGE], purpose: 'Show shoulders/wing roots, face/jaw, hips, knees, ankles/feet, and accessory attachment points under stress.' },
    { id: `${prefix}_RIG_README`, characterId, kind: 'RIG_README', required: true, acceptedExtensions: DOC, purpose: 'Document rig version, Blender version, controls, dependencies, known limitations, and export notes.' },
  ];
  return common;
}

export function compileEp001RigInspectionEvidenceSlots() {
  const pip = characterSlots('CHAR_PIP_001');
  const goat = characterSlots('CHAR_GOAT_001');
  const slots = [...pip, ...goat];
  const contract = {
    schemaVersion: EP001_RIG_INSPECTION_EVIDENCE_SCHEMA,
    episodeId: 'EP001' as const,
    pip,
    goat,
    slots,
    requiredCount: slots.filter((slot) => slot.required).length,
    uploadDoesNotApprove: true as const,
    humanApprovalRequired: true as const,
    productionEnabled: false as const,
  };
  const contractSha256 = createHash('sha256').update(JSON.stringify(contract)).digest('hex');
  return { ...contract, contractSha256 };
}

export function validateRigEvidenceFilename(input: { slotId: string; filename: string }) {
  const contract = compileEp001RigInspectionEvidenceSlots();
  const slot = contract.slots.find((candidate) => candidate.id === input.slotId);
  if (!slot) return { valid: false, errors: ['RIG_EVIDENCE_SLOT_UNKNOWN'] as string[], slot: null };
  const lower = input.filename.trim().toLowerCase();
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  const errors: string[] = [];
  if (!input.filename.trim() || /[\\/\0]/.test(input.filename) || input.filename.includes('..')) errors.push('RIG_EVIDENCE_FILENAME_INVALID');
  if (!slot.acceptedExtensions.includes(extension)) errors.push('RIG_EVIDENCE_EXTENSION_INVALID');
  return { valid: errors.length === 0, errors, slot };
}
