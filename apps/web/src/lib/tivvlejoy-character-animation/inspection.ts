import { sha256Canonical } from './hash';
import { RIG_INSPECTION_SCHEMA } from './types';

export type RigInspectionReport = {
  schemaVersion: typeof RIG_INSPECTION_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  armatureCount: number;
  boneCount: number;
  deformBoneCount: number;
  controlCount: number;
  shapeKeyCount: number;
  constraints: string[];
  drivers: string[];
  ikControls: string[];
  fkControls: string[];
  attachmentPoints: string[];
  materials: string[];
  meshAssociations: string[];
  weightGroups: string[];
  unsupportedDependencies: string[];
  missingControllers: string[];
  duplicateBoneNames: string[];
  unboundMeshes: string[];
  nonuniformScaleConcerns: string[];
  blenderExecuted: false;
  synthetic: boolean;
  reportSha256: string;
};

export function validateInspectionReport(report: Omit<RigInspectionReport, 'reportSha256' | 'schemaVersion' | 'blenderExecuted'>): string[] {
  const issues: string[] = [];
  if (report.armatureCount < 1) issues.push('NO_ARMATURE');
  if (report.boneCount < 1) issues.push('NO_BONES');
  if (report.deformBoneCount < 1) issues.push('NO_DEFORM_BONES');
  if (report.controlCount < 1) issues.push('NO_CONTROLS');
  if (report.duplicateBoneNames.length) issues.push('DUPLICATE_BONE_NAMES');
  if (report.unboundMeshes.length) issues.push('UNBOUND_MESHES');
  if (report.unsupportedDependencies.length) issues.push('UNSUPPORTED_DEPENDENCIES');
  return issues;
}

export function buildInspectionReport(
  input: Omit<RigInspectionReport, 'schemaVersion' | 'reportSha256' | 'blenderExecuted'>,
): RigInspectionReport {
  const body = {
    schemaVersion: RIG_INSPECTION_SCHEMA,
    blenderExecuted: false as const,
    ...input,
  };
  return { ...body, reportSha256: sha256Canonical(body) };
}

export function syntheticPipInspection(): RigInspectionReport {
  return buildInspectionReport({
    characterId: 'PIP',
    armatureCount: 1,
    boneCount: 48,
    deformBoneCount: 32,
    controlCount: 26,
    shapeKeyCount: 4,
    constraints: ['IK_LEG_L', 'IK_LEG_R'],
    drivers: ['BEAK_OPEN'],
    ikControls: ['LEG_L', 'LEG_R'],
    fkControls: ['WING_L', 'WING_R', 'NECK'],
    attachmentPoints: ['PROP_HAND', 'BACKPACK'],
    materials: ['PIP_BODY'],
    meshAssociations: ['PIP_MESH'],
    weightGroups: ['DEF_HEAD', 'DEF_BODY'],
    unsupportedDependencies: [],
    missingControllers: [],
    duplicateBoneNames: [],
    unboundMeshes: [],
    nonuniformScaleConcerns: [],
    synthetic: true,
  });
}

export function syntheticGoatInspection(): RigInspectionReport {
  return buildInspectionReport({
    characterId: 'GOAT',
    armatureCount: 1,
    boneCount: 40,
    deformBoneCount: 28,
    controlCount: 22,
    shapeKeyCount: 3,
    constraints: ['IK_LEG_L', 'IK_LEG_R'],
    drivers: ['JAW_OPEN'],
    ikControls: ['LEG_L', 'LEG_R'],
    fkControls: ['NECK', 'HEAD'],
    attachmentPoints: ['PROP_MOUTH', 'COLLAR'],
    materials: ['GOAT_BODY'],
    meshAssociations: ['GOAT_MESH'],
    weightGroups: ['DEF_HEAD', 'DEF_BODY'],
    unsupportedDependencies: [],
    missingControllers: [],
    duplicateBoneNames: [],
    unboundMeshes: [],
    nonuniformScaleConcerns: [],
    synthetic: true,
  });
}
