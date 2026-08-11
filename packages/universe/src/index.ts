import {
  prisma,
  type CanonFact,
  type CanonLevel,
  type Prisma,
  type Universe,
} from '@doodle-dash/database';
import {
  CreateCanonFactSchema,
  type CreateCanonFactInput,
} from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';

export class UniverseService {
  async getPrimaryUniverse(): Promise<Universe | null> {
    return prisma.universe.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listUniverses(): Promise<Universe[]> {
    return prisma.universe.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async getUniverse(id: string): Promise<Universe> {
    const universe = await prisma.universe.findUnique({ where: { id } });
    if (!universe) {
      throw new AppError('Universe not found', 'UNIVERSE_NOT_FOUND', 404);
    }
    return universe;
  }
}

export class CanonService {
  async createCanonFact(input: CreateCanonFactInput): Promise<CanonFact> {
    const data = CreateCanonFactSchema.parse(input);
    return prisma.canonFact.create({
      data: {
        universeId: data.universeId,
        subjectType: data.subjectType,
        subjectId: data.subjectId ?? null,
        category: data.category,
        statement: data.statement,
        canonLevel: data.canonLevel,
        importance: data.importance,
        locked: data.locked,
      },
    });
  }

  async lockCanonFact(canonId: string): Promise<CanonFact> {
    return prisma.canonFact.update({
      where: { id: canonId },
      data: { locked: true },
    });
  }

  async unlockCanonFact(canonId: string): Promise<CanonFact> {
    const fact = await prisma.canonFact.findUnique({ where: { id: canonId } });
    if (!fact) {
      throw new AppError('Canon fact not found', 'CANON_NOT_FOUND', 404);
    }
    if (fact.canonLevel === 'IMMUTABLE') {
      throw new AppError(
        'IMMUTABLE canon cannot be unlocked. Create a CANON_CHANGE_PROPOSAL instead.',
        'IMMUTABLE_CANON_LOCKED',
        409,
      );
    }
    return prisma.canonFact.update({
      where: { id: canonId },
      data: { locked: false },
    });
  }

  async getRelevantCanon(params: {
    universeId: string;
    subjectIds?: string[];
    categories?: string[];
    levels?: CanonLevel[];
    limit?: number;
  }): Promise<CanonFact[]> {
    const where: Prisma.CanonFactWhereInput = {
      universeId: params.universeId,
    };
    if (params.subjectIds?.length) {
      where.OR = [
        { subjectId: { in: params.subjectIds } },
        { subjectType: 'GENERAL' },
        { subjectType: 'UNIVERSE' },
      ];
    }
    if (params.categories?.length) {
      where.category = { in: params.categories };
    }
    if (params.levels?.length) {
      where.canonLevel = { in: params.levels };
    }
    return prisma.canonFact.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
      take: params.limit ?? 50,
    });
  }

  async validateAgainstCanon(params: {
    universeId: string;
    statement: string;
  }): Promise<{ ok: boolean; conflicts: CanonFact[] }> {
    const locked = await prisma.canonFact.findMany({
      where: {
        universeId: params.universeId,
        locked: true,
        canonLevel: { in: ['IMMUTABLE', 'CURRENT'] },
      },
    });

    const normalized = params.statement.trim().toLowerCase();
    const conflicts = locked.filter((fact) => {
      const lockedStatement = fact.statement.trim().toLowerCase();
      return (
        normalized.includes(`not ${lockedStatement}`) ||
        normalized === `contradicts: ${lockedStatement}`
      );
    });

    return { ok: conflicts.length === 0, conflicts };
  }

  async createCanonChangeProposal(params: {
    universeId: string;
    targetCanonId: string;
    proposedStatement: string;
    reason: string;
  }): Promise<CanonFact> {
    const target = await prisma.canonFact.findUnique({
      where: { id: params.targetCanonId },
    });
    if (!target) {
      throw new AppError('Target canon fact not found', 'CANON_NOT_FOUND', 404);
    }
    if (!target.locked && target.canonLevel !== 'IMMUTABLE') {
      throw new AppError(
        'Target canon is unlocked; edit it directly instead of proposing a change.',
        'CANON_NOT_LOCKED',
        400,
      );
    }

    // Proposals are stored as unlocked CURRENT facts tagged for review.
    // Creative generation must never auto-apply them onto locked canon.
    return prisma.canonFact.create({
      data: {
        universeId: params.universeId,
        subjectType: target.subjectType,
        subjectId: target.subjectId,
        category: `proposal:${target.category}`,
        statement: `PROPOSAL (replaces ${target.id}): ${params.proposedStatement} | Reason: ${params.reason}`,
        canonLevel: 'CURRENT',
        importance: Math.max(target.importance - 1, 0),
        locked: false,
      },
    });
  }

  async listCanon(universeId: string): Promise<CanonFact[]> {
    return prisma.canonFact.findMany({
      where: { universeId },
      orderBy: [{ locked: 'desc' }, { importance: 'desc' }, { createdAt: 'asc' }],
    });
  }
}

export const universeService = new UniverseService();
export const canonService = new CanonService();
