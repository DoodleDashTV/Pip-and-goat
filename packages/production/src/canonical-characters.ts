import { createHash } from 'crypto';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';
import {
  CharacterOnboardingService,
  ReferenceApprovalService,
  REQUIRED_MOUTH_CONTROLS,
  SEMANTIC_FACIAL_CONTROLS,
} from './launch-prep';
import { referenceLockService } from './readiness';

export const REFERENCE_VIEW_SLOTS = [
  'PRIMARY',
  'FRONT',
  'THREE_QUARTER',
  'SIDE',
  'BACK',
  'EXPRESSION_SHEET',
  'POSE_SHEET',
  'COLOR_REFERENCE',
] as const;

export const EXTENDED_CHARACTER_TEST_POSES = [
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

export const MINIMUM_VISEMES = [
  'REST',
  'A',
  'E',
  'I',
  'O',
  'U',
  'MBP',
  'FV',
  'L',
  'WQ',
] as const;

export const REQUIRED_SEMANTIC_FACIAL = [
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
] as const;

export const SHARED_VISUAL_STYLE_LOCK = {
  style: 'High-quality stylized 3D children’s animation',
  characteristics: [
    'soft tactile surfaces',
    'rounded geometry',
    'expressive oversized eyes',
    'bright cheerful colors',
    'cinematic but friendly lighting',
    'high material quality',
    'soft shadows',
    'rich environmental color',
    'professional animated-film presentation',
    'clean silhouettes',
    'high facial readability',
    'strong mobile-screen readability',
  ],
  forbiddenLooks: [
    'photorealistic',
    'flat 2D',
    'cheap plastic',
    'low-poly',
    'hyper-real animal',
    'uncanny',
    'adult-oriented',
    'dark/gritty',
  ],
  finalDelivery: { width: 1080, height: 1920, aspect: '9:16', fps: 30, engine: 'EEVEE' },
} as const;

export const PIP_CANONICAL_DNA = {
  characterCode: FOUNDING_CODES.PIP,
  dnaVersion: 1,
  species: 'Anthropomorphic young chick',
  body: {
    primaryColor: 'Warm saturated golden yellow',
    surface: 'Soft short feather/fuzz — tactile, not plastic',
    proportions:
      'Large childlike head, compact rounded pear/egg torso, rounded belly, short legs, small wing-arms, oversized expressive face',
    personalityVisual: ['curiosity', 'optimism', 'courage', 'friendliness', 'wonder', 'energy', 'childlike excitement'],
  },
  head: {
    comb: 'Distinctive RED comb with ~3 major rounded lobes; center/top lobe tallest — major silhouette feature',
    eyes: 'Extremely large; warm brown iris; black pupil; white sclera; large catchlights; dark upper eyelid/lash',
    eyebrows: 'Dark brown, thick, curved, highly expressive',
    beak: 'Small rounded orange beak, low between eyes; warm reddish/orange mouth interior; tongue when appropriate',
  },
  appendages: {
    feet: 'Orange bird legs/feet; stylized ~3 rounded forward toes; cute not anatomically harsh',
    wings: 'Expressive arm-like wings supporting wave/point/hold/reach/celebrate/hug gestures',
  },
  accessories: {
    backpack: {
      code: 'PIP_PURPLE_BACKPACK',
      defaultState: 'PRESENT',
      description: 'Purple backpack with magenta front pocket, purple straps, gold/yellow STAR charm',
      detachable: true,
      trackPerShot: true,
    },
  },
  forbiddenDrift: [
    'duck',
    'generic bird',
    'realistic chicken',
    'adult chicken',
    'different colored chick',
    'plastic mascot',
    'realistic human anatomy',
    'remove/recolor red comb',
    'small/non-brown eyes',
    'remove purple backpack when canonically present',
  ],
  rigControls: [
    'global/root',
    'body/pelvis',
    'head',
    'neck',
    'left wing',
    'right wing',
    'left leg',
    'right leg',
    'feet',
    'eye aim',
    'left blink',
    'right blink',
    'eyebrows',
    'jaw',
    'mouth',
    'facial expressions',
    'backpack',
    'backpack straps',
  ],
} as const;

export const GOAT_CANONICAL_DNA = {
  characterCode: FOUNDING_CODES.GOAT,
  dnaVersion: 1,
  species: 'Young stylized goat',
  body: {
    primaryColor: 'Warm cream / off-white',
    surface: 'Soft short fur; fluffier cheeks/chest/head tuft/beard — tactile, not plastic',
    proportions:
      'Large expressive head, compact young-goat body, four sturdy legs, slightly oversized stylized hooves, rounded belly/chest — NOT adult-goat proportions',
    personalityVisual: ['loyalty', 'playfulness', 'warmth', 'humor', 'friendliness', 'slight goofiness', 'adventurousness'],
  },
  head: {
    horns: 'Two prominent curled brown horns upward/backward with ridged segments — major silhouette',
    eyes: 'Extremely large; warm dark brown iris; black pupil; white sclera; large catchlights',
    eyebrows: 'Dark brown, thick, curved, highly expressive',
    ears: 'Large outward-facing; warm pink inner ear',
    nose: 'Small coral-pink/orange rounded friendly nose — not black realistic',
    muzzle: 'Rounded cream muzzle, child-animation proportions',
    beard: 'Small soft cream beard under chin',
    headTuft: 'Small swept cream forelock between/near horns',
  },
  appendages: {
    hooves: 'Dark brown rounded stylized cloven hooves',
    tail: 'Short fluffy goat tail; upward in happy/neutral; secondary motion',
  },
  accessories: {
    collar: {
      code: 'GOAT_BLUE_COLLAR_TAG',
      defaultState: 'PRESENT',
      description: 'Bright medium-blue collar with round gold/yellow medallion reading GOAT in dark/black lettering',
      independentlyControllable: true,
      trackPerShot: true,
    },
  },
  forbiddenDrift: [
    'sheep',
    'ram',
    'deer',
    'realistic adult goat',
    'intimidating animal',
    'different species',
    'remove/tiny/straight/white horns or antlers',
    'remove blue collar or GOAT tag',
    'change cream fur or large brown eyes',
  ],
  rigControls: [
    'global/root',
    'body/spine',
    'neck',
    'head',
    'front-left leg',
    'front-right leg',
    'rear-left leg',
    'rear-right leg',
    'hooves',
    'tail',
    'left ear',
    'right ear',
    'eyes',
    'left blink',
    'right blink',
    'eyebrows',
    'jaw',
    'mouth',
    'facial expressions',
    'collar',
    'GOAT tag',
  ],
} as const;

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function dnaForCode(code: string) {
  if (code === FOUNDING_CODES.PIP) return PIP_CANONICAL_DNA;
  if (code === FOUNDING_CODES.GOAT) return GOAT_CANONICAL_DNA;
  throw new AppError(`No canonical DNA for ${code}`, 'UNKNOWN_CANONICAL_CHARACTER', 400);
}

export class CanonicalCharacterService {
  async lockVisualDna(characterCode: string = FOUNDING_CODES.PIP) {
    const character = await prisma.character.findUniqueOrThrow({
      where: { internalCode: characterCode },
    });
    const dna = dnaForCode(characterCode);
    const visualRestrictions = [
      `DNA_VERSION=${dna.dnaVersion}`,
      'IMMUTABLE after package lock — changes require new DNA version + review.',
      ...dna.forbiddenDrift,
    ].join('\n');

    const accessories =
      characterCode === FOUNDING_CODES.PIP
        ? JSON.stringify(PIP_CANONICAL_DNA.accessories)
        : JSON.stringify(GOAT_CANONICAL_DNA.accessories);

    const visual = await prisma.characterVisualDna.upsert({
      where: { characterId: character.id },
      update: {
        bodyProportions: dna.body.proportions,
        headRatio: 'Large expressive head relative to compact youthful body',
        faceShape: characterCode === FOUNDING_CODES.PIP ? 'Rounded chick silhouette' : 'Rounded goat muzzle + large head',
        eyeDesign: dna.head.eyes,
        bodyColoration: dna.body.primaryColor,
        furFeatherDetails: dna.body.surface,
        clothing: null,
        accessories,
        silhouette:
          characterCode === FOUNDING_CODES.PIP
            ? 'Red 3-lobe comb + golden chick + purple backpack'
            : 'Curled brown horns + cream goat + blue collar/GOAT tag',
        palette: dna.body.primaryColor,
        materials: 'Soft tactile children’s animation materials — not plastic',
        textures: dna.body.surface,
        visualRestrictions,
        pendingReview: false,
      },
      create: {
        characterId: character.id,
        bodyProportions: dna.body.proportions,
        headRatio: 'Large expressive head relative to compact youthful body',
        faceShape: characterCode === FOUNDING_CODES.PIP ? 'Rounded chick silhouette' : 'Rounded goat muzzle + large head',
        eyeDesign: dna.head.eyes,
        bodyColoration: dna.body.primaryColor,
        furFeatherDetails: dna.body.surface,
        accessories,
        silhouette:
          characterCode === FOUNDING_CODES.PIP
            ? 'Red 3-lobe comb + golden chick + purple backpack'
            : 'Curled brown horns + cream goat + blue collar/GOAT tag',
        palette: dna.body.primaryColor,
        materials: 'Soft tactile children’s animation materials — not plastic',
        textures: dna.body.surface,
        visualRestrictions,
        pendingReview: false,
      },
    });

    const packageRow = await prisma.characterCanonicalPackage.upsert({
      where: { characterId: character.id },
      update: {
        dnaVersion: dna.dnaVersion,
        lockedTraits: dna,
        styleLock: SHARED_VISUAL_STYLE_LOCK,
        accessoryCanon: dna.accessories,
        rigRequirements: dna.rigControls,
        facialRequirements: REQUIRED_SEMANTIC_FACIAL,
        visemeRequirements: MINIMUM_VISEMES,
        immutable: true,
        notes:
          'Canonical visual DNA locked from PRIMARY reference specification. JPEG reference and production 3D model remain separate gates.',
      },
      create: {
        characterId: character.id,
        characterCode,
        dnaVersion: dna.dnaVersion,
        lockedTraits: dna,
        styleLock: SHARED_VISUAL_STYLE_LOCK,
        accessoryCanon: dna.accessories,
        rigRequirements: dna.rigControls,
        facialRequirements: REQUIRED_SEMANTIC_FACIAL,
        visemeRequirements: MINIMUM_VISEMES,
        immutable: true,
        notes:
          'Canonical visual DNA locked from PRIMARY reference specification. JPEG reference and production 3D model remain separate gates.',
      },
    });

    return { character, visual, package: packageRow, dna };
  }

  async ensureReferenceSlots(characterCode: string) {
    const character = await prisma.character.findUniqueOrThrow({
      where: { internalCode: characterCode },
    });
    const created = [];
    for (const view of REFERENCE_VIEW_SLOTS) {
      const title = `${character.name} ${view} reference slot`;
      const existing = await prisma.characterReferenceImage.findFirst({
        where: { characterId: character.id, viewType: view },
      });
      if (existing) {
        created.push(existing);
        continue;
      }
      created.push(
        await prisma.characterReferenceImage.create({
          data: {
            universeId: character.universeId,
            characterId: character.id,
            characterVersionId: character.currentVersionId,
            title,
            viewType: view,
            reviewStatus: 'PENDING_REVIEW',
            isPrimary: view === 'PRIMARY',
            notes:
              view === 'PRIMARY'
                ? 'PRIMARY_CANONICAL_REFERENCE slot — upload real JPEG; do not fabricate.'
                : `${view} turnaround slot — optional until supplied; do not fabricate or auto-approve.`,
          },
        }),
      );
    }
    return created;
  }

  /**
   * Ingest a real reference JPEG as PRIMARY_CANONICAL_REFERENCE candidate.
   * Never marks MODEL/RIG/FACIAL as READY.
   */
  async ingestPrimaryCanonicalReference(params: {
    characterCode: string;
    fileName: string;
    bytes: Uint8Array;
    contentType?: string;
    autoApprove?: boolean;
    approvedBy?: string;
  }) {
    if (!params.bytes.length) {
      throw new AppError('Empty reference file', 'REFERENCE_BYTES_REQUIRED', 400);
    }
    const character = await prisma.character.findUniqueOrThrow({
      where: { internalCode: params.characterCode },
    });
    await this.lockVisualDna(params.characterCode);
    await this.ensureReferenceSlots(params.characterCode);

    const onboarding = new CharacterOnboardingService();
    const uploaded = await onboarding.uploadTextureOrReference({
      characterId: character.id,
      universeId: character.universeId,
      kind: 'PRIMARY_CANONICAL_REFERENCE',
      fileName: params.fileName,
      bytes: params.bytes,
      contentType: params.contentType ?? 'image/jpeg',
    });

    const checksum = sha256(params.bytes);
    const ref = await prisma.characterReferenceImage.update({
      where: { id: uploaded.referenceImage!.id },
      data: {
        title: `${character.name} PRIMARY_CANONICAL_REFERENCE`,
        viewType: 'PRIMARY',
        isPrimary: true,
        notes: JSON.stringify({
          role: 'PRIMARY_CANONICAL_REFERENCE',
          sha256: checksum,
          fileName: params.fileName,
          storageProvider: process.env.OBJECT_STORAGE_PROVIDER ?? 'local',
          storageLocation: uploaded.stored.uri,
          uploadedAt: new Date().toISOString(),
          dnaVersion: dnaForCode(params.characterCode).dnaVersion,
          notAProductionModel: true,
        }),
      },
    });

    await prisma.productionAssetIntake.update({
      where: { id: uploaded.intake.id },
      data: {
        notes: 'Canonical visual reference JPEG — NOT a production 3D model.',
      },
    });

    let approval = null;
    if (params.autoApprove) {
      approval = await this.approvePrimaryCanonical({
        characterCode: params.characterCode,
        referenceImageId: ref.id,
        approvedBy: params.approvedBy ?? 'canonical-bootstrap',
      });
    }

    const readiness = await this.readinessMatrix(params.characterCode);
    if (readiness.productionModel === 'READY' || readiness.rig === 'READY') {
      throw new AppError(
        'Invariant violated: reference ingestion must not mark model/rig READY',
        'FALSE_PRODUCTION_READY',
        500,
      );
    }

    return {
      referenceImage: ref,
      intake: uploaded.intake,
      stored: uploaded.stored,
      checksum,
      approval,
      readiness,
      note: 'Reference ingestion complete. MODEL remains BLOCKED until a real .blend is uploaded and approved.',
    };
  }

  async approvePrimaryCanonical(params: {
    characterCode: string;
    referenceImageId: string;
    approvedBy: string;
  }) {
    const character = await prisma.character.findUniqueOrThrow({
      where: { internalCode: params.characterCode },
    });
    const dna = dnaForCode(params.characterCode);
    await this.lockVisualDna(params.characterCode);

    const version = await new ReferenceApprovalService().approveVersion({
      characterId: character.id,
      primaryImageId: params.referenceImageId,
      palette: { primary: dna.body.primaryColor, style: SHARED_VISUAL_STYLE_LOCK },
      silhouetteNotes: String(
        (await prisma.characterVisualDna.findUnique({ where: { characterId: character.id } }))
          ?.silhouette ?? '',
      ),
      proportionNotes: dna.body.proportions,
      lockedTraits: {
        role: 'PRIMARY_CANONICAL_REFERENCE',
        dnaVersion: dna.dnaVersion,
        dna,
        styleLock: SHARED_VISUAL_STYLE_LOCK,
        accessories: dna.accessories,
        immutable: true,
      },
      approvedBy: params.approvedBy,
    });

    await prisma.approvedCharacterReference.updateMany({
      where: { characterId: character.id, referenceImageId: params.referenceImageId },
      data: {
        role: 'PRIMARY_CANONICAL_REFERENCE',
        accessories: JSON.stringify(dna.accessories),
        forbiddenChanges: dna.forbiddenDrift.join('; '),
        immutable: true,
      },
    });

    await prisma.characterCanonicalPackage.update({
      where: { characterId: character.id },
      data: {
        primaryReferenceVersionId: version.id,
        primaryReferenceApprovedAt: version.approvedAt,
      },
    });

    return version;
  }

  async readinessMatrix(characterCode: string) {
    const character = await prisma.character.findUniqueOrThrow({
      where: { internalCode: characterCode },
      include: {
        models: { include: { rig: true, facialRig: true } },
        rigs: true,
        facialRigs: true,
        referenceImages: true,
        visualDna: true,
      },
    });
    const pkg = await prisma.characterCanonicalPackage.findUnique({
      where: { characterId: character.id },
    });
    const refVersion = await prisma.approvedReferenceVersion.findFirst({
      where: { characterId: character.id },
      orderBy: { versionNumber: 'desc' },
    });
    const primaryApproved =
      character.referenceImages.some(
        (r) =>
          r.isPrimary &&
          r.reviewStatus === 'APPROVED' &&
          Boolean(r.assetId) &&
          (r.viewType === 'PRIMARY' || r.viewType === 'PRIMARY_CANONICAL_REFERENCE'),
      ) || Boolean(refVersion);
    const model = character.models[0];
    const modelReady = Boolean(model?.productionReady && model.status === 'PRODUCTION_READY');
    const rigReady = character.rigs.some((r) => r.approved && r.status === 'APPROVED');
    const facialReady = character.facialRigs.some((r) => r.approved && r.status === 'APPROVED');
    const facialMap = await prisma.characterFacialControlMap.findFirst({
      where: { characterId: character.id, approved: true },
      orderBy: { createdAt: 'desc' },
    });
    const voice = await prisma.voiceProductionConfig.findUnique({
      where: { characterId: character.id },
    });
    const modelReview = await prisma.productionModelReview.findFirst({
      where: { characterId: character.id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      characterCode,
      characterId: character.id,
      canonicalId: 'READY' as const,
      canon: 'READY' as const,
      dna: pkg?.immutable && character.visualDna && !character.visualDna.pendingReview ? ('READY' as const) : ('BLOCKED' as const),
      primaryReference: primaryApproved
        ? ('READY' as const)
        : ('BLOCKED — UPLOAD+APPROVE PRIMARY_CANONICAL_REFERENCE JPEG' as const),
      productionModel: modelReady
        ? ('READY' as const)
        : ('BLOCKED — REAL MODEL REQUIRED' as const),
      rig: rigReady ? ('READY' as const) : ('BLOCKED' as const),
      facialRig: facialReady ? ('READY' as const) : ('BLOCKED' as const),
      lipSync: facialMap ? ('READY' as const) : ('BLOCKED' as const),
      voice: voice?.approved ? ('READY' as const) : voice ? ('PARTIAL' as const) : ('BLOCKED' as const),
      animation: modelReady ? ('PARTIAL' as const) : ('BLOCKED' as const),
      final1080pCharacterValidation: modelReview
        ? ('READY' as const)
        : ('BLOCKED' as const),
      dnaVersion: pkg?.dnaVersion ?? null,
      referenceVersion: refVersion?.versionNumber ?? null,
      modelStatus: model?.status ?? 'MISSING',
      productionReadyFlag: model?.productionReady ?? false,
      note: 'JPEG reference ≠ production model. Never treat reference approval as MODEL READY.',
    };
  }

  async bootstrapFoundingCharacters() {
    const results = [];
    for (const code of [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]) {
      const dna = await this.lockVisualDna(code);
      const slots = await this.ensureReferenceSlots(code);
      const readiness = await this.readinessMatrix(code);
      results.push({ code, dnaVersion: dna.package.dnaVersion, slots: slots.length, readiness });
    }
    return { styleLock: SHARED_VISUAL_STYLE_LOCK, characters: results };
  }

  defaultAccessoryState(characterCode: string) {
    if (characterCode === FOUNDING_CODES.PIP) {
      return {
        backpack: 'PRESENT',
        starCharm: 'PRESENT',
        notes: 'Default adventure/traveling state',
      };
    }
    return {
      collar: 'PRESENT',
      goatTag: 'PRESENT',
      tagText: 'GOAT',
      notes: 'Canonical collar/tag continuity',
    };
  }

  async setShotAccessoryState(params: {
    shotId: string;
    characterId: string;
    accessories: object;
  }) {
    return prisma.shotAccessoryState.upsert({
      where: {
        shotId_characterId: { shotId: params.shotId, characterId: params.characterId },
      },
      update: { accessories: params.accessories },
      create: {
        shotId: params.shotId,
        characterId: params.characterId,
        accessories: params.accessories,
      },
    });
  }

  async checkAccessoryContinuity(episodeId: string) {
    const shots = await prisma.shot.findMany({
      where: { scene: { episodeId } },
      orderBy: [{ scene: { sceneNumber: 'asc' } }, { shotNumber: 'asc' }],
    });
    const warnings: Array<{ shotId: string; message: string }> = [];
    const founding = await prisma.character.findMany({
      where: { internalCode: { in: [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT] } },
    });
    for (const character of founding) {
      let previous: object | null = null;
      for (const shot of shots) {
        const ids = Array.isArray(shot.characterIds) ? (shot.characterIds as string[]) : [];
        if (!ids.includes(character.id)) continue;
        const state = await prisma.shotAccessoryState.findUnique({
          where: { shotId_characterId: { shotId: shot.id, characterId: character.id } },
        });
        const current = (state?.accessories as object | undefined) ?? this.defaultAccessoryState(character.internalCode);
        if (previous) {
          const prevJson = JSON.stringify(previous);
          const curJson = JSON.stringify(current);
          if (prevJson !== curJson) {
            warnings.push({
              shotId: shot.id,
              message: `${character.internalCode} accessory state changed between adjacent shots without explicit note — review backpack/collar continuity.`,
            });
          }
        }
        previous = current;
      }
    }
    return { passed: warnings.length === 0, warnings };
  }

  async submitModelForReferenceReview(params: {
    characterId: string;
    modelIntakeId: string;
    referenceVersionId: string;
    checklist?: object;
  }) {
    const intake = await prisma.productionAssetIntake.findUniqueOrThrow({
      where: { id: params.modelIntakeId },
    });
    if (!intake.storageLocation) {
      throw new AppError('Model intake has no storage file', 'MODEL_FILE_REQUIRED', 409);
    }
    return prisma.productionModelReview.create({
      data: {
        characterId: params.characterId,
        modelIntakeId: params.modelIntakeId,
        referenceVersionId: params.referenceVersionId,
        status: 'PENDING',
        checklist: params.checklist ?? {
          silhouette: null,
          proportions: null,
          eyeSize: null,
          eyeColor: null,
          primaryColors: null,
          materials: null,
          surface: null,
          combOrHorns: null,
          accessories: null,
          overallIdentity: null,
          final1080pQuality: null,
          note: 'Manual side-by-side Blender render vs PRIMARY_CANONICAL_REFERENCE required. Do not claim exact replica from JPEG alone.',
        },
      },
    });
  }

  async decideModelReview(params: {
    reviewId: string;
    decision: 'APPROVED' | 'REJECTED';
    decidedBy: string;
    notes?: string;
  }) {
    if (params.decision === 'APPROVED') {
      const review = await prisma.productionModelReview.findUniqueOrThrow({
        where: { id: params.reviewId },
      });
      // Approval of review ≠ auto PRODUCTION_READY — still requires rig/facial gates via CharacterModelService.
      return prisma.productionModelReview.update({
        where: { id: params.reviewId },
        data: {
          status: 'APPROVED',
          decidedBy: params.decidedBy,
          decidedAt: new Date(),
          notes: params.notes ?? `PRODUCTION_MODEL_APPROVED pending full PRODUCTION_READY gates. character=${review.characterId}`,
        },
      });
    }
    return prisma.productionModelReview.update({
      where: { id: params.reviewId },
      data: {
        status: 'REJECTED',
        decidedBy: params.decidedBy,
        decidedAt: new Date(),
        notes: params.notes ?? null,
      },
    });
  }

  assertNotTextOnlyCharacterGeneration() {
    throw new AppError(
      'FAIL CLOSED: Pip/Goat cannot be generated from text alone. Supply approved PRIMARY_CANONICAL_REFERENCE conditioning or use locked Blender assets.',
      'TEXT_ONLY_CHARACTER_FORBIDDEN',
      409,
    );
  }
}

export class AccessoryContinuityGuardian {
  async evaluateEpisode(episodeId: string) {
    return new CanonicalCharacterService().checkAccessoryContinuity(episodeId);
  }
}

export const canonicalCharacterService = new CanonicalCharacterService();
export const accessoryContinuityGuardian = new AccessoryContinuityGuardian();

// Re-export for callers that need the facial constants already defined in launch-prep.
void SEMANTIC_FACIAL_CONTROLS;
void REQUIRED_MOUTH_CONTROLS;
void referenceLockService;
