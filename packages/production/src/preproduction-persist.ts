/**
 * Persistence for character-independent pre-production runs.
 *
 * `optionalDelegate` means a missing Prisma model does not crash older
 * databases. That absence is never reported as a durable write.
 *
 * Status is always one of:
 *   PERSISTED            — a row exists and was written or reused
 *   EPHEMERAL_TEST_ONLY  — caller asked not to require durability (fixtures)
 *   PERSISTENCE_FAILED   — durable write was required or attempted and failed
 *
 * Production-intended runs (`durableRequired: true`) fail closed on
 * PERSISTENCE_FAILED. They must not be treated as a stored workflow.
 */
import { prisma } from '@doodle-dash/database';
import {
  PREPRODUCTION_SCHEMA_VERSION,
  summarizeWorkflow,
  type WorkflowRun,
} from '@doodle-dash/preproduction';

export const PERSISTENCE_STATUSES = ['PERSISTED', 'EPHEMERAL_TEST_ONLY', 'PERSISTENCE_FAILED'] as const;
export type PersistenceStatus = (typeof PERSISTENCE_STATUSES)[number];

type PrismaDelegate = {
  findFirst(args?: Record<string, unknown>): Promise<unknown | null>;
  create(args: Record<string, unknown>): Promise<unknown>;
};

const db = prisma as unknown as Record<string, PrismaDelegate | undefined>;

export type PersistDb = Record<string, PrismaDelegate | undefined>;

function optionalDelegate(modelName: string, client?: PersistDb): PrismaDelegate | null {
  const source = client ?? db;
  return source[modelName] ?? null;
}

export type PersistedPreproductionRun = {
  id: string;
  episodeId: string;
  characterMode: 'PROXY' | 'CANONICAL';
  outputClass: string;
  terminalState: string;
  status: string;
  cacheKey: string;
  scenePlanEmitted: boolean;
  paidGpu: boolean;
  occupants: string[];
};

export type PersistPreproductionResult = {
  status: PersistenceStatus;
  persisted: boolean;
  id?: string;
  reason: string;
};

function asPersisted(row: Record<string, unknown> | null): PersistedPreproductionRun | null {
  if (!row) return null;
  const content = (row.content as { occupants?: string[] } | null) ?? {};
  const mode = row.characterMode === 'CANONICAL' ? 'CANONICAL' : 'PROXY';
  return {
    id: String(row.id),
    episodeId: String(row.episodeId),
    characterMode: mode,
    outputClass: String(row.outputClass),
    terminalState: String(row.terminalState),
    status: String(row.status),
    cacheKey: String(row.cacheKey),
    scenePlanEmitted: Boolean(row.scenePlanEmitted),
    paidGpu: Boolean(row.paidGpu),
    occupants: Array.isArray(content.occupants) ? content.occupants.map(String) : [],
  };
}

export async function persistPreproductionRun(input: {
  episodeId: string;
  workflow: WorkflowRun;
  durableRequired?: boolean;
  ephemeralTestOnly?: boolean;
  client?: PersistDb;
}): Promise<PersistPreproductionResult> {
  const durableRequired = input.durableRequired === true;
  const ephemeralTestOnly = input.ephemeralTestOnly === true;

  if (input.workflow.bundle.library.writesProductionLibrary) {
    const failed: PersistPreproductionResult = {
      status: 'PERSISTENCE_FAILED',
      persisted: false,
      reason: 'Refuse: pre-production must not write production-library/.',
    };
    if (durableRequired) throw new Error(`PERSISTENCE_FAILED: ${failed.reason}`);
    return failed;
  }
  if (input.workflow.mayContinueToFinal || input.workflow.mayContinueToTheatrical || input.workflow.mayPublish) {
    const failed: PersistPreproductionResult = {
      status: 'PERSISTENCE_FAILED',
      persisted: false,
      reason: 'Refuse: workflow claimed a forbidden terminal.',
    };
    if (durableRequired) throw new Error(`PERSISTENCE_FAILED: ${failed.reason}`);
    return failed;
  }

  if (ephemeralTestOnly && !durableRequired) {
    return {
      status: 'EPHEMERAL_TEST_ONLY',
      persisted: false,
      reason: 'Fixture / pipeline-test run is ephemeral and was not written as a durable workflow.',
    };
  }

  const model = optionalDelegate('preproductionRun', input.client);
  if (!model) {
    const result: PersistPreproductionResult = {
      status: durableRequired ? 'PERSISTENCE_FAILED' : 'EPHEMERAL_TEST_ONLY',
      persisted: false,
      reason: 'Prisma model preproductionRun is not available. This is not a durable workflow run.',
    };
    if (durableRequired) {
      throw new Error(`PERSISTENCE_FAILED: ${result.reason}`);
    }
    return result;
  }

  try {
    const summary = summarizeWorkflow(input.workflow);
    const existing = (await model.findFirst({
      where: { episodeId: input.episodeId, cacheKey: input.workflow.cacheKey },
    })) as Record<string, unknown> | null;
    if (existing?.id) {
      return {
        status: 'PERSISTED',
        persisted: true,
        id: String(existing.id),
        reason: 'Reused identical cache key.',
      };
    }

    const created = (await model.create({
      data: {
        episodeId: input.episodeId,
        schemaVersion: PREPRODUCTION_SCHEMA_VERSION,
        characterMode: input.workflow.bundle.draft.characterMode,
        outputClass: input.workflow.bundle.outputClass,
        terminalState: input.workflow.terminal,
        status: input.workflow.bundle.status,
        cacheKey: input.workflow.cacheKey,
        scenePlanEmitted: input.workflow.bundle.scenePlan !== null,
        paidGpu: false,
        content: summary,
      },
    })) as { id?: string };

    if (!created.id) {
      const failed: PersistPreproductionResult = {
        status: 'PERSISTENCE_FAILED',
        persisted: false,
        reason: 'Create returned no id.',
      };
      if (durableRequired) throw new Error(`PERSISTENCE_FAILED: ${failed.reason}`);
      return failed;
    }

    return {
      status: 'PERSISTED',
      persisted: true,
      id: created.id,
      reason: 'Wrote preproduction_runs row.',
    };
  } catch (error) {
    if (durableRequired) throw error;
    return {
      status: 'PERSISTENCE_FAILED',
      persisted: false,
      reason: error instanceof Error ? error.message : 'Persist failed.',
    };
  }
}

export function assertDurableWorkflowPersisted(result: PersistPreproductionResult): void {
  if (result.status !== 'PERSISTED' || !result.persisted || !result.id) {
    throw new Error(
      `Production-intended workflow runs must persist durably. Status=${result.status}. ${result.reason}`,
    );
  }
}

export async function loadLatestPreproductionRun(
  episodeId: string,
  client?: PersistDb,
): Promise<PersistedPreproductionRun | null> {
  const model = optionalDelegate('preproductionRun', client);
  if (!model) return null;
  const row = (await model.findFirst({
    where: { episodeId },
    orderBy: { createdAt: 'desc' },
  })) as Record<string, unknown> | null;
  return asPersisted(row);
}

export async function loadPreproductionRunByCacheKey(
  episodeId: string,
  cacheKey: string,
  client?: PersistDb,
): Promise<PersistedPreproductionRun | null> {
  const model = optionalDelegate('preproductionRun', client);
  if (!model) return null;
  const row = (await model.findFirst({
    where: { episodeId, cacheKey },
  })) as Record<string, unknown> | null;
  return asPersisted(row);
}
