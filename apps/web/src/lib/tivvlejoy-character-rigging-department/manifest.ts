import {
  GOAT_ANIMATION_VALIDATION_VERSION,
  GOAT_EXPORT_VERSION,
  GOAT_FACE_RIG_VERSION,
  GOAT_RIG_VERSION,
  GOAT_SKELETON_VERSION,
  GOAT_VISEME_VERSION,
  GOAT_WEIGHT_VERSION,
  STUDIO_BLENDER_PIN,
} from './types';
import { sha256Canonical } from './hash';
import { inspectGoatSourcePackage, resolveRepoRoot, GOAT_SOURCE_SLOTS } from './source-intake';
import { EXPECTED_GOAT_PACKAGE_HINTS } from './topology';

export function buildGoatCharacterManifest(input?: { repoRoot?: string }) {
  const intake = inspectGoatSourcePackage(input?.repoRoot ?? resolveRepoRoot());
  const manifest = {
    schema: 'TIVVLEJOY_CHARACTER_BUILD_MANIFEST_V1' as const,
    canonicalId: 'CHAR_GOAT_001' as const,
    displayName: 'Goat',
    sourceHash: intake.sha256,
    sourceFile: GOAT_SOURCE_SLOTS[0]!.relativePath,
    workingFile: GOAT_SOURCE_SLOTS[1]!.relativePath,
    productionFile: GOAT_SOURCE_SLOTS[2]!.relativePath,
    blender: {
      authoredHint: EXPECTED_GOAT_PACKAGE_HINTS.authoredBlender,
      studioPin: STUDIO_BLENDER_PIN,
      conversionCopyRequired: true,
    },
    copies: {
      SOURCE: 'immutable',
      WORKING: 'rig-development',
      PRODUCTION: 'approved-animation-master-only-after-gates',
    },
    meshRoles: {
      body: 'BODY',
      horns: 'HORNS',
      collar: 'COLLAR',
      tag: 'TAG',
      eyes: 'EYES',
      mouth: 'MOUTH',
    },
    materials: [] as string[],
    textures: {
      expectedCountHint: EXPECTED_GOAT_PACKAGE_HINTS.textureMapsApprox,
      resolutionHint: '2K',
      laterHigherResSupportedWithoutReRig: true,
      doNotUpscaleInventDetail: true,
    },
    scale: {
      relativeToPip: 1.5,
      units: 'Blender meters after normalization',
    },
    versions: {
      rig: GOAT_RIG_VERSION,
      skeleton: GOAT_SKELETON_VERSION,
      faceRig: GOAT_FACE_RIG_VERSION,
      viseme: GOAT_VISEME_VERSION,
      weight: GOAT_WEIGHT_VERSION,
      animationValidation: GOAT_ANIMATION_VALIDATION_VERSION,
      export: GOAT_EXPORT_VERSION,
    },
    gateStatus: 'BLOCKED' as const,
    goatProductionReady: false,
  };
  return {
    ...manifest,
    manifestHash: sha256Canonical(manifest),
  };
}
