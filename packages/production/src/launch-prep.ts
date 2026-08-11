import { createHash } from 'crypto';
import { spawnSync } from 'node:child_process';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import {
  AppError,
  createDefaultObjectStorage,
  storageKeyFor,
  type ObjectStorage,
} from '@doodle-dash/shared';
import { characterService, studioSettingsService } from '@doodle-dash/characters';
import {
  assetIntakeService,
  characterAssetValidator,
  referenceLockService,
  voiceProductionService,
  buildEpisodeOrchestrator,
  shotPackageService,
} from './readiness';

export const VERTICAL_SLICE_EPISODE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MEADOW_CODE = 'LOC_MEADOW_001';
export const MAP_PROP_CODE = 'PROP_MAP_001';

export const SEMANTIC_FACIAL_CONTROLS = [
  'jaw_open',
  'mouth_smile',
  'mouth_frown',
  'mouth_pucker',
  'mouth_wide',
  'blink_left',
  'blink_right',
  'eye_look_left',
  'eye_look_right',
  'eye_look_up',
  'eye_look_down',
  'brow_up',
  'brow_down',
  'viseme_A',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
  'viseme_MBP',
  'viseme_FV',
  'viseme_L',
  'viseme_WQ',
  'viseme_rest',
] as const;

export const REQUIRED_MOUTH_CONTROLS = [
  'jaw_open',
  'viseme_A',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
  'viseme_MBP',
  'viseme_FV',
  'viseme_L',
  'viseme_rest',
] as const;

export const CHARACTER_TEST_POSES = [
  'FRONT_NEUTRAL',
  'THREE_QUARTER_NEUTRAL',
  'SIDE_NEUTRAL',
  'BACK_NEUTRAL',
  'SMILE',
  'HAPPY',
  'SURPRISED',
  'CONCERNED',
  'BLINK',
  'MOUTH_OPEN',
  'TALK_TEST',
  'WALK_POSE',
  'RUN_POSE',
  'JUMP_POSE',
  'WAVE_POSE',
] as const;

export const CANONICAL_AUDITION_SCRIPT = [
  'Hi, I am ready for Doodle Dash.',
  'Wow — that map is exciting!',
  'Where should we go next?',
  'Hmm… I am a little concerned.',
  'Ha! That made me smile.',
  'Pip and Goat explore together.',
  'Welcome to Doodle Dash TV.',
].join(' ');

function hashBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export class ProductionStorageService {
  constructor(private readonly storage: ObjectStorage = createDefaultObjectStorage()) {}

  async storeUpload(input: {
    category:
      | 'original_uploads'
      | 'approved_assets'
      | 'working_files'
      | 'draft_renders'
      | 'final_renders'
      | 'audio'
      | 'captions'
      | 'thumbnails'
      | 'reports'
      | 'manifests'
      | 'worker_tests';
    parts: Array<string | number>;
    bytes: Uint8Array;
    contentType?: string;
    originalName?: string;
    metadata?: object;
  }) {
    const storageKey = storageKeyFor(input.category, input.parts);
    const checksum = hashBytes(input.bytes);
    const uri = await this.storage.putObject(storageKey, input.bytes, input.contentType);
    const record = await prisma.storedProductionObject.create({
      data: {
        storageKey,
        provider: process.env.OBJECT_STORAGE_PROVIDER ?? 'local',
        category: input.category,
        uri,
        checksum,
        byteSize: input.bytes.byteLength,
        contentType: input.contentType ?? null,
        originalName: input.originalName ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
    return { record, storageKey, uri, checksum };
  }

  get underlying() {
    return this.storage;
  }
}

export class CharacterOnboardingService {
  constructor(
    private readonly storage = new ProductionStorageService(),
    private readonly intake = assetIntakeService,
    private readonly validator = characterAssetValidator,
  ) {}

  async uploadModel(params: {
    characterId: string;
    universeId: string;
    fileName: string;
    bytes: Uint8Array;
    contentType?: string;
    source?: string;
  }) {
    const ext = params.fileName.toLowerCase().split('.').pop() ?? '';
    const kind =
      ext === 'blend'
        ? 'CHARACTER_BLEND'
        : ext === 'glb'
          ? 'CHARACTER_GLB'
          : ext === 'gltf'
            ? 'CHARACTER_GLTF'
            : ext === 'fbx'
              ? 'CHARACTER_FBX'
              : null;
    if (!kind) {
      throw new AppError(
        'Unsupported model format. Use .blend, .glb, .gltf, or .fbx.',
        'UNSUPPORTED_MODEL_FORMAT',
        400,
      );
    }

    const stored = await this.storage.storeUpload({
      category: 'original_uploads',
      parts: ['characters', params.characterId, kind, Date.now(), params.fileName],
      bytes: params.bytes,
      contentType: params.contentType,
      originalName: params.fileName,
    });

    const intake = await this.intake.register({
      universeId: params.universeId,
      entityType: 'character',
      entityId: params.characterId,
      kind,
      originalFilename: params.fileName,
      mimeType: params.contentType,
      storageLocation: stored.uri,
      source: params.source ?? 'onboarding-upload',
      fileBytes: Buffer.from(params.bytes),
      notes: `Stored as ${stored.storageKey}`,
    });

    const inspection = await this.inspectModel({
      characterId: params.characterId,
      intakeId: intake.id,
      fileName: params.fileName,
      fileSize: params.bytes.byteLength,
      fileHash: stored.checksum,
      format: ext,
      storageUri: stored.uri,
    });

    const validation = await this.validator.validate(params.characterId);
    return { intake, stored, inspection, validation };
  }

  async uploadTextureOrReference(params: {
    characterId: string;
    universeId: string;
    kind:
      | 'TEXTURE'
      | 'MATERIAL'
      | 'REFERENCE_IMAGE'
      | 'PRIMARY_CANONICAL_REFERENCE'
      | 'TURNAROUND'
      | 'EXPRESSION_SHEET'
      | 'POSE_REFERENCE'
      | 'FACIAL_SHAPEKEYS'
      | 'RIG';
    fileName: string;
    bytes: Uint8Array;
    contentType?: string;
  }) {
    const stored = await this.storage.storeUpload({
      category: 'original_uploads',
      parts: ['characters', params.characterId, params.kind, Date.now(), params.fileName],
      bytes: params.bytes,
      contentType: params.contentType,
      originalName: params.fileName,
    });
    const intake = await this.intake.register({
      universeId: params.universeId,
      entityType: 'character',
      entityId: params.characterId,
      kind: params.kind === 'PRIMARY_CANONICAL_REFERENCE' ? 'PRIMARY_CANONICAL_REFERENCE' : params.kind,
      originalFilename: params.fileName,
      mimeType: params.contentType,
      storageLocation: stored.uri,
      source: 'onboarding-upload',
      fileBytes: Buffer.from(params.bytes),
    });

    let referenceImage = null;
    if (
      ['REFERENCE_IMAGE', 'PRIMARY_CANONICAL_REFERENCE', 'TURNAROUND', 'EXPRESSION_SHEET', 'POSE_REFERENCE'].includes(
        params.kind,
      )
    ) {
      const character = await prisma.character.findUniqueOrThrow({
        where: { id: params.characterId },
      });
      const asset = await prisma.asset.create({
        data: {
          universeId: params.universeId,
          name: params.fileName,
          type: 'REFERENCE_IMAGE',
          storageLocation: stored.uri,
          hash: stored.checksum,
          mimeType: params.contentType ?? null,
          missing: false,
          approved: false,
          notes: `Onboarding upload ${params.kind}`,
        },
      });
      referenceImage = await prisma.characterReferenceImage.create({
        data: {
          universeId: params.universeId,
          characterId: params.characterId,
          characterVersionId: character.currentVersionId,
          assetId: asset.id,
          title: params.fileName,
          viewType:
            params.kind === 'PRIMARY_CANONICAL_REFERENCE' ? 'PRIMARY' : params.kind,
          reviewStatus: 'PENDING_REVIEW',
          isPrimary: params.kind === 'PRIMARY_CANONICAL_REFERENCE' || params.kind === 'REFERENCE_IMAGE',
        },
      });
    }

    return { intake, stored, referenceImage };
  }

  async inspectModel(params: {
    characterId: string;
    intakeId?: string;
    fileName: string;
    fileSize: number;
    fileHash: string;
    format: string;
    storageUri: string;
  }) {
    const blenderAvailable = detectBlenderBinary().available;
    const required = [
      { code: 'FILE_PRESENT', passed: true, message: 'Binary uploaded to object storage.' },
      {
        code: 'SUPPORTED_FORMAT',
        passed: ['blend', 'glb', 'gltf', 'fbx'].includes(params.format),
        message: `Format: ${params.format}`,
      },
      {
        code: 'BLENDER_SCENE_GRAPH',
        passed: false,
        message: blenderAvailable
          ? 'Blender scene-graph inspection pending worker job.'
          : 'BLENDER EXECUTION REQUIRED for scene objects/meshes/bones/shape keys.',
      },
      {
        code: 'NOT_AUTO_PRODUCTION_READY',
        passed: true,
        message: 'Upload alone never grants production-ready status.',
      },
    ];

    const report = {
      fileName: params.fileName,
      fileSize: params.fileSize,
      fileHash: params.fileHash,
      format: params.format,
      storageUri: params.storageUri,
      sceneObjects: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      meshes: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      materials: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      textures: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      armatures: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      bones: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      shapeKeys: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      animations: blenderAvailable ? 'PENDING_WORKER' : 'BLENDER_EXECUTION_REQUIRED',
      missingDependencies: [] as string[],
      scale: 'UNKNOWN_UNTIL_BLENDER',
      orientation: 'UNKNOWN_UNTIL_BLENDER',
      bounds: 'UNKNOWN_UNTIL_BLENDER',
      rig: {
        boneCount: null,
        rootBone: null,
        headControls: null,
        eyeControls: null,
        jawControl: null,
        mouthControls: null,
        armControls: null,
        legControls: null,
      },
    };

    return prisma.characterModelInspection.create({
      data: {
        characterId: params.characterId,
        intakeId: params.intakeId ?? null,
        fileName: params.fileName,
        fileSize: params.fileSize,
        fileHash: params.fileHash,
        format: params.format,
        report,
        requiredFindings: required,
        recommendedFindings: [
          { code: 'TURNAROUND_REFS', message: 'Upload turnaround sheets before lock.' },
          { code: 'FACIAL_MAP', message: 'Map facial controls after rig inspection.' },
        ],
        optionalFindings: [
          { code: 'FBX_EXCHANGE', message: 'FBX exchange copy if pipeline tools need it.' },
        ],
        productionReadyEligible: false,
        blenderInspectStatus: blenderAvailable ? 'QUEUED' : 'BLENDER_EXECUTION_REQUIRED',
      },
    });
  }
}

export class FacialMappingService {
  async getOrCreate(characterId: string, assetVersion = 1) {
    const existing = await prisma.characterFacialControlMap.findUnique({
      where: { characterId_assetVersion: { characterId, assetVersion } },
    });
    if (existing) return existing;
    const mappings = Object.fromEntries(SEMANTIC_FACIAL_CONTROLS.map((k) => [k, null]));
    return prisma.characterFacialControlMap.create({
      data: {
        characterId,
        assetVersion,
        mappings,
        requiredComplete: false,
        missingRequired: [...REQUIRED_MOUTH_CONTROLS],
      },
    });
  }

  async saveMappings(params: {
    characterId: string;
    assetVersion?: number;
    controlType?: 'SHAPE_KEY' | 'BONE';
    mappings: Record<string, string | null>;
  }) {
    const assetVersion = params.assetVersion ?? 1;
    await this.getOrCreate(params.characterId, assetVersion);
    const missing = REQUIRED_MOUTH_CONTROLS.filter((k) => !params.mappings[k]);
    return prisma.characterFacialControlMap.update({
      where: {
        characterId_assetVersion: { characterId: params.characterId, assetVersion },
      },
      data: {
        controlType: params.controlType ?? 'SHAPE_KEY',
        mappings: params.mappings,
        requiredComplete: missing.length === 0,
        missingRequired: missing,
        approved: false,
        approvedAt: null,
        approvedBy: null,
      },
    });
  }

  async approve(characterId: string, assetVersion: number, approvedBy: string) {
    const map = await this.getOrCreate(characterId, assetVersion);
    if (!map.requiredComplete) {
      throw new AppError(
        `Minimum mouth system incomplete. Missing: ${(map.missingRequired as string[] | null)?.join(', ') ?? 'required controls'}`,
        'FACIAL_MAP_INCOMPLETE',
        409,
      );
    }
    return prisma.characterFacialControlMap.update({
      where: { characterId_assetVersion: { characterId, assetVersion } },
      data: { approved: true, approvedBy, approvedAt: new Date() },
    });
  }

  async assertLipSyncReady(characterId: string) {
    const map = await prisma.characterFacialControlMap.findFirst({
      where: { characterId },
      orderBy: { assetVersion: 'desc' },
    });
    if (!map?.approved || !map.requiredComplete) {
      throw new AppError(
        'Lip-sync blocked — facial control mapping incomplete or unapproved.',
        'LIP_SYNC_MAPPING_REQUIRED',
        409,
      );
    }
    return map;
  }
}

export class ReferenceApprovalService {
  async approveVersion(params: {
    characterId: string;
    primaryImageId: string;
    additionalImageIds?: string[];
    palette?: object;
    silhouetteNotes?: string;
    proportionNotes?: string;
    lockedTraits?: object;
    assetVersion?: number;
    approvedBy: string;
  }) {
    await referenceLockService.approvePrimary({
      characterId: params.characterId,
      referenceImageId: params.primaryImageId,
      approvedBy: params.approvedBy,
      palette: params.palette,
      silhouette: params.silhouetteNotes,
      proportions: params.proportionNotes ? { notes: params.proportionNotes } : undefined,
      forbiddenChanges: 'Locked by approved reference version. Do not drift silhouette/palette.',
    });

    const latest = await prisma.approvedReferenceVersion.findFirst({
      where: { characterId: params.characterId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    return prisma.approvedReferenceVersion.create({
      data: {
        characterId: params.characterId,
        versionNumber,
        primaryImageId: params.primaryImageId,
        additionalImageIds: params.additionalImageIds ?? [],
        palette: params.palette,
        silhouetteNotes: params.silhouetteNotes ?? null,
        proportionNotes: params.proportionNotes ?? null,
        lockedTraits: params.lockedTraits ?? undefined,
        assetVersion: params.assetVersion ?? null,
        immutable: true,
        approvedBy: params.approvedBy,
        summary: {
          characterId: params.characterId,
          versionNumber,
          primaryImageId: params.primaryImageId,
          additionalCount: params.additionalImageIds?.length ?? 0,
        },
      },
    });
  }

  async linkEpisode(episodeId: string, characterId: string, approvedReferenceVersionId: string) {
    return prisma.episodeReferenceVersionLink.upsert({
      where: { episodeId_characterId: { episodeId, characterId } },
      update: { approvedReferenceVersionId },
      create: { episodeId, characterId, approvedReferenceVersionId },
    });
  }
}

export class CharacterPreviewService {
  async queuePoseTests(characterId: string) {
    const modelReady = await prisma.productionAssetIntake.findFirst({
      where: {
        entityType: 'character',
        entityId: characterId,
        kind: { in: ['CHARACTER_BLEND', 'CHARACTER_GLB', 'CHARACTER_GLTF'] },
        storageLocation: { not: null },
        approvalStatus: { not: 'MISSING' },
      },
    });
    const blender = detectBlenderBinary();
    const jobs = [];
    for (const poseCode of CHARACTER_TEST_POSES) {
      if (!modelReady) {
        jobs.push(
          await prisma.characterPreviewJob.create({
            data: {
              characterId,
              poseCode,
              status: 'BLOCKED',
              blockedReason: 'PRODUCTION ASSET REQUIRED — upload a character model first.',
            },
          }),
        );
        continue;
      }
      if (!blender.available) {
        jobs.push(
          await prisma.characterPreviewJob.create({
            data: {
              characterId,
              poseCode,
              status: 'BLOCKED',
              blockedReason: 'BLENDER EXECUTION REQUIRED — no placeholder preview images.',
            },
          }),
        );
        continue;
      }
      jobs.push(
        await prisma.characterPreviewJob.create({
          data: {
            characterId,
            poseCode,
            status: 'QUEUED',
            notes: 'Deterministic Blender inspection/render job queued for real uploaded model.',
          },
        }),
      );
    }
    return jobs;
  }
}

export class EnvironmentOnboardingService {
  constructor(private readonly storage = new ProductionStorageService()) {}

  async uploadEnvironment(params: {
    locationId: string;
    universeId: string;
    fileName: string;
    bytes: Uint8Array;
    kind?: 'LOCATION_BLEND' | 'TEXTURE' | 'LIGHTING_SETUP' | 'REFERENCE_IMAGE' | 'LOCATION_PROP';
    contentType?: string;
  }) {
    const kind = params.kind ?? 'LOCATION_BLEND';
    const stored = await this.storage.storeUpload({
      category: 'original_uploads',
      parts: ['locations', params.locationId, kind, Date.now(), params.fileName],
      bytes: params.bytes,
      contentType: params.contentType,
      originalName: params.fileName,
    });
    const intake = await assetIntakeService.register({
      universeId: params.universeId,
      entityType: 'location',
      entityId: params.locationId,
      kind,
      originalFilename: params.fileName,
      mimeType: params.contentType,
      storageLocation: stored.uri,
      source: 'environment-onboarding',
      fileBytes: Buffer.from(params.bytes),
    });
    return { intake, stored };
  }

  async validate(locationId: string) {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new AppError('Location not found', 'LOCATION_NOT_FOUND', 404);
    const intakes = await prisma.productionAssetIntake.findMany({
      where: { entityType: 'location', entityId: locationId },
    });
    const hasBlend = intakes.some((i) => i.kind === 'LOCATION_BLEND' && i.storageLocation);
    const hasLighting = intakes.some((i) => i.kind === 'LIGHTING_SETUP' && i.storageLocation);
    const hasTextures = intakes.some((i) => i.kind === 'TEXTURE' && i.storageLocation);
    const blender = detectBlenderBinary();

    const checks = [
      {
        code: 'SCENE_LOAD',
        passed: hasBlend,
        severity: 'error' as const,
        message: hasBlend
          ? blender.available
            ? 'Environment file registered; Blender load pending worker.'
            : 'File registered — BLENDER EXECUTION REQUIRED to confirm load.'
          : 'PRODUCTION ASSET REQUIRED — environment .blend not uploaded.',
      },
      {
        code: 'LIGHTING_EXISTS',
        passed: hasLighting || hasBlend,
        severity: 'warning' as const,
        message: hasLighting ? 'Lighting setup uploaded.' : 'Dedicated lighting setup missing.',
      },
      {
        code: 'GROUND_GEOMETRY',
        passed: hasBlend,
        severity: 'error' as const,
        message: hasBlend
          ? 'Ground/world geometry confirmation pending Blender inspect.'
          : 'Ground/world geometry unknown — no environment model.',
      },
      {
        code: 'TEXTURES_RESOLVE',
        passed: hasTextures || hasBlend,
        severity: 'warning' as const,
        message: hasTextures ? 'Textures uploaded.' : 'Texture set not separately uploaded.',
      },
      {
        code: 'VERTICAL_9_16',
        passed: true,
        severity: 'warning' as const,
        message: '9:16 framing viability deferred until Blender camera check.',
      },
      {
        code: 'CHARACTER_PLACEMENT',
        passed: hasBlend,
        severity: 'error' as const,
        message: hasBlend
          ? 'Spawn/walkable validation pending Blender.'
          : 'Cannot place characters — environment missing.',
      },
    ];
    const blockers = checks.filter((c) => c.severity === 'error' && !c.passed).map((c) => c.message);
    return prisma.environmentValidationReport.create({
      data: {
        locationId,
        passed: blockers.length === 0,
        checks,
        blockers,
      },
    });
  }
}

export class PropOnboardingService {
  constructor(private readonly storage = new ProductionStorageService()) {}

  async ensureMapPropProfile() {
    const prop = await prisma.prop.findFirst({ where: { internalCode: MAP_PROP_CODE } });
    if (!prop) return null;
    const existing = await prisma.propProductionProfile.findUnique({ where: { propId: prop.id } });
    if (existing) return { prop, profile: existing };
    const profile = await prisma.propProductionProfile.create({
      data: {
        propId: prop.id,
        productionReady: false,
        blockedReason: 'BLOCKED — PROP ASSET REQUIRED',
      },
    });
    return { prop, profile };
  }

  async uploadPropModel(params: {
    propId: string;
    universeId: string;
    fileName: string;
    bytes: Uint8Array;
    contentType?: string;
  }) {
    const ext = params.fileName.toLowerCase().split('.').pop() ?? '';
    const kind = ext === 'glb' ? 'PROP_GLB' : 'PROP_BLEND';
    const stored = await this.storage.storeUpload({
      category: 'original_uploads',
      parts: ['props', params.propId, kind, Date.now(), params.fileName],
      bytes: params.bytes,
      contentType: params.contentType,
      originalName: params.fileName,
    });
    const intake = await assetIntakeService.register({
      universeId: params.universeId,
      entityType: 'prop',
      entityId: params.propId,
      kind,
      originalFilename: params.fileName,
      mimeType: params.contentType,
      storageLocation: stored.uri,
      source: 'prop-onboarding',
      fileBytes: Buffer.from(params.bytes),
    });
    const profile = await prisma.propProductionProfile.upsert({
      where: { propId: params.propId },
      update: {
        intakeId: intake.id,
        blockedReason: 'Uploaded — pending scale/origin/approval.',
        productionReady: false,
      },
      create: {
        propId: params.propId,
        intakeId: intake.id,
        blockedReason: 'Uploaded — pending scale/origin/approval.',
        productionReady: false,
      },
    });
    return { intake, stored, profile };
  }

  async configure(params: {
    propId: string;
    scale?: number;
    originNotes?: string;
    interactionPoints?: object;
    handGripLocation?: object;
    physicsEnabled?: boolean;
    characterCompatibility?: object;
    approve?: boolean;
    approvedAssetVersion?: number;
  }) {
    await this.ensureMapPropProfile();
    const intake = await prisma.productionAssetIntake.findFirst({
      where: {
        entityType: 'prop',
        entityId: params.propId,
        storageLocation: { not: null },
      },
      orderBy: { version: 'desc' },
    });
    if (!intake && params.approve) {
      throw new AppError('BLOCKED — PROP ASSET REQUIRED', 'PROP_ASSET_REQUIRED', 409);
    }
    return prisma.propProductionProfile.upsert({
      where: { propId: params.propId },
      update: {
        scale: params.scale ?? undefined,
        originNotes: params.originNotes ?? undefined,
        interactionPoints: params.interactionPoints ?? undefined,
        handGripLocation: params.handGripLocation ?? undefined,
        physicsEnabled: params.physicsEnabled ?? undefined,
        characterCompatibility: params.characterCompatibility ?? undefined,
        approvedAssetVersion: params.approvedAssetVersion ?? intake?.version ?? undefined,
        productionReady: Boolean(params.approve && intake),
        blockedReason: params.approve && intake ? null : 'BLOCKED — PROP ASSET REQUIRED or unapproved',
      },
      create: {
        propId: params.propId,
        scale: params.scale ?? null,
        originNotes: params.originNotes ?? null,
        productionReady: false,
        blockedReason: 'BLOCKED — PROP ASSET REQUIRED',
      },
    });
  }
}

export class VoiceOnboardingService {
  async configureAndVersion(params: {
    characterId: string;
    provider?: string | null;
    voiceId?: string | null;
    model?: string | null;
    speed?: number | null;
    pitch?: number | null;
    stability?: number | null;
    pronunciationDictionary?: object | null;
    emotionalDelivery?: object | null;
  }) {
    const config = await voiceProductionService.configure(params);
    const latest = await prisma.voiceConfigVersion.findFirst({
      where: { characterId: params.characterId },
      orderBy: { versionNumber: 'desc' },
    });
    const version = await prisma.voiceConfigVersion.create({
      data: {
        characterId: params.characterId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        provider: params.provider ?? null,
        voiceId: params.voiceId ?? null,
        model: params.model ?? null,
        settings: {
          speed: params.speed,
          pitch: params.pitch,
          stability: params.stability,
          pronunciationDictionary: params.pronunciationDictionary,
          emotionalDelivery: params.emotionalDelivery,
        },
        auditionScript: CANONICAL_AUDITION_SCRIPT,
        status: 'DRAFT',
      },
    });
    return { config, version };
  }

  async generateAudition(characterId: string) {
    const config = await voiceProductionService.getOrCreate(characterId);
    if (!config.provider || !config.voiceId) {
      throw new AppError(
        'Cannot generate audition without provider and voice ID.',
        'VOICE_CONFIG_INCOMPLETE',
        409,
      );
    }
    const latest = await prisma.voiceConfigVersion.findFirst({
      where: { characterId },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latest) {
      throw new AppError('No voice version to audition.', 'VOICE_VERSION_MISSING', 404);
    }
    const hasCreds = Boolean(process.env.VOICE_PROVIDER_API_KEY);
    if (!hasCreds) {
      return prisma.voiceConfigVersion.update({
        where: { id: latest.id },
        data: {
          status: 'AUDITION_BLOCKED',
          rejectedReason:
            'VOICE PROVIDER CREDENTIALS REQUIRED — audition not fabricated. Configure VOICE_PROVIDER_API_KEY.',
        },
      });
    }
    throw new AppError(
      'Voice provider credentials present but provider SDK not wired for this deployment. Refusing to fabricate audition audio.',
      'VOICE_PROVIDER_SDK_NOT_WIRED',
      501,
    );
  }

  async decide(params: {
    characterId: string;
    versionNumber: number;
    decision: 'APPROVE' | 'REJECT';
    by: string;
    reason?: string;
  }) {
    const version = await prisma.voiceConfigVersion.findUnique({
      where: {
        characterId_versionNumber: {
          characterId: params.characterId,
          versionNumber: params.versionNumber,
        },
      },
    });
    if (!version) throw new AppError('Voice version not found', 'VOICE_VERSION_MISSING', 404);
    if (params.decision === 'REJECT') {
      return prisma.voiceConfigVersion.update({
        where: { id: version.id },
        data: { status: 'REJECTED', rejectedReason: params.reason ?? 'Rejected after audition' },
      });
    }
    if (!version.provider || !version.voiceId) {
      throw new AppError('Cannot approve incomplete voice version.', 'VOICE_CONFIG_INCOMPLETE', 409);
    }
    await voiceProductionService.configure({
      characterId: params.characterId,
      provider: version.provider,
      voiceId: version.voiceId,
    });
    await voiceProductionService.approve(params.characterId, params.by);
    return prisma.voiceConfigVersion.update({
      where: { id: version.id },
      data: { status: 'APPROVED', approvedBy: params.by, approvedAt: new Date() },
    });
  }
}

export function detectBlenderBinary(bin = process.env.BLENDER_BIN || 'blender') {
  const probed = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  if (probed.error || probed.status !== 0) {
    return {
      available: false,
      bin,
      version: null as string | null,
      engines: [] as string[],
      message: `Blender executable not found: ${bin}`,
    };
  }
  const versionLine = (probed.stdout || '').split('\n')[0] ?? 'Blender';
  return {
    available: true,
    bin,
    version: versionLine,
    engines: ['EEVEE', 'CYCLES'],
    message: versionLine,
  };
}

export class BlenderWorkerHealthService {
  constructor(private readonly storage = new ProductionStorageService()) {}

  async status() {
    const workers = await prisma.renderWorker.findMany({ orderBy: { updatedAt: 'desc' } });
    const queueLength = await prisma.renderJob.count({
      where: { status: { in: ['QUEUED', 'PREPARING', 'RENDERING'] } },
    });
    const current = await prisma.renderJob.findFirst({
      where: { status: { in: ['RENDERING', 'PREPARING', 'ENCODING'] } },
      orderBy: { updatedAt: 'desc' },
    });
    const lastSuccess = await prisma.renderJob.findFirst({
      where: { status: 'COMPLETE' },
      orderBy: { completedAt: 'desc' },
    });
    const lastFailure = await prisma.renderJob.findFirst({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
    });
    const blender = detectBlenderBinary();
    const online = workers.some((w) => {
      if (!w.lastHeartbeatAt) return false;
      return Date.now() - w.lastHeartbeatAt.getTime() < 60_000;
    });
    return {
      workerConfigured: workers.length > 0 || Boolean(process.env.BLENDER_BIN),
      workerOnline: online,
      workers,
      blender,
      queueLength,
      currentRender: current,
      lastSuccessfulRender: lastSuccess,
      lastFailure,
      gpuMode: Boolean(process.env.BLENDER_GPU),
    };
  }

  async runSelfTest() {
    const blender = detectBlenderBinary();
    const startedAt = new Date();
    if (!blender.available) {
      return prisma.blenderWorkerSelfTest.create({
        data: {
          status: 'FAILED',
          blenderBin: blender.bin,
          error: blender.message,
          startedAt,
          finishedAt: new Date(),
          logExcerpt: 'BLENDER EXECUTION REQUIRED',
        },
      });
    }

    const tmpOut = `/tmp/doodle-blender-selftest-${Date.now()}.png`;
    const alt = spawnSync(
      blender.bin,
      [
        '-b',
        '--python-expr',
        `import bpy; bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.mesh.primitive_cube_add(); bpy.context.scene.render.resolution_x=64; bpy.context.scene.render.resolution_y=64; bpy.context.scene.render.filepath=r'${tmpOut}'; bpy.ops.render.render(write_still=True); print('DOODLE_SELFTEST_OK')`,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    );
    if (alt.status !== 0) {
      return prisma.blenderWorkerSelfTest.create({
        data: {
          status: 'FAILED',
          blenderBin: blender.bin,
          blenderVersion: blender.version,
          error: alt.stderr || 'Self-test render failed',
          logExcerpt: (alt.stdout || '').slice(0, 2000),
          startedAt,
          finishedAt: new Date(),
        },
      });
    }

    const { promises: fs } = await import('node:fs');
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await fs.readFile(tmpOut));
    } catch {
      return prisma.blenderWorkerSelfTest.create({
        data: {
          status: 'FAILED',
          blenderBin: blender.bin,
          blenderVersion: blender.version,
          error: 'Self-test completed but artifact missing',
          startedAt,
          finishedAt: new Date(),
        },
      });
    }

    const stored = await this.storage.storeUpload({
      category: 'worker_tests',
      parts: ['selftest', Date.now(), 'cube.png'],
      bytes,
      contentType: 'image/png',
      originalName: 'blender_selftest_cube.png',
      metadata: { note: 'Infrastructure primitive — not a production Doodle Dash asset.' },
    });

    return prisma.blenderWorkerSelfTest.create({
      data: {
        status: 'SUCCEEDED',
        blenderBin: blender.bin,
        blenderVersion: blender.version,
        artifactUri: stored.uri,
        storageKey: stored.storageKey,
        logExcerpt: 'DOODLE_SELFTEST_OK — primitive cube only',
        startedAt,
        finishedAt: new Date(),
      },
    });
  }
}

export class ShotInspectorService {
  async inspectShot(shotId: string) {
    const shot = await prisma.shot.findUnique({
      where: { id: shotId },
      include: { scene: { include: { episode: true, location: true } } },
    });
    if (!shot) throw new AppError('Shot not found', 'SHOT_NOT_FOUND', 404);

    const characterIds = Array.isArray(shot.characterIds) ? (shot.characterIds as string[]) : [];
    const characters = await prisma.character.findMany({ where: { id: { in: characterIds } } });
    const blockers: Array<{ key: string; state: string; detail: string; href: string }> = [];

    for (const character of characters) {
      const model = await prisma.productionAssetIntake.findFirst({
        where: {
          entityType: 'character',
          entityId: character.id,
          kind: { in: ['CHARACTER_BLEND', 'CHARACTER_GLB'] },
          storageLocation: { not: null },
        },
      });
      blockers.push({
        key: `${character.internalCode}_model`,
        state: model ? 'ready' : 'missing',
        detail: model ? `${character.internalCode} model uploaded` : `${character.name} model: missing`,
        href: '/asset-intake',
      });
      const voice = await prisma.voiceProductionConfig.findUnique({
        where: { characterId: character.id },
      });
      blockers.push({
        key: `${character.internalCode}_voice`,
        state: voice?.approved ? 'ready' : 'missing',
        detail: voice?.approved
          ? `${character.internalCode} voice approved`
          : `${character.name} voice: not approved`,
        href: '/voices',
      });
      const ref = await prisma.approvedReferenceVersion.findFirst({
        where: { characterId: character.id },
        orderBy: { versionNumber: 'desc' },
      });
      blockers.push({
        key: `${character.internalCode}_reference`,
        state: ref ? 'ready' : 'missing',
        detail: ref ? `Reference v${ref.versionNumber}` : `${character.name} reference: missing`,
        href: `/references/approve/${character.internalCode}`,
      });
    }

    const location = shot.scene.location;
    if (location) {
      const env = await prisma.productionAssetIntake.findFirst({
        where: {
          entityType: 'location',
          entityId: location.id,
          kind: 'LOCATION_BLEND',
          storageLocation: { not: null },
        },
      });
      blockers.push({
        key: 'environment',
        state: env ? 'ready' : 'missing',
        detail: env ? 'Environment ready' : `${location.name}: missing`,
        href: '/asset-intake#meadow',
      });
    }

    const prop = await prisma.prop.findFirst({ where: { internalCode: MAP_PROP_CODE } });
    const propProfile = prop
      ? await prisma.propProductionProfile.findUnique({ where: { propId: prop.id } })
      : null;
    blockers.push({
      key: 'prop',
      state: propProfile?.productionReady ? 'ready' : 'missing',
      detail: propProfile?.productionReady ? 'Map prop ready' : 'Map prop: missing',
      href: '/asset-intake#props',
    });

    const dialogues = await prisma.dialogueLine.findMany({
      where: { episodeId: shot.scene.episodeId },
      take: 20,
    });
    const pkg = await shotPackageService.buildForShot(shot.id).catch(() => null);
    const hardBlockers = blockers.filter((b) => b.state === 'missing');

    return {
      shot: {
        id: shot.id,
        number: shot.shotNumber,
        sceneId: shot.sceneId,
        sceneTitle: shot.scene.title,
        durationSeconds: shot.durationSeconds,
        description: shot.description,
        cameraPreset: shot.cameraPreset,
        lightingPreset: shot.lightingPreset,
        renderMode: shot.renderMode,
        status: shot.status,
      },
      characters: characters.map((c) => ({
        id: c.id,
        code: c.internalCode,
        name: c.name,
        versionId: c.currentVersionId,
      })),
      environment: location,
      props: prop ? [{ code: prop.internalCode, ready: Boolean(propProfile?.productionReady) }] : [],
      dialogue: dialogues,
      animationPackage: pkg,
      continuityDependencies: shot.scene.episode.nextEpisodeSeed,
      guardianScore: null,
      renderStatus: shot.status,
      blockers,
      canAdvanceToNativeDraft: hardBlockers.length === 0,
      blockerSummary:
        hardBlockers.length === 0
          ? 'No hard blockers.'
          : `Cannot advance to native draft render. ${hardBlockers.map((b) => b.detail).join('; ')}`,
    };
  }
}

export class EpisodeReadinessAggregator {
  async buildChecklist(episodeId: string) {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        storyboard: true,
        scenes: { include: { shots: true, location: true } },
        dialogues: true,
      },
    });
    if (!episode) throw new AppError('Episode not found', 'EPISODE_NOT_FOUND', 404);

    const [pip, goat] = await Promise.all([
      characterService.getByCode(FOUNDING_CODES.PIP),
      characterService.getByCode(FOUNDING_CODES.GOAT),
    ]);
    const meadow = await prisma.location.findFirst({ where: { internalCode: MEADOW_CODE } });
    const propBundle = await new PropOnboardingService().ensureMapPropProfile();
    const blender = await new BlenderWorkerHealthService().status();
    const latestRun = await prisma.episodePipelineRun.findFirst({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
      include: { stages: true },
    });

    const hasModel = async (characterId: string) =>
      Boolean(
        await prisma.productionAssetIntake.findFirst({
          where: {
            entityType: 'character',
            entityId: characterId,
            kind: { in: ['CHARACTER_BLEND', 'CHARACTER_GLB'] },
            storageLocation: { not: null },
          },
        }),
      );

    const pipModel = await hasModel(pip.id);
    const goatModel = await hasModel(goat.id);
    const pipVoice = await prisma.voiceProductionConfig.findUnique({ where: { characterId: pip.id } });
    const goatVoice = await prisma.voiceProductionConfig.findUnique({
      where: { characterId: goat.id },
    });
    const meadowReady = meadow
      ? Boolean(
          await prisma.productionAssetIntake.findFirst({
            where: {
              entityType: 'location',
              entityId: meadow.id,
              kind: 'LOCATION_BLEND',
              storageLocation: { not: null },
            },
          }),
        )
      : false;

    const draftReview = await prisma.draftReview.findFirst({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
    });

    const items: Array<{
      category: string;
      state: 'READY' | 'WARNING' | 'BLOCKED' | 'NOT_CONFIGURED';
      reason: string;
      fixHref: string;
    }> = [
      {
        category: 'STORY',
        state: episode.status === 'APPROVED' || episode.status === 'IN_PRODUCTION' ? 'READY' : 'BLOCKED',
        reason: `Episode status ${episode.status}`,
        fixHref: '/vertical-slice',
      },
      {
        category: 'CONTINUITY',
        state: 'READY',
        reason: 'Founding continuity seeded; Guardian hard-conflict gate active.',
        fixHref: '/continuity',
      },
      {
        category: 'STORYBOARD',
        state: episode.storyboard.length ? 'READY' : 'BLOCKED',
        reason: episode.storyboard.length ? 'Storyboard present' : 'Storyboard missing',
        fixHref: '/storyboards',
      },
      {
        category: 'SHOTS',
        state: episode.scenes.some((s) => s.shots.length) ? 'READY' : 'BLOCKED',
        reason: `${episode.scenes.reduce((n, s) => n + s.shots.length, 0)} shots`,
        fixHref: `/episodes/${episodeId}/shots`,
      },
      {
        category: 'PIP',
        state: pipModel ? 'WARNING' : 'BLOCKED',
        reason: pipModel
          ? 'Model uploaded — validation/approval still required'
          : 'BLOCKED — Pip production model required',
        fixHref: '/asset-intake#pip',
      },
      {
        category: 'GOAT',
        state: goatModel ? 'WARNING' : 'BLOCKED',
        reason: goatModel
          ? 'Model uploaded — validation/approval still required'
          : 'BLOCKED — Goat production model required',
        fixHref: '/asset-intake#goat',
      },
      {
        category: 'MEADOW',
        state: meadowReady ? 'WARNING' : 'BLOCKED',
        reason: meadowReady
          ? 'Environment uploaded — validation pending'
          : 'BLOCKED — Meadow environment asset required',
        fixHref: '/asset-intake#meadow',
      },
      {
        category: 'PROP',
        state: propBundle?.profile.productionReady ? 'READY' : 'BLOCKED',
        reason: propBundle?.profile.productionReady
          ? 'Map prop production-ready'
          : 'BLOCKED — PROP ASSET REQUIRED',
        fixHref: '/asset-intake#props',
      },
      {
        category: 'VOICE_PIP',
        state: pipVoice?.approved ? 'READY' : 'BLOCKED',
        reason: pipVoice?.approved ? 'Pip voice approved' : 'BLOCKED — Pip voice not approved',
        fixHref: '/voices',
      },
      {
        category: 'VOICE_GOAT',
        state: goatVoice?.approved ? 'READY' : 'BLOCKED',
        reason: goatVoice?.approved ? 'Goat voice approved' : 'BLOCKED — Goat voice not approved',
        fixHref: '/voices',
      },
      {
        category: 'BLENDER',
        state: blender.blender.available ? (blender.workerOnline ? 'READY' : 'WARNING') : 'BLOCKED',
        reason: blender.blender.available
          ? blender.workerOnline
            ? 'Blender available; worker online'
            : 'Blender available; worker offline — run worker or self-test'
          : 'BLENDER EXECUTION REQUIRED',
        fixHref: '/blender-worker',
      },
      {
        category: 'AUDIO',
        state: pipVoice?.approved && goatVoice?.approved ? 'WARNING' : 'BLOCKED',
        reason: 'Audio mix waits for approved voices + picture',
        fixHref: '/audio',
      },
      {
        category: 'DRAFT_RENDER',
        state: 'BLOCKED',
        reason: 'Draft render gated on assets + worker',
        fixHref: `/episodes/${episodeId}/readiness`,
      },
      {
        category: 'QC',
        state: draftReview ? 'WARNING' : 'BLOCKED',
        reason: draftReview ? `Draft review ${draftReview.status}` : 'No draft to QC',
        fixHref: `/episodes/${episodeId}/draft-review`,
      },
      {
        category: 'FINAL_RENDER',
        state: draftReview?.status === 'APPROVED' ? 'WARNING' : 'BLOCKED',
        reason:
          draftReview?.status === 'APPROVED'
            ? 'Draft approved — final gated on GENERATE FINAL'
            : 'Final requires draft approval',
        fixHref: `/episodes/${episodeId}/draft-review`,
      },
      {
        category: 'PUBLISHING_PACKAGE',
        state: 'BLOCKED',
        reason: 'Publishing waits for final MP4; auto-publish disabled',
        fixHref: '/publishing',
      },
    ];

    for (const item of items) {
      await prisma.episodeChecklistItem.upsert({
        where: { episodeId_category: { episodeId, category: item.category } },
        update: { state: item.state, reason: item.reason, fixHref: item.fixHref },
        create: {
          episodeId,
          category: item.category,
          state: item.state,
          reason: item.reason,
          fixHref: item.fixHref,
        },
      });
    }

    const strict = await studioSettingsService.isStrictCharacterLockEnabled();
    const draftEnabled = strict
      ? items
          .filter((i) =>
            ['PIP', 'GOAT', 'MEADOW', 'PROP', 'VOICE_PIP', 'VOICE_GOAT'].includes(i.category),
          )
          .every((i) => i.state === 'READY') && blender.blender.available
      : false;

    return {
      episode,
      items,
      latestRun,
      draftEnabled,
      canGenerateFinal: draftReview?.status === 'APPROVED',
      blender,
    };
  }
}

export class ProductionManifestService {
  constructor(private readonly storage = new ProductionStorageService()) {}

  async lock(episodeId: string, kind: 'DRAFT' | 'FINAL') {
    const founding = await characterService.getFoundingCharacters();
    const refs: Array<{ versionNumber: number } | null> = [];
    const voices: Array<{ versionNumber: number } | null> = [];
    const models: Array<{ id: string; version: number } | null> = [];
    for (const c of founding) {
      refs.push(
        await prisma.approvedReferenceVersion.findFirst({
          where: { characterId: c.id },
          orderBy: { versionNumber: 'desc' },
        }),
      );
      voices.push(
        await prisma.voiceConfigVersion.findFirst({
          where: { characterId: c.id, status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
        }),
      );
      models.push(
        await prisma.productionAssetIntake.findFirst({
          where: { entityType: 'character', entityId: c.id, storageLocation: { not: null } },
          orderBy: { version: 'desc' },
        }),
      );
    }
    const episode = await prisma.episode.findUniqueOrThrow({
      where: { id: episodeId },
      include: { scenes: { include: { shots: true } } },
    });
    const settings = await studioSettingsService.getJson('PRODUCTION_SETTINGS', {
      defaultFinalProfile: 'FINAL_1080P',
      defaultDraftProfile: 'DRAFT_FAST',
      defaultFinalEngine: 'EEVEE',
      aiVideoEnabled: false,
    } as Record<string, unknown>);
    const profiles = await prisma.productionRenderProfile.findMany();
    const draftProfile = profiles.find((p) => p.code === 'DRAFT_FAST');
    const finalProfile = profiles.find((p) => p.code === 'FINAL_1080P');
    const audio = await prisma.soundClip.findMany({
      where: { universeId: episode.universeId, status: 'APPROVED' },
      take: 50,
    });
    const music = await prisma.musicTrack.findMany({
      where: { universeId: episode.universeId, status: 'APPROVED' },
      take: 20,
    });
    const animations = await prisma.animationDefinition.findMany({
      where: { universeId: episode.universeId, approved: true },
      take: 100,
    });
    const renderJobs = await prisma.renderJob.findMany({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const costs = await prisma.costLedgerEntry.findMany({
      where: { episodeId },
      take: 100,
    });
    const defaultEngine = String(settings.defaultFinalEngine ?? 'EEVEE');
    const manifest = {
      episodeId,
      episodeVersion: episode.updatedAt.toISOString(),
      kind,
      lockedAt: new Date().toISOString(),
      story: { title: episode.title, status: episode.status, version: episode.status },
      shots: episode.scenes.flatMap((s) =>
        s.shots.map((sh) => {
          const job = renderJobs.find((j) => j.shotId === sh.id);
          return {
            id: sh.id,
            n: sh.shotNumber,
            cameraPreset: sh.cameraPreset,
            lightingPreset: sh.lightingPreset,
            renderMode: sh.renderMode,
            renderEngine: job?.engine ?? defaultEngine,
            renderPreset: kind === 'FINAL' ? 'FINAL_1080P' : 'DRAFT_FAST',
          };
        }),
      ),
      characters: await Promise.all(
        founding.map(async (c, i) => {
          const pkg = await prisma.characterCanonicalPackage.findUnique({
            where: { characterId: c.id },
          });
          const rig = await prisma.characterRig.findFirst({
            where: { characterId: c.id },
            orderBy: { createdAt: 'desc' },
          });
          return {
            characterId: c.id,
            code: c.internalCode,
            dnaVersion: pkg?.dnaVersion ?? null,
            referenceVersion: refs[i]?.versionNumber ?? null,
            modelVersion: models[i]?.version ?? null,
            modelIntakeId: models[i]?.id ?? null,
            rigVersion: rig?.id ?? null,
            materialVersion: null,
            voiceVersion: voices[i]?.versionNumber ?? null,
            animationVersions: [],
            accessoryState:
              c.internalCode === 'CHAR_PIP_001'
                ? { backpack: 'PRESENT', starCharm: 'PRESENT' }
                : { collar: 'PRESENT', goatTag: 'PRESENT', tagText: 'GOAT' },
          };
        }),
      ),
      pipVersion: (() => {
        const i = founding.findIndex((c) => c.internalCode === 'CHAR_PIP_001');
        return i >= 0
          ? {
              characterId: founding[i]!.id,
              code: 'CHAR_PIP_001',
              modelVersion: models[i]?.version ?? null,
              referenceVersion: refs[i]?.versionNumber ?? null,
              voiceVersion: voices[i]?.versionNumber ?? null,
              accessoryState: { backpack: 'PRESENT', starCharm: 'PRESENT' },
            }
          : null;
      })(),
      goatVersion: (() => {
        const i = founding.findIndex((c) => c.internalCode === 'CHAR_GOAT_001');
        return i >= 0
          ? {
              characterId: founding[i]!.id,
              code: 'CHAR_GOAT_001',
              modelVersion: models[i]?.version ?? null,
              referenceVersion: refs[i]?.versionNumber ?? null,
              voiceVersion: voices[i]?.versionNumber ?? null,
              accessoryState: { collar: 'PRESENT', goatTag: 'PRESENT', tagText: 'GOAT' },
            }
          : null;
      })(),
      animations: animations.map((a) => ({ code: a.code, version: 1, approved: a.approved })),
      cameraPresets: [
        ...new Set(
          episode.scenes.flatMap((s) => s.shots.map((sh) => sh.cameraPreset)).filter(Boolean) as string[],
        ),
      ],
      lighting: [
        ...new Set(
          episode.scenes.flatMap((s) => s.shots.map((sh) => sh.lightingPreset)).filter(Boolean) as string[],
        ),
      ],
      renderPreset: kind === 'FINAL' ? 'FINAL_1080P' : 'DRAFT_FAST',
      draftProfile: draftProfile
        ? {
            code: draftProfile.code,
            width: draftProfile.width,
            height: draftProfile.height,
            engine: draftProfile.engine,
          }
        : null,
      finalProfile: finalProfile
        ? {
            code: finalProfile.code,
            width: finalProfile.width,
            height: finalProfile.height,
            engine: finalProfile.engine,
          }
        : { code: 'FINAL_1080P', width: 1080, height: 1920, engine: 'EEVEE' },
      audioAssets: audio.map((a) => ({ code: a.code, status: a.status })),
      sfx: audio.map((a) => a.code),
      music: music.map((m) => ({ code: m.code, category: m.category })),
      guardianReport: null,
      qcReport: null,
      renderTimestamps: renderJobs.map((j) => ({
        id: j.id,
        shotId: j.shotId,
        status: j.status,
        createdAt: j.createdAt.toISOString(),
      })),
      estimatedExternalCosts: costs
        .filter((c) => !c.category.startsWith('LOCAL'))
        .reduce((sum, c) => sum + c.amountUnits, 0),
      actualExternalCosts: costs
        .filter((c) => !c.category.startsWith('LOCAL'))
        .reduce((sum, c) => sum + c.amountUnits, 0),
      localComputeUnits: costs
        .filter((c) => c.category.startsWith('LOCAL'))
        .reduce((sum, c) => sum + c.amountUnits, 0),
      aiVideoEnabledDefault: false,
      profile: 'DOODLE_DASH_SHORTS',
      output: { width: 1080, height: 1920, fps: 30, engine: 'EEVEE' },
      philosophy: 'CREATE_ONCE_VALIDATE_VERSION_LOCK_REUSE_ASSEMBLE_RENDER',
    };
    const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    const stored = await this.storage.storeUpload({
      category: 'manifests',
      parts: [episodeId, kind, Date.now()],
      bytes,
      contentType: 'application/json',
      originalName: `${kind.toLowerCase()}-manifest.json`,
    });
    return prisma.productionManifest.create({
      data: {
        episodeId,
        kind,
        locked: true,
        manifest,
        storageKey: stored.storageKey,
      },
    });
  }
}

export class DraftFinalOrchestrator {
  async generateFirstDraft(episodeId: string, profileCode: 'DRAFT_FAST' | 'DRAFT_HD' = 'DRAFT_FAST') {
    const strict = await studioSettingsService.isStrictCharacterLockEnabled();
    if (!strict) {
      throw new AppError('STRICT_CHARACTER_LOCK must remain enabled.', 'CHARACTER_LOCK_REQUIRED', 409);
    }
    const checklist = await new EpisodeReadinessAggregator().buildChecklist(episodeId);
    if (!checklist.draftEnabled) {
      throw new AppError(
        'GENERATE FIRST DRAFT blocked — required assets/voices/Blender not READY under STRICT_CHARACTER_LOCK.',
        'DRAFT_GATED',
        409,
      );
    }

    // Blender-first — never silent AI fallback.
    const { blenderFirstRouter } = await import('./cost-optimized-production');
    const route = await blenderFirstRouter.routeRender();
    if (route.path === 'PAID_AI_VIDEO') {
      throw new AppError('Draft path must use Blender.', 'BLENDER_REQUIRED_FOR_DRAFT', 409);
    }

    const prior = await prisma.episodePipelineRun.findFirst({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
      include: { stages: true },
    });
    const run = prior
      ? await buildEpisodeOrchestrator.resume(prior.id)
      : await buildEpisodeOrchestrator.start({ episodeId, durationTargetSec: 30 });

    await prisma.draftReview.create({
      data: {
        episodeId,
        pipelineRunId: run.id,
        status: 'PENDING',
        warnings: {
          note: 'Draft target — final requires manual approval after real render completes.',
          profileCode,
          route: route.path,
          engine: 'EEVEE',
        },
      },
    });

    return run;
  }

  async approveDraft(params: { draftReviewId: string; approvedBy: string }) {
    return prisma.draftReview.update({
      where: { id: params.draftReviewId },
      data: {
        status: 'APPROVED',
        approvedBy: params.approvedBy,
        approvedAt: new Date(),
      },
    });
  }

  async requestChanges(params: {
    draftReviewId: string;
    shotId?: string;
    note: string;
    createdBy?: string;
  }) {
    await prisma.draftReview.update({
      where: { id: params.draftReviewId },
      data: { status: 'CHANGES_REQUESTED' },
    });
    return prisma.draftReviewNote.create({
      data: {
        draftReviewId: params.draftReviewId,
        shotId: params.shotId ?? null,
        note: params.note,
        createdBy: params.createdBy ?? null,
      },
    });
  }

  async generateFinal(
    episodeId: string,
    opts?: { debugOverride?: boolean; profileCode?: 'FINAL_1080P' | 'PREMIUM' },
  ) {
    const draft = await prisma.draftReview.findFirst({
      where: { episodeId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft && !opts?.debugOverride) {
      throw new AppError('Final requires an approved draft.', 'DRAFT_APPROVAL_REQUIRED', 409);
    }
    const { blenderFirstRouter, productionProfileService } = await import('./cost-optimized-production');
    await blenderFirstRouter.routeRender();
    const profileCode = opts?.profileCode ?? 'FINAL_1080P';
    const engine = await productionProfileService.resolveShotEngine({
      profileCode,
      shotEngineOverride: null,
    });
    await this.assertCharacterDriftProtection(episodeId);
    const manifest = await new ProductionManifestService().lock(episodeId, 'FINAL');
    return {
      draft,
      manifest,
      status: 'FINAL_QUEUED_WHEN_WORKER_AVAILABLE',
      profileCode,
      engine,
      resolution: { width: 1080, height: 1920, fps: 30 },
    };
  }

  async assertCharacterDriftProtection(episodeId: string) {
    void episodeId;
    const founding = await characterService.getFoundingCharacters();
    for (const character of founding) {
      const model = await prisma.productionAssetIntake.findFirst({
        where: {
          entityType: 'character',
          entityId: character.id,
          storageLocation: { not: null },
        },
        orderBy: { version: 'desc' },
      });
      const ref = await prisma.approvedReferenceVersion.findFirst({
        where: { characterId: character.id },
        orderBy: { versionNumber: 'desc' },
      });
      const voice = await prisma.voiceConfigVersion.findFirst({
        where: { characterId: character.id, status: 'APPROVED' },
        orderBy: { versionNumber: 'desc' },
      });
      if (!model || !ref || !voice) {
        throw new AppError(
          `STRICT_CHARACTER_LOCK fail-closed for ${character.internalCode}: missing model/reference/voice version.`,
          'CHARACTER_DRIFT_PROTECTION',
          409,
        );
      }
    }
    return true;
  }
}

export const productionStorageService = new ProductionStorageService();
export const characterOnboardingService = new CharacterOnboardingService();
export const facialMappingService = new FacialMappingService();
export const referenceApprovalService = new ReferenceApprovalService();
export const characterPreviewService = new CharacterPreviewService();
export const environmentOnboardingService = new EnvironmentOnboardingService();
export const propOnboardingService = new PropOnboardingService();
export const voiceOnboardingService = new VoiceOnboardingService();
export const blenderWorkerHealthService = new BlenderWorkerHealthService();
export const shotInspectorService = new ShotInspectorService();
export const episodeReadinessAggregator = new EpisodeReadinessAggregator();
export const draftFinalOrchestrator = new DraftFinalOrchestrator();
export const productionManifestService = new ProductionManifestService();
