import { SUPPORTED_BLENDER_VERSION } from '../types';
import { SCENERY_INTAKE_SCHEMA_VERSION } from './config';
import { EXPECTED_INSPECTION_CHECKS } from './inspection-checks';

export const BLENDER_INSPECTION_CONTRACT = {
  schemaVersion: SCENERY_INTAKE_SCHEMA_VERSION,
  supportedBlenderVersion: SUPPORTED_BLENDER_VERSION,
  paidGpu: false,
  sourceImmutable: true,
  executeEmbeddedScripts: false,
  extractUntrustedArchives: false,
  autoApprove: false,
  expectedChecks: EXPECTED_INSPECTION_CHECKS,
  steps: [
    'Materialize one immutable source into a temporary workspace.',
    'Calculate or verify SHA-256 of the materialized copy.',
    'Open a copy, never the source.',
    'Record the saved Blender version.',
    'Inventory collections, objects, meshes, materials, image dependencies, and node groups.',
    'Count triangles.',
    'Identify Geometry Nodes, missing textures, packed textures, and unsupported nodes.',
    'Record dimensions, transforms, origins, and scale.',
    'Save a JSON inspection report.',
    'Upload the report to inspection/.',
    'Clean temporary working files.',
    'Leave the source unchanged.',
  ],
  reportFields: [
    'blenderVersionDetected',
    'collections',
    'objects',
    'meshes',
    'triangleCounts',
    'materials',
    'images',
    'nodeGroups',
    'geometryNodes',
    'missingExternalFiles',
    'packedTextures',
    'unsupportedNodes',
    'dimensions',
    'origins',
    'sourceModified',
  ],
  normalizationBoundary: {
    allowed: false,
    reason:
      'Normalization is refused unless a verified Blender 4.2 worker and actual source bytes are both available.',
    outputPrefix: 'tivvlejoy-assets/normalized/',
    neverOverwriteSource: true,
    neverAutoApprove: true,
  },
} as const;

export function describeBlenderAvailability(): {
  available: boolean;
  executed: false;
  gpu: false;
  message: string;
} {
  return {
    available: false,
    executed: false,
    gpu: false,
    message:
      'Blender 4.2 is not available in this environment. Inspection jobs stay dry-run and realExecution remains not_run.',
  };
}
