import { prisma, type Character, type CharacterVersion } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';

const characterInclude = {
  versions: { orderBy: { versionNumber: 'asc' as const } },
  models: { include: { rig: true, facialRig: true } },
  rigs: true,
  facialRigs: true,
  referenceImages: { orderBy: { createdAt: 'asc' as const } },
  visualDna: true,
  personalityDna: true,
  motionDna: true,
  voiceDna: true,
  storyDna: true,
};

export type CharacterDetail = Awaited<ReturnType<CharacterService['getByCode']>>;

export class CharacterService {
  async listByUniverse(universeId: string) {
    return prisma.character.findMany({
      where: { universeId },
      include: {
        models: true,
        versions: { orderBy: { versionNumber: 'asc' } },
      },
      orderBy: [{ foundingCharacter: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(id: string) {
    const character = await prisma.character.findUnique({
      where: { id },
      include: characterInclude,
    });
    if (!character) {
      throw new AppError('Character not found', 'CHARACTER_NOT_FOUND', 404);
    }
    return character;
  }

  async getByCode(internalCode: string) {
    const character = await prisma.character.findUnique({
      where: { internalCode },
      include: characterInclude,
    });
    if (!character) {
      throw new AppError('Character not found', 'CHARACTER_NOT_FOUND', 404);
    }
    return character;
  }

  async getFoundingCharacters() {
    return prisma.character.findMany({
      where: {
        internalCode: { in: [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT] },
      },
      include: characterInclude,
      orderBy: { internalCode: 'asc' },
    });
  }

  async createVersion(params: {
    characterId: string;
    versionName: string;
    changeSummary?: string;
  }): Promise<CharacterVersion> {
    const latest = await prisma.characterVersion.findFirst({
      where: { characterId: params.characterId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    const version = await prisma.characterVersion.create({
      data: {
        characterId: params.characterId,
        versionNumber,
        versionName: params.versionName,
        changeSummary: params.changeSummary,
        approved: false,
      },
    });

    await prisma.character.update({
      where: { id: params.characterId },
      data: { currentVersionId: version.id },
    });

    // New versions never inherit production-ready status without real assets.
    await prisma.character3dModel.create({
      data: {
        characterId: params.characterId,
        characterVersionId: version.id,
        modelName: `${params.versionName} Production Master`,
        status: 'MISSING',
        approved: false,
        productionReady: false,
      },
    });

    return version;
  }

  assertModelReadyForNativeRender(character: {
    models: Array<{ productionReady: boolean; status: string; approved: boolean }>;
  }) {
    const ready = character.models.find(
      (m) => m.productionReady && m.approved && m.status === 'PRODUCTION_READY',
    );
    if (!ready) {
      throw new AppError(
        'STRICT_CHARACTER_LOCK: no PRODUCTION_READY approved 3D model. Native render blocked.',
        'CHARACTER_MODEL_MISSING',
        409,
      );
    }
    return ready;
  }
}

export class AssetService {
  async list(params?: { universeId?: string; type?: string; missing?: boolean }) {
    return prisma.asset.findMany({
      where: {
        universeId: params?.universeId,
        type: params?.type as never,
        missing: params?.missing,
      },
      orderBy: [{ missing: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(input: {
    universeId?: string | null;
    type: string;
    entityType?: string | null;
    entityId?: string | null;
    name: string;
    version?: number;
    storageLocation?: string | null;
    mimeType?: string | null;
    dimensions?: string | null;
    durationMs?: number | null;
    hash?: string | null;
    approved?: boolean;
    missing?: boolean;
    notes?: string | null;
  }) {
    return prisma.asset.create({
      data: {
        universeId: input.universeId ?? null,
        type: input.type as never,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        name: input.name,
        version: input.version ?? 1,
        storageLocation: input.storageLocation ?? null,
        mimeType: input.mimeType ?? null,
        dimensions: input.dimensions ?? null,
        durationMs: input.durationMs ?? null,
        hash: input.hash ?? null,
        approved: input.approved ?? false,
        missing: input.missing ?? true,
        notes: input.notes ?? null,
      },
    });
  }

  async getMissingCount(universeId?: string) {
    return prisma.asset.count({
      where: { missing: true, universeId },
    });
  }
}

export const characterService = new CharacterService();
export const assetService = new AssetService();

export * from './production';

export type { Character };
