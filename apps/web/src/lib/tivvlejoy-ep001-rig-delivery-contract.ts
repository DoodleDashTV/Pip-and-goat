import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001RigHandoffMatrix } from '@/lib/tivvlejoy-ep001-rig-handoff';
import {
  RIG_ALLOWED_EXTENSIONS,
  RIG_MAX_BYTES_BY_EXTENSION,
  RIG_MIN_BYTES,
} from '@/lib/tivvlejoy-real-input-convergence/types';

export const EP001_RIG_DELIVERY_CONTRACT_SCHEMA =
  'TIVVLEJOY_EP001_RIG_DELIVERY_CONTRACT_V1' as const;

const MIB = 1024 * 1024;

function extensionLimit(extension: (typeof RIG_ALLOWED_EXTENSIONS)[number]) {
  const maxBytes = RIG_MAX_BYTES_BY_EXTENSION[extension];
  return {
    extension,
    maxBytes,
    maxMiB: maxBytes / MIB,
    canonical: extension === '.blend',
  };
}

export function compileEp001RigDeliveryContract() {
  const matrix = compileEp001RigHandoffMatrix();

  const characters = matrix.characters.map((character) => ({
    characterId: character.characterId,
    displayName: character.displayName,
    status: 'WAITING_FOR_ARTIST_DELIVERY' as const,
    canonicalSource: {
      requiredExtension: '.blend' as const,
      oneCanonicalSourceRequired: true as const,
      packedTexturesPreferred: true as const,
      externalTexturesAllowedOnlyWhenComplete: true as const,
      blenderVersionNoteRequired: true as const,
      rigVersionNoteRequired: true as const,
      sha256BecomesImmutableIdentity: true as const,
    },
    optionalCompanions: ['.fbx', '.glb'] as const,
    requiredControlCount: character.admissionRequiredControls.length,
    requiredControls: character.admissionRequiredControls.map((control) => ({
      controlId: control.controlId,
      family: control.family,
      requirement: control.requirement,
    })),
    preferredEpisodeControls: character.preferredEpisodeControls.map((control) => ({
      controlId: control.controlId,
      family: control.family,
    })),
    identityControls: character.identityControls.map((control) => ({
      controlId: control.controlId,
      family: control.family,
    })),
    requiredTestPoseCount: character.requiredTestPoses.length,
    requiredTestPoses: character.requiredTestPoses,
    episodeActionCount: character.uniqueActionCount,
    actionAcceptance: character.actionCoverage.map((action) => ({
      actionId: action.actionId,
      shotIds: action.shotIds,
      supportExpectation: action.supportExpectation,
      acceptanceEvidence: action.acceptanceEvidence,
    })),
    requiredEvidence: [
      'Canonical Blender source SHA-256 and exact byte size',
      'Control inventory covering every required control',
      'Still images or a short playblast covering every required test pose',
      'Visible deformation evidence for face, neck, body, limbs, feet, and accessories used by EP001',
      'Human visual approval receipt after inspection',
    ],
  }));

  const body = {
    schemaVersion: EP001_RIG_DELIVERY_CONTRACT_SCHEMA,
    episodeId: matrix.episodeId,
    workingTitle: matrix.workingTitle,
    rigMatrixSha256: matrix.matrixSha256,
    state: 'DELIVERY_CONTRACT_READY_RIGS_NOT_ADMITTED' as const,
    intakePolicy: {
      allowedExtensions: RIG_ALLOWED_EXTENSIONS,
      minimumBytes: RIG_MIN_BYTES,
      extensionLimits: RIG_ALLOWED_EXTENSIONS.map(extensionLimit),
      filenameIsIdentity: false as const,
      sha256IsIdentity: true as const,
      duplicateHashesRejected: true as const,
      priorVersionOverwriteAllowed: false as const,
    },
    characters,
    rejectionReasons: [
      'Missing canonical .blend source',
      'Unsupported extension or file outside the extension-specific byte ceiling',
      'Missing or invalid SHA-256',
      'Duplicate artifact hash already admitted as a prior version',
      'Required control coverage is incomplete',
      'Required test-pose coverage is incomplete',
      'Broken, missing, or externally unresolved textures',
      'Visible deformation, ground-contact, eye, mouth/beak, wing/limb, foot/toe, or accessory failures',
      'No human visual approval receipt',
    ],
    operatorSequence: [
      'Receive the canonical .blend and optional FBX/GLB companion exports.',
      'Record exact byte size and compute SHA-256 before any inspection state can advance.',
      'Run static structure inspection and compare the rig against the EP001 required-control contract.',
      'Review every required test pose plus EP001-specific action deformation evidence.',
      'Bind the inspection and deformation receipts to the exact artifact SHA-256.',
      'Stop at the human approval gate; software must not auto-approve the artist rig.',
    ],
    authority: {
      rigAdmissionGranted: false as const,
      humanVisualApprovalIssued: false as const,
      animationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      sourceBytesIncluded: false as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      paidRequests: 0 as const,
    },
  };

  return { ...body, contractSha256: sha256Canonical(body) };
}

export type Ep001RigDeliveryContract = ReturnType<typeof compileEp001RigDeliveryContract>;
