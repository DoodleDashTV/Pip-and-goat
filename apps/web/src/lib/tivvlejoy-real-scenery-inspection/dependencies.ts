import { DEPENDENCY_AUDIT_SCHEMA } from './types';

export type DependencyAudit = {
  schemaVersion: typeof DEPENDENCY_AUDIT_SCHEMA;
  missingTextures: string[];
  missingLinkedLibraries: string[];
  missingExternalGeometry: string[];
  missingHdris: string[];
  missingMaterialResources: string[];
  approvalReadyBlocked: boolean;
  blockers: string[];
};

export function auditDependencies(input: {
  missingTextures?: string[];
  missingLinkedLibraries?: string[];
  missingExternalGeometry?: string[];
  missingHdris?: string[];
  missingMaterialResources?: string[];
}): DependencyAudit {
  const missingTextures = input.missingTextures ?? [];
  const missingLinkedLibraries = input.missingLinkedLibraries ?? [];
  const missingExternalGeometry = input.missingExternalGeometry ?? [];
  const missingHdris = input.missingHdris ?? [];
  const missingMaterialResources = input.missingMaterialResources ?? [];
  const blockers: string[] = [];
  if (missingTextures.length) blockers.push('MISSING_REQUIRED_DEPENDENCY:textures');
  if (missingLinkedLibraries.length) blockers.push('MISSING_REQUIRED_DEPENDENCY:linked_libraries');
  if (missingExternalGeometry.length) blockers.push('MISSING_REQUIRED_DEPENDENCY:geometry');
  if (missingHdris.length) blockers.push('MISSING_REQUIRED_DEPENDENCY:hdri');
  if (missingMaterialResources.length) blockers.push('MISSING_REQUIRED_DEPENDENCY:materials');
  return {
    schemaVersion: DEPENDENCY_AUDIT_SCHEMA,
    missingTextures,
    missingLinkedLibraries,
    missingExternalGeometry,
    missingHdris,
    missingMaterialResources,
    approvalReadyBlocked: blockers.length > 0,
    blockers,
  };
}
