import type { RigArrivalChecklistRow } from './types';

export const RIG_ARRIVAL_CHECKLIST_LABELS = [
  'FILE RECEIVED',
  'HASH VERIFIED',
  'SOURCE PRESERVED',
  'BLENDER VERSION VERIFIED',
  'ARMATURE INSPECTED',
  'REQUIRED CONTROLS PRESENT',
  'WEIGHTS TESTED',
  'BEAK/JAW TESTED',
  'EYES TESTED',
  'EYELIDS TESTED',
  'WINGS tested for Pip',
  'LEGS/FEET tested',
  'Pip hallux checked',
  'ACCESSORIES stable',
  'Goat collar/tag stable',
  'PROP ATTACHMENTS checked',
  'TEST POSES reviewed',
  'HUMAN APPROVAL issued',
] as const;

export function compileRigArrivalChecklist(): RigArrivalChecklistRow[] {
  return RIG_ARRIVAL_CHECKLIST_LABELS.map((label, index) => ({
    id: `RIG_CHECK_${String(index + 1).padStart(2, '0')}`,
    label,
    complete: false,
    autoApproval: false,
  }));
}

export function checklistAutoApprovalCount(rows: readonly RigArrivalChecklistRow[]): number {
  return rows.filter((row) => row.autoApproval || row.complete).length;
}
