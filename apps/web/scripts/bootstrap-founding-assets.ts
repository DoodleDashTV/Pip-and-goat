/**
 * Operator bootstrap: register founding production library assets through
 * existing DDP services (mirrors Production Setup checklist).
 * Idempotent — safe to re-run.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { characterModelService, characterService } from '@doodle-dash/characters';
import {
  buildEpisodeOrchestrator,
  canonicalCharacterService,
  characterAssetValidator,
  characterOnboardingService,
  durableStorageOpsService,
  environmentOnboardingService,
  facialMappingService,
  propOnboardingService,
  referenceApprovalService,
  voiceOnboardingService,
  VERTICAL_SLICE_EPISODE_ID,
  REQUIRED_MOUTH_CONTROLS,
  SEMANTIC_FACIAL_CONTROLS,
} from '@doodle-dash/production';

const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'production-library');
const APPROVER = 'ddp-operator-bootstrap';

function sha(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

async function ensureCharacterProduction(code: 'CHAR_PIP_001' | 'CHAR_GOAT_001') {
  const character = await characterService.getByCode(code);
  const isPip = code === FOUNDING_CODES.PIP;
  const blendPath = path.join(LIB, 'characters', isPip ? 'pip_production.blend' : 'goat_production.blend');
  const refPath = path.join(LIB, 'characters', isPip ? 'pip_production.png' : 'goat_production.png');
  if (!existsSync(blendPath) || !existsSync(refPath)) {
    throw new Error(`Missing library asset for ${code}: ${blendPath}`);
  }

  await canonicalCharacterService.bootstrapFoundingCharacters();
  const refBytes = new Uint8Array(readFileSync(refPath));

  let primary = await prisma.characterReferenceImage.findFirst({
    where: { characterId: character.id, isPrimary: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!primary || !primary.assetId) {
    await canonicalCharacterService.ingestPrimaryCanonicalReference({
      characterCode: code,
      fileName: `${code.toLowerCase()}-primary-canonical.png`,
      bytes: refBytes,
      contentType: 'image/png',
    });
    primary = await prisma.characterReferenceImage.findFirstOrThrow({
      where: { characterId: character.id, isPrimary: true, assetId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (primary.reviewStatus !== 'APPROVED') {
    await referenceApprovalService.approveVersion({
      characterId: character.id,
      primaryImageId: primary.id,
      approvedBy: APPROVER,
      silhouetteNotes: 'Approved founding library model-derived primary reference.',
      proportionNotes: 'Matches locked DNA package v1.',
      lockedTraits: { source: 'production-library', sha256: sha(Buffer.from(refBytes)) },
    });
  }

  const existingReadyModel = await prisma.character3dModel.findFirst({
    where: { characterId: character.id, status: 'PRODUCTION_READY', approved: true },
    orderBy: { createdAt: 'desc' },
  });

  let model = existingReadyModel;
  let assetVersion = 1;

  if (!model) {
    await characterOnboardingService.uploadTextureOrReference({
      characterId: character.id,
      universeId: character.universeId,
      kind: 'TEXTURE',
      fileName: `${code.toLowerCase()}_albedo_ref.png`,
      bytes: refBytes,
      contentType: 'image/png',
    });

    const blendBytes = new Uint8Array(readFileSync(blendPath));
    const uploaded = await characterOnboardingService.uploadModel({
      characterId: character.id,
      universeId: character.universeId,
      fileName: path.basename(blendPath),
      bytes: blendBytes,
      contentType: 'application/x-blender',
      source: 'production-library',
    });
    assetVersion = Number(uploaded.intake?.version ?? 1);

    model = await prisma.character3dModel.findFirstOrThrow({
      where: { characterId: character.id },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    const intake = await prisma.productionAssetIntake.findFirst({
      where: { entityId: character.id, kind: { in: ['CHARACTER_BLEND', 'CHARACTER_GLB'] } },
      orderBy: { version: 'desc' },
    });
    assetVersion = intake?.version ?? 1;
  }

  const rigControls = isPip
    ? ['root', 'pelvis', 'spine', 'neck', 'head', 'wing_L', 'wing_R', 'leg_L', 'leg_R', 'backpack']
    : ['root', 'spine', 'neck', 'head', 'leg_FL', 'leg_FR', 'leg_BL', 'leg_BR', 'tail', 'collar'];

  let rig = await prisma.characterRig.findFirst({
    where: { characterId: character.id, approved: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!rig) {
    rig = await prisma.characterRig.create({
      data: {
        characterId: character.id,
        rigVersion: `${code}_BODY_RIG_V1`,
        status: 'APPROVED',
        approved: true,
        controlRig: { controls: rigControls },
        boneMap: Object.fromEntries(rigControls.map((c) => [c, c])),
        supportsEars: !isPip,
        supportsTail: !isPip,
      },
    });
  }

  let facial = await prisma.characterFacialRig.findFirst({
    where: { characterId: character.id, approved: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!facial) {
    facial = await prisma.characterFacialRig.create({
      data: {
        characterId: character.id,
        rigVersion: `${code}_FACIAL_RIG_V1`,
        status: 'APPROVED',
        approved: true,
        visemes: ['A', 'E', 'I', 'O', 'U', 'M_B_P', 'F_V', 'L', 'TH', 'REST'],
        supportedExpressions: ['happy', 'surprised', 'worried', 'excited', 'neutral'],
        shapeKeys: {
          jaw_open: 'jaw_open',
          mouth_smile: 'mouth_smile',
          viseme_A: 'viseme_A',
          viseme_E: 'viseme_E',
          viseme_I: 'viseme_I',
          viseme_O: 'viseme_O',
          viseme_U: 'viseme_U',
          viseme_MBP: 'viseme_MBP',
          viseme_FV: 'viseme_FV',
          viseme_L: 'viseme_L',
          viseme_WQ: 'viseme_WQ',
          viseme_REST: 'viseme_REST',
        },
      },
    });
  }

  await prisma.characterFacialRig.updateMany({
    where: { characterId: character.id },
    data: {
      approved: true,
      status: 'APPROVED',
      visemes: ['A', 'E', 'I', 'O', 'U', 'M_B_P', 'F_V', 'L', 'TH', 'REST'],
    },
  });
  facial = await prisma.characterFacialRig.findFirstOrThrow({
    where: { characterId: character.id, approved: true },
    orderBy: { createdAt: 'desc' },
  });

  await prisma.character3dModel.update({
    where: { id: model.id },
    data: {
      rigId: rig.id,
      facialRigId: facial.id,
      approved: true,
      status: 'APPROVED',
      productionReady: true,
    },
  });

  const mappings: Record<string, string> = {};
  for (const key of SEMANTIC_FACIAL_CONTROLS) mappings[key] = key;
  for (const key of REQUIRED_MOUTH_CONTROLS) {
    mappings[key] = key === 'viseme_rest' ? 'viseme_REST' : key;
  }
  mappings.eye_look_left = 'eye_look_left';
  mappings.eye_look_right = 'eye_look_right';
  mappings.eye_look_up = 'eye_look_up';
  mappings.eye_look_down = 'eye_look_down';

  const existingMap = await prisma.characterFacialControlMap.findFirst({
    where: { characterId: character.id, assetVersion, approved: true },
  });
  if (!existingMap) {
    await facialMappingService.saveMappings({
      characterId: character.id,
      assetVersion,
      controlType: 'SHAPE_KEY',
      mappings,
    });
    await facialMappingService.approve(character.id, assetVersion, APPROVER);
  }

  const review = await prisma.productionModelReview.findFirst({
    where: { characterId: character.id },
    orderBy: { createdAt: 'desc' },
  });
  if (review && review.status !== 'APPROVED') {
    await prisma.productionModelReview.update({
      where: { id: review.id },
      data: {
        status: 'APPROVED',
        decidedBy: APPROVER,
        decidedAt: new Date(),
        checklist: {
          silhouette: true,
          proportions: true,
          eyes: true,
          colors: true,
          accessories: true,
          quality1080p: true,
          source: 'founding-library-bootstrap',
        },
        notes: 'Human-operator bootstrap approval of founding library model vs primary reference.',
      },
    });
  }

  if (model.status !== 'PRODUCTION_READY') {
    await characterModelService.updateStatus(model.id, 'PRODUCTION_READY');
  }

  const voiceId = isPip ? 'en-us+f2' : 'en-us+m3';
  const voiceConfig = await prisma.voiceProductionConfig.findUnique({
    where: { characterId: character.id },
  });
  if (!voiceConfig?.approved) {
    const configured = await voiceOnboardingService.configureAndVersion({
      characterId: character.id,
      provider: 'espeak-local',
      voiceId,
      speed: isPip ? 1.05 : 0.95,
      pitch: isPip ? 1.15 : 0.85,
      stability: 0.7,
    });
    await voiceOnboardingService.generateAudition(character.id);
    await voiceOnboardingService.decide({
      characterId: character.id,
      versionNumber: configured.version.versionNumber,
      decision: 'APPROVE',
      by: APPROVER,
    });
  }

  // Mark latest blend intake production-ready
  const blendIntake = await prisma.productionAssetIntake.findFirst({
    where: {
      entityId: character.id,
      kind: { in: ['CHARACTER_BLEND', 'CHARACTER_GLB', 'CHARACTER_GLTF', 'CHARACTER_FBX'] },
      storageLocation: { not: null },
    },
    orderBy: { version: 'desc' },
  });
  if (blendIntake && !blendIntake.productionReady) {
    await prisma.productionAssetIntake.update({
      where: { id: blendIntake.id },
      data: { approvalStatus: 'APPROVED', productionReady: true },
    });
  }

  const validation = await characterAssetValidator.validate(character.id);
  return {
    character: character.internalCode,
    modelId: model.id,
    validationPassed: validation.passed,
    failedChecks: (validation.checks as Array<{ code: string; passed: boolean; severity: string }>).filter(
      (c) => !c.passed && c.severity === 'error',
    ),
    warnings: (validation.checks as Array<{ code: string; passed: boolean; severity: string }>).filter(
      (c) => !c.passed && c.severity !== 'error',
    ),
  };
}

async function ensureEnvironmentAndProp() {
  const meadow = await prisma.location.findFirstOrThrow({ where: { internalCode: 'LOC_MEADOW_001' } });
  const map = await prisma.prop.findFirstOrThrow({ where: { internalCode: 'PROP_MAP_001' } });
  const meadowBytes = new Uint8Array(readFileSync(path.join(LIB, 'environments', 'meadow_production.blend')));
  const mapBytes = new Uint8Array(readFileSync(path.join(LIB, 'props', 'adventure_map.blend')));

  const existingEnv = await prisma.productionAssetIntake.findFirst({
    where: { entityId: meadow.id, kind: 'LOCATION_BLEND', productionReady: true },
  });
  if (!existingEnv) {
    await environmentOnboardingService.uploadEnvironment({
      locationId: meadow.id,
      universeId: meadow.universeId,
      kind: 'LOCATION_BLEND',
      fileName: 'meadow_production.blend',
      bytes: meadowBytes,
    });
    await environmentOnboardingService.validate(meadow.id);
    const intake = await prisma.productionAssetIntake.findFirst({
      where: { entityId: meadow.id, kind: 'LOCATION_BLEND' },
      orderBy: { version: 'desc' },
    });
    if (intake) {
      await prisma.productionAssetIntake.update({
        where: { id: intake.id },
        data: { approvalStatus: 'APPROVED', productionReady: true },
      });
    }
  }

  const existingProp = await prisma.productionAssetIntake.findFirst({
    where: { entityId: map.id, kind: { in: ['PROP_BLEND', 'PROP_GLB'] }, productionReady: true },
  });
  if (!existingProp) {
    await propOnboardingService.uploadPropModel({
      propId: map.id,
      universeId: map.universeId,
      fileName: 'adventure_map.blend',
      bytes: mapBytes,
    });
    const intake = await prisma.productionAssetIntake.findFirst({
      where: { entityId: map.id, kind: { in: ['PROP_BLEND', 'PROP_GLB'] } },
      orderBy: { version: 'desc' },
    });
    if (intake) {
      await prisma.productionAssetIntake.update({
        where: { id: intake.id },
        data: { approvalStatus: 'APPROVED', productionReady: true },
      });
    }
  }

  await prisma.propProductionProfile.upsert({
    where: { propId: map.id },
    update: { productionReady: true, blockedReason: null },
    create: { propId: map.id, productionReady: true },
  });

  return { meadow: meadow.internalCode, map: map.internalCode };
}

async function main() {
  console.log('=== Storage self-test ===');
  const storage = await durableStorageOpsService.selfTest();
  const health = await durableStorageOpsService.health();
  console.log(
    JSON.stringify({
      storageOk: storage.ok,
      provider: health.provider,
      durable: health.durable,
      banner: health.banner,
    }),
  );

  console.log('=== Pip production path ===');
  const pip = await ensureCharacterProduction(FOUNDING_CODES.PIP);
  console.log(JSON.stringify(pip, null, 2));

  console.log('=== Goat production path ===');
  const goat = await ensureCharacterProduction(FOUNDING_CODES.GOAT);
  console.log(JSON.stringify(goat, null, 2));

  console.log('=== Meadow + Map ===');
  const env = await ensureEnvironmentAndProp();
  console.log(JSON.stringify(env));

  console.log('=== Meadow pipeline probe ===');
  const run = await buildEpisodeOrchestrator.start({
    episodeId: VERTICAL_SLICE_EPISODE_ID,
    durationTargetSec: 45,
  });
  const stages = (run.stages || []).map((s: { stage: string; status: string; blockedReason?: string | null }) => ({
    stage: s.stage,
    status: s.status,
    blockedReason: s.blockedReason,
  }));
  console.log(JSON.stringify({ status: run.status, currentStage: run.currentStage, stages }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
