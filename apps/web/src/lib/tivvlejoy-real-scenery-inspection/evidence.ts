import { INSPECTION_EVIDENCE_SCHEMA, type EvidenceClass, type SourceState } from './types';
import { sha256Canonical } from './hash';
import type { SafeArchiveInspection } from './archive';
import type { BlendHeaderInspection, FbxInspection, GlbInspection, GltfInspection } from './formats';
import type { DeepBlenderInspection } from './blender';
import type { AddonDependencyReport, ScriptSafetyReport } from './scripts-addons';
import type { MaterialAudit, TextureAudit } from './textures-materials';
import type { DependencyAudit } from './dependencies';
import type { SemanticClassification, QualityClassification, DepthClassification, ArchetypeCompatibility } from './classify';
import type { StyleReport } from './style';
import type { CanonicalRecommendation } from './canonical';
import type { ScaleAnalysis, TransformAnalysis, BudgetAnalysis } from './geometry';

export type InspectionEvidence = {
  schemaVersion: typeof INSPECTION_EVIDENCE_SCHEMA;
  sourceId: string;
  sourceReceiptRef: string | null;
  sourceSha256: string | null;
  storedByteSize: number | null;
  sourceState: SourceState;
  containerState: SafeArchiveInspection['state'] | 'NOT_AN_ARCHIVE';
  staticFormatFindings: {
    glb?: GlbInspection;
    gltf?: GltfInspection;
    fbx?: FbxInspection;
    blend?: BlendHeaderInspection;
  };
  deepInspection: DeepBlenderInspection;
  dependencyFindings: DependencyAudit;
  textureFindings: TextureAudit;
  materialFindings: MaterialAudit;
  geometryFindings: {
    scale: ScaleAnalysis;
    transform: TransformAnalysis;
    budget: BudgetAnalysis;
  };
  semanticClassification: SemanticClassification;
  styleClassification: StyleReport;
  quality: QualityClassification;
  depth: DepthClassification;
  archetypes: ArchetypeCompatibility;
  canonicalRecommendation: CanonicalRecommendation;
  scriptSafety: ScriptSafetyReport;
  addonDependencies: AddonDependencyReport;
  warnings: string[];
  blockers: string[];
  inspectionMethod: EvidenceClass;
  inspectionConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  commercialSourceModified: false;
  inspectionSha256: string;
};

export function buildInspectionEvidence(input: Omit<InspectionEvidence, 'schemaVersion' | 'inspectionSha256' | 'commercialSourceModified'>): InspectionEvidence {
  const draft: Omit<InspectionEvidence, 'inspectionSha256'> = {
    ...input,
    schemaVersion: INSPECTION_EVIDENCE_SCHEMA,
    commercialSourceModified: false,
  };
  return { ...draft, inspectionSha256: sha256Canonical(draft) };
}
