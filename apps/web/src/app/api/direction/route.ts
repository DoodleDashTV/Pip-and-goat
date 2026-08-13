/**
 * Direction layer API.
 *
 * `GET  /api/direction?episodeId=…` — blueprint inspection, per-shot validation
 *   status, cost estimate before generation, and provider authorization state.
 * `POST /api/direction` — plan or replan an episode, optionally with overrides, ask
 *   what a replan would invalidate without storing anything, or record a human
 *   artistic review.
 *
 * Nothing here can start a paid render. `readProviderStatus()` reports the
 * authorization state and cannot grant it, so a client may find out that a paid GPU
 * needs authorizing but cannot authorize one.
 *
 * Nothing here can approve a look either, except `record-review`, which requires a
 * named reviewer and refuses to attach an approval to DRAFT frames.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { directionService, readProviderStatus } from '@doodle-dash/production';
import {
  ARTISTIC_REVIEW_ITEMS,
  ARTISTIC_STATUSES,
  VALIDATION_SCENE_PLAN,
} from '@doodle-dash/direction';

export const dynamic = 'force-dynamic';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plan'),
    scenePlan: z.unknown().optional(),
    knownRenderCacheKeys: z.array(z.string()).optional(),
    knownAudioCacheKeys: z.array(z.string()).optional(),
    generatedBy: z.string().optional(),
  }),
  z.object({
    action: z.literal('override'),
    episodeId: z.string().min(1),
    scenePlan: z.unknown().optional(),
    override: z.unknown(),
    existingOverrides: z.array(z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('preview-invalidation'),
    episodeId: z.string().min(1),
    scenePlan: z.unknown().optional(),
  }),
  /**
   * Record one human artistic review.
   *
   * `reviewer` is required and unfudgeable at this layer: there is no default and no
   * "system" value, because an unattributed approval is the thing this endpoint
   * exists to make impossible.
   */
  z.object({
    action: z.literal('record-review'),
    episodeId: z.string().min(1),
    item: z.enum(ARTISTIC_REVIEW_ITEMS),
    status: z.enum(ARTISTIC_STATUSES),
    reviewer: z.string().trim().min(1),
    renderTier: z.enum(['DRAFT', 'REVIEW', 'FINAL']),
    notes: z.string().optional(),
  }),
]);

/**
 * The bundled validation scene is the fallback when no plan is supplied. It is a
 * capability fixture at draft resolution — deliberately not an acceptance render —
 * and it makes every endpoint here exercisable with no request body at all.
 */
function resolveScenePlan(supplied: unknown): unknown {
  return supplied ?? VALIDATION_SCENE_PLAN;
}

export async function GET(request: Request) {
  const episodeId = new URL(request.url).searchParams.get('episodeId');
  if (!episodeId) {
    return NextResponse.json(
      { error: 'episodeId is required', provider: readProviderStatus() },
      { status: 400 },
    );
  }
  const surface = await directionService.controlSurface(episodeId);
  return NextResponse.json({
    ...surface,
    // Restated at the top level so a client cannot render the control surface
    // without also having the authorization state in hand.
    paidGpuRequiresAuthorization: surface.provider.requiresAuthorization,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = { action: 'plan' };
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const command = parsed.data;

  try {
    if (command.action === 'plan') {
      const stored = await directionService.planAndStore({
        scenePlan: resolveScenePlan(command.scenePlan),
        knownRenderCacheKeys: command.knownRenderCacheKeys,
        knownAudioCacheKeys: command.knownAudioCacheKeys,
        generatedBy: command.generatedBy,
      });
      return NextResponse.json({
        blueprintId: stored.id,
        episodeId: stored.episodeId,
        contentHash: stored.contentHash,
        cacheKey: stored.cacheKey,
        validationStatus: stored.validationStatus,
        errorCount: stored.errorCount,
        warningCount: stored.warningCount,
        shotCount: stored.shotCount,
        estimatedCloudCostUsd: stored.estimatedCloudCostUsd,
        issues: stored.blueprint.content.issues,
        // Technical validation and artistic approval, never collapsed into one
        // field. A client that reads only `validationStatus` above still cannot
        // truthfully print "final" without also reading this.
        acceptance: stored.blueprint.content.acceptance,
        qualityContext: stored.blueprint.content.qualityContext,
        provider: readProviderStatus(),
      });
    }

    if (command.action === 'override') {
      const result = await directionService.applyOverride({
        episodeId: command.episodeId,
        scenePlan: resolveScenePlan(command.scenePlan),
        override: command.override,
        existingOverrides: (command.existingOverrides ?? []) as never,
      });
      return NextResponse.json({
        accepted: result.accepted,
        // A refusal is a successful response with `accepted: false`, not an error:
        // the request was well formed and the answer is no, with a reason.
        refusedBecause: result.refusedBecause ?? null,
        contentHash: result.blueprint.contentHash,
        validationStatus: result.blueprint.validationStatus,
        issues: result.blueprint.blueprint.content.issues,
      });
    }

    if (command.action === 'record-review') {
      const stored = await directionService.recordReview({
        episodeId: command.episodeId,
        item: command.item,
        status: command.status,
        reviewer: command.reviewer,
        renderTier: command.renderTier,
        notes: command.notes,
      });
      return NextResponse.json({
        acceptance: stored.blueprint.content.acceptance,
        // What still stands between this and being callable final. Returned on every
        // review so the answer to "is it done" never has to be assembled by a client.
        blockedBy: stored.blueprint.content.acceptance.blockedBy,
        theatricalGate: directionService.theatricalGate(),
      });
    }

    const invalidation = await directionService.invalidationAgainstStored({
      episodeId: command.episodeId,
      scenePlan: resolveScenePlan(command.scenePlan),
    });
    return NextResponse.json(invalidation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
