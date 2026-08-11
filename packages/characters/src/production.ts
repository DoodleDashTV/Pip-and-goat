import {
  prisma,
  type CharacterModelStatus,
  type RegistryApprovalStatus,
} from '@doodle-dash/database';
import { AppError } from '@doodle-dash/shared';

const MODEL_STATUS_FLOW: CharacterModelStatus[] = [
  'MISSING',
  'MODELING',
  'TEXTURING',
  'RIGGING',
  'FACIAL_RIGGING',
  'REVIEW',
  'APPROVED',
  'PRODUCTION_READY',
];

export class StudioSettingsService {
  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const row = await prisma.studioSetting.findUnique({ where: { key } });
    if (!row) return fallback;
    return Boolean(row.value);
  }

  async setBoolean(key: string, value: boolean) {
    return prisma.studioSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getJson<T = unknown>(key: string, fallback: T): Promise<T> {
    const row = await prisma.studioSetting.findUnique({ where: { key } });
    if (!row || row.value === null || row.value === undefined) return fallback;
    return row.value as T;
  }

  async setJson(key: string, value: unknown) {
    return prisma.studioSetting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }

  async isStrictCharacterLockEnabled() {
    return this.getBoolean('STRICT_CHARACTER_LOCK', true);
  }
}

export class CharacterModelService {
  async listByCharacter(characterId: string) {
    return prisma.character3dModel.findMany({
      where: { characterId },
      include: { rig: true, facialRig: true, version: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStatus(modelId: string, status: CharacterModelStatus) {
    const model = await prisma.character3dModel.findUnique({ where: { id: modelId } });
    if (!model) {
      throw new AppError('3D model not found', 'MODEL_NOT_FOUND', 404);
    }

    if (status === 'PRODUCTION_READY') {
      const hasMaster = Boolean(model.masterBlendAssetId);
      const hasRig = Boolean(model.rigId);
      const hasFacial = Boolean(model.facialRigId);
      if (!hasMaster || !hasRig || !hasFacial || !model.approved) {
        throw new AppError(
          'Cannot mark PRODUCTION_READY without approved master asset, rig, facial rig, and model approval.',
          'MODEL_NOT_PRODUCTION_READY',
          409,
        );
      }

      const rig = model.rigId
        ? await prisma.characterRig.findUnique({ where: { id: model.rigId } })
        : null;
      const facial = model.facialRigId
        ? await prisma.characterFacialRig.findUnique({ where: { id: model.facialRigId } })
        : null;
      if (!rig?.approved || !facial?.approved) {
        throw new AppError(
          'Cannot mark PRODUCTION_READY until linked rig and facial rig are approved.',
          'MODEL_NOT_PRODUCTION_READY',
          409,
        );
      }
    }

    return prisma.character3dModel.update({
      where: { id: modelId },
      data: {
        status,
        productionReady: status === 'PRODUCTION_READY',
        approved: status === 'APPROVED' || status === 'PRODUCTION_READY' ? true : model.approved,
      },
    });
  }

  getStatusFlow() {
    return MODEL_STATUS_FLOW;
  }
}

export class RigService {
  async listByCharacter(characterId: string) {
    return prisma.characterRig.findMany({
      where: { characterId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAll() {
    return prisma.characterRig.findMany({
      include: { character: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class FacialRigService {
  async listByCharacter(characterId: string) {
    return prisma.characterFacialRig.findMany({
      where: { characterId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAll() {
    return prisma.characterFacialRig.findMany({
      include: { character: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class ReferenceImageService {
  async listByCharacter(characterId: string) {
    return prisma.characterReferenceImage.findMany({
      where: { characterId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async listPendingReview(universeId?: string) {
    return prisma.characterReferenceImage.findMany({
      where: {
        universeId,
        reviewStatus: { in: ['PENDING_REVIEW', 'CONFLICTING'] },
      },
      include: { character: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markConflicting(ids: string[], conflictGroup: string) {
    if (ids.length < 2) {
      throw new AppError(
        'At least two references are required to mark a conflict for human review.',
        'INVALID_CONFLICT_SET',
        400,
      );
    }
    await prisma.characterReferenceImage.updateMany({
      where: { id: { in: ids } },
      data: { reviewStatus: 'CONFLICTING', conflictGroup },
    });
    return this.listByIds(ids);
  }

  async listByIds(ids: string[]) {
    return prisma.characterReferenceImage.findMany({ where: { id: { in: ids } } });
  }
}

export class AnimationLibraryService {
  async list(universeId: string) {
    return prisma.animationDefinition.findMany({
      where: { universeId },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }
}

export class PoseLibraryService {
  async list(universeId: string) {
    return prisma.poseDefinition.findMany({
      where: { universeId },
      orderBy: { code: 'asc' },
    });
  }
}

export class ExpressionLibraryService {
  async list(universeId: string) {
    return prisma.expressionDefinition.findMany({
      where: { universeId },
      orderBy: { code: 'asc' },
    });
  }
}

export class VisemeLibraryService {
  async list() {
    return prisma.visemeDefinition.findMany({ orderBy: { code: 'asc' } });
  }
}

export type PreflightIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
};

export class CharacterPreflightService {
  constructor(private readonly settings = new StudioSettingsService()) {}

  async runForCharacter(characterId: string) {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        models: { include: { rig: true, facialRig: true } },
        rigs: true,
        facialRigs: true,
        referenceImages: true,
        visualDna: true,
      },
    });
    if (!character) {
      throw new AppError('Character not found', 'CHARACTER_NOT_FOUND', 404);
    }

    const strict = await this.settings.isStrictCharacterLockEnabled();
    const issues: PreflightIssue[] = [];

    const productionModel = character.models.find(
      (model) =>
        model.productionReady && model.approved && model.status === 'PRODUCTION_READY',
    );

    if (!productionModel) {
      issues.push({
        code: 'CHARACTER_MODEL_MISSING',
        severity: 'error',
        message: `${character.internalCode}: no PRODUCTION_READY approved 3D model.`,
      });
    }

    if (!character.rigs.some((rig) => rig.approved && rig.status === 'APPROVED')) {
      issues.push({
        code: 'RIG_MISSING',
        severity: 'error',
        message: `${character.internalCode}: no approved character rig.`,
      });
    }

    if (
      !character.facialRigs.some(
        (rig) => rig.approved && rig.status === 'APPROVED',
      )
    ) {
      issues.push({
        code: 'FACIAL_RIG_MISSING',
        severity: 'error',
        message: `${character.internalCode}: no approved facial rig.`,
      });
    }

    const approvedRefs = character.referenceImages.filter(
      (ref) => ref.reviewStatus === 'APPROVED',
    );
    if (approvedRefs.length === 0) {
      issues.push({
        code: 'REFERENCE_MISSING',
        severity: 'warning',
        message: `${character.internalCode}: no approved reference images.`,
      });
    }

    if (character.visualDna?.pendingReview) {
      issues.push({
        code: 'VISUAL_DNA_PENDING',
        severity: 'warning',
        message: `${character.internalCode}: visual DNA still pending review.`,
      });
    }

    const blocked = strict && issues.some((issue) => issue.severity === 'error');

    return {
      characterId: character.id,
      internalCode: character.internalCode,
      strictCharacterLock: strict,
      ok: !blocked,
      blocked,
      issues,
      modelStatusFlow: MODEL_STATUS_FLOW,
    };
  }

  async assertNativeRenderAllowed(characterId: string) {
    const result = await this.runForCharacter(characterId);
    if (result.blocked) {
      throw new AppError(
        `STRICT_CHARACTER_LOCK blocked native render for ${result.internalCode}: ${result.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.code)
          .join(', ')}`,
        'CHARACTER_LOCK_BLOCKED',
        409,
      );
    }
    return result;
  }
}

export function assertValidRegistryTransition(
  from: RegistryApprovalStatus,
  to: RegistryApprovalStatus,
) {
  if (from === to) return;
  const allowed: Record<RegistryApprovalStatus, RegistryApprovalStatus[]> = {
    MISSING: ['DRAFT', 'REVIEW'],
    DRAFT: ['REVIEW', 'MISSING'],
    REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['REVIEW'],
    REJECTED: ['DRAFT', 'REVIEW'],
  };
  if (!allowed[from].includes(to)) {
    throw new AppError(
      `Invalid registry status transition ${from} -> ${to}`,
      'INVALID_STATUS_TRANSITION',
      400,
    );
  }
}

export const studioSettingsService = new StudioSettingsService();
export const characterModelService = new CharacterModelService();
export const rigService = new RigService();
export const facialRigService = new FacialRigService();
export const referenceImageService = new ReferenceImageService();
export const animationLibraryService = new AnimationLibraryService();
export const poseLibraryService = new PoseLibraryService();
export const expressionLibraryService = new ExpressionLibraryService();
export const visemeLibraryService = new VisemeLibraryService();
export const characterPreflightService = new CharacterPreflightService();
