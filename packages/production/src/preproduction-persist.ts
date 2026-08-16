/**
 * Optional persistence for character-independent pre-production runs.
 *
 * Uses `optionalDelegate` so a missing Prisma model does not crash older
 * databases. Never writes production-library. Never records a paid GPU as
 * authorized. Proxy runs may be stored as PIPELINE_TEST evidence only.
 */
import { prisma } from '@doodle-dash/database';
import {
  PREPRODUCTION_SCHEMA_VERSION,
  summarizeWorkflow,
  type WorkflowRun,
} from '@doodle-dash/preproduction';

type PrismaDelegate = {
  findFirst(args?: Record<string, unknown>): Promise<unknown | null>;
  create(args: Record<string, unknown>): Promise<unknown>;
};

const db = prisma as unknown as Record<string, PrismaDelegate | undefined>;

function optionalDelegate(modelName: string): PrismaDelegate | null {
  return db[modelName] ?? null;
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
}): Promise<{ persisted: boolean; id?: string; reason?: string }> {
  if (input.workflow.bundle.library.writesProductionLibrary) {
    return { persisted: false, reason: 'Refuse: pre-production must not write production-library/.' };
  }
  if (input.workflow.mayContinueToFinal || input.workflow.mayContinueToTheatrical || input.workflow.mayPublish) {
    return { persisted: false, reason: 'Refuse: workflow claimed a forbidden terminal.' };
  }

  const model = optionalDelegate('preproductionRun');
  if (!model) {
    return { persisted: false, reason: 'Prisma model preproductionRun is not generated yet.' };
  }

  const summary = summarizeWorkflow(input.workflow);
  const existing = (await model.findFirst({
    where: { episodeId: input.episodeId, cacheKey: input.workflow.cacheKey },
  })) as Record<string, unknown> | null;
  if (existing?.id) {
    return { persisted: true, id: String(existing.id), reason: 'Reused identical cache key.' };
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

  return { persisted: true, id: created.id };
}

export async function loadLatestPreproductionRun(
  episodeId: string,
): Promise<PersistedPreproductionRun | null> {
  const model = optionalDelegate('preproductionRun');
  if (!model) return null;
  const row = (await model.findFirst({
    where: { episodeId },
    orderBy: { createdAt: 'desc' },
  })) as Record<string, unknown> | null;
  return asPersisted(row);
}
