export {
  QC_GATE_IDS,
  LocalQcEvidenceSchema,
  type QcGateId,
  type QcGateStatus,
  type QcGateResult,
  type LocalQcEvidence,
  type LocalQcReport,
  type RigBindingEvidence,
  type CharacterMotionEvidence,
  type CameraMotionEvidence,
  type FCurveEvidence,
  type LightEvidence,
  type HierarchyNodeEvidence,
  type SceneAssemblyEvidence,
  type TechnicalRenderEvidence,
  type VisualQualityEvidence,
} from './types';

export {
  evaluateLocalQcGates,
  isReadyForCloudAcceptance,
  assertReadyForCloudAcceptance,
} from './evaluate';

export {
  hasCameraMotion,
  hasCharacterMotion,
  isConstantFCurve,
  hasRotationModeMismatch,
  hasKeyedButUnevaluated,
  summarizeChannelIssues,
  CHARACTER_MOTION_EPSILON,
} from './motion';

export { evaluateRigBinding, evaluateAllRigBindings } from './rig';
export { evaluateLightingState, findDuplicateProductionLights, normalizeLightKey } from './lighting';
export {
  evaluateMapMarkHierarchy,
  evaluateCharacterAccessoryHierarchy,
  evaluateSceneAssembly,
} from './hierarchy';

export {
  validProductionEvidence,
  cameraOnlyStaticCharactersEvidence,
  constantCurveEvidence,
  rotationMismatchEvidence,
  duplicateLightsEvidence,
  detachedMapMarkEvidence,
  fakeRigBindingEvidence,
} from './fixtures';
