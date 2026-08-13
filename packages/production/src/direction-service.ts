/**
 * Persistence and orchestration for the Steps 1-8 direction layer.
 *
 * `@doodle-dash/direction` is pure by design — it has no database, no clock and no
 * network — so this is the layer that gives it a world: it reads scene plans, stores
 * blueprints, records overrides with provenance, and answers the questions the UI
 * asks. All the determinism lives in the package; all the I/O lives here.
 *
 * Nothing in this file can start a paid render. Cost figures are advisory, and the
 * cloud authorization state is *reported* rather than granted, so the control
 * surface can show "paid GPU requires authorization" without being able to give it.
 */
import { prisma } from '@doodle-dash/database';
import { AppError } from '@doodle-dash/shared';
import {
  ARTISTIC_REVIEW_ITEMS,
  BLUEPRINT_SCHEMA_VERSION,
  CHILD_SAFE_POLICY,
  DirectorOverrideSchema,
  GOAT_LOCK,
  PIP_LOCK,
  QUALITY_BASELINES,
  ROADMAP,
  ScenePlanSchema,
  SUBSYSTEM_VERSIONS,
  THEATRICAL_GOLDEN_SCENE,
  currentStage,
  deriveOverall,
  diffBlueprints,
  direct,
  evaluateTheatricalGate,
  parseBlueprint,
  projectBlueprintForRender,
  recordArtisticReview,
  upgradeBlueprint,
  weakestArtisticStatus,
  type Acceptance,
  type ArtisticReviewItem,
  type ArtisticStatus,
  type DirectorOverride,
  type ProductionBlueprint,
  type ScenePlan,
} from '@doodle-dash/direction';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';

export type StoredBlueprint = {
  readonly id: string;
  readonly episodeId: string;
  readonly schemaVersion: string;
  readonly contentHash: string;
  readonly cacheKey: string;
  readonly status: string;
  readonly validationStatus: string;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly shotCount: number;
  readonly durationSeconds: number;
  readonly estimatedCloudCostUsd: number;
  readonly blueprint: ProductionBlueprint;
  readonly createdAt: Date;
};

/**
 * Whether a paid cloud render could be authorised right now, and why not.
 *
 * Read-only on purpose. The guard itself lives in the cloud package; this only
 * reports it, so no amount of UI interaction can flip it.
 */
export type ProviderStatus = {
  readonly localAvailable: true;
  readonly cloudRenderEnabled: boolean;
  readonly paidGpuLaunchAllowed: boolean;
  readonly requiresAuthorization: boolean;
  readonly explanation: string;
};

export function readProviderStatus(env: NodeJS.ProcessEnv = process.env): ProviderStatus {
  const cloudRenderEnabled = env.CLOUD_RENDER_ENABLED === 'true';
  const paidGpuLaunchAllowed = env.ALLOW_PAID_GPU_LAUNCH === 'true';
  const requiresAuthorization = !(cloudRenderEnabled && paidGpuLaunchAllowed);
  return {
    localAvailable: true,
    cloudRenderEnabled,
    paidGpuLaunchAllowed,
    requiresAuthorization,
    explanation: requiresAuthorization
      ? 'Paid GPU requires authorization. Local Blender/EEVEE rendering is available and is the default path.'
      : 'Cloud rendering is authorized. Cost caps and automatic pod termination still apply.',
  };
}

export class DirectionService {
  /**
   * Plan an episode and store the result.
   *
   * Storing a failing blueprint is deliberate: the errors are the useful output when
   * a plan is wrong, and a reviewer needs to read them. What a failing blueprint
   * cannot do is reach a renderer — `projectBlueprintForRender()` refuses it.
   */
  async planAndStore(params: {
    scenePlan: unknown;
    knownRenderCacheKeys?: readonly string[];
    knownAudioCacheKeys?: readonly string[];
    overrides?: readonly DirectorOverride[];
    generatedBy?: string;
  }): Promise<StoredBlueprint> {
    const scenePlan = ScenePlanSchema.parse(params.scenePlan);
    const result = direct(scenePlan, {
      knownRenderCacheKeys: params.knownRenderCacheKeys,
      knownAudioCacheKeys: params.knownAudioCacheKeys,
      overrides: params.overrides,
    });

    const content = result.blueprint.content;
    const record = await prisma.productionBlueprintRecord.upsert({
      where: { episodeId_contentHash: { episodeId: content.episodeId, contentHash: content.contentHash } },
      // An identical hash means an identical plan, so a repeat call refreshes the
      // envelope and nothing else. This is what makes planning idempotent.
      update: {
        meta: {
          generatedAt: new Date().toISOString(),
          generatedBy: params.generatedBy ?? 'director-ai',
          studioName: STUDIO_DISPLAY_NAME,
          storedSchemaVersion: BLUEPRINT_SCHEMA_VERSION,
        },
      },
      create: {
        episodeId: content.episodeId,
        schemaVersion: content.schemaVersion,
        contentHash: content.contentHash,
        cacheKey: content.cacheKey,
        seed: content.seed,
        status: 'DRAFT',
        validationStatus: content.validation.status,
        errorCount: content.validation.errorCount,
        warningCount: content.validation.warningCount,
        shotCount: content.totals.shotCount,
        durationSeconds: content.totals.durationSeconds,
        estimatedCloudCostUsd: content.totals.estimatedCloudCostUsd,
        content: content as unknown as object,
        meta: {
          generatedAt: new Date().toISOString(),
          generatedBy: params.generatedBy ?? 'director-ai',
          studioName: STUDIO_DISPLAY_NAME,
          storedSchemaVersion: BLUEPRINT_SCHEMA_VERSION,
        },
      },
    });

    // Overrides are recorded whether or not they were applied. A refused attempt to
    // loosen a character lock is exactly what a reviewer needs to be able to see.
    for (const applied of content.overrides) {
      await prisma.directorOverrideRecord.create({
        data: {
          blueprintId: record.id,
          episodeId: content.episodeId,
          path: applied.path,
          fromValue: (applied.from ?? null) as never,
          toValue: (applied.to ?? null) as never,
          createdBy: applied.by,
          reason: applied.reason,
          refusedBecause: applied.refusedBecause ?? null,
        },
      });
    }

    return this.toStored(record);
  }

  /**
   * Latest stored blueprint for an episode, migrated forward if it is older.
   *
   * Ordered by `updatedAt`, not `createdAt`: replanning an identical plan upserts an
   * existing row rather than inserting one, and that row is the current plan even
   * though it was first created earlier.
   */
  async latestForEpisode(episodeId: string): Promise<StoredBlueprint | null> {
    const record = await prisma.productionBlueprintRecord.findFirst({
      where: { episodeId },
      orderBy: { updatedAt: 'desc' },
    });
    return record ? this.toStored(record) : null;
  }

  async byContentHash(episodeId: string, contentHash: string): Promise<StoredBlueprint | null> {
    const record = await prisma.productionBlueprintRecord.findUnique({
      where: { episodeId_contentHash: { episodeId, contentHash } },
    });
    return record ? this.toStored(record) : null;
  }

  /**
   * Record an override and replan.
   *
   * Replanning rather than patching the stored document is the point: an override
   * changes an input, and every downstream decision that depended on it has to be
   * made again. Patching the output would leave a blueprint whose parts disagree.
   */
  async applyOverride(params: {
    episodeId: string;
    scenePlan: unknown;
    override: unknown;
    existingOverrides?: readonly DirectorOverride[];
    generatedBy?: string;
  }): Promise<{ blueprint: StoredBlueprint; accepted: boolean; refusedBecause?: string }> {
    const override = DirectorOverrideSchema.parse(params.override);
    const overrides = [...(params.existingOverrides ?? []), override];
    const stored = await this.planAndStore({
      scenePlan: params.scenePlan,
      overrides,
      generatedBy: params.generatedBy ?? override.by,
    });
    const applied = stored.blueprint.content.overrides.find((entry) => entry.path === override.path);
    return {
      blueprint: stored,
      accepted: applied != null && applied.refusedBecause == null,
      refusedBecause: applied?.refusedBecause,
    };
  }

  /**
   * Which shots a replan invalidates, so a rerender can be targeted.
   *
   * This is the difference between "the lighting changed, re-render the episode" and
   * "the lighting changed on shot 3, re-render shot 3".
   */
  async invalidationAgainstStored(params: {
    episodeId: string;
    scenePlan: unknown;
    overrides?: readonly DirectorOverride[];
  }): Promise<{
    readonly hasStored: boolean;
    readonly invalidatedShotIds: readonly string[];
    readonly reusableShotIds: readonly string[];
    readonly changedSystems: Readonly<Record<string, readonly string[]>>;
    readonly episodeKeyChanged: boolean;
  }> {
    const stored = await this.latestForEpisode(params.episodeId);
    const scenePlan = ScenePlanSchema.parse(params.scenePlan);
    const next = direct(scenePlan, { overrides: params.overrides });
    if (!stored) {
      return {
        hasStored: false,
        invalidatedShotIds: next.blueprint.content.shots.map((shot) => shot.shotId),
        reusableShotIds: [],
        changedSystems: {},
        episodeKeyChanged: true,
      };
    }
    const diff = diffBlueprints(stored.blueprint, next.blueprint);
    return { hasStored: true, ...diff };
  }

  /**
   * Everything the control surface needs for one episode, in one round trip.
   *
   * Deliberately shaped for a phone: per-shot validation status, the cost estimate
   * *before* anything is generated, and the provider authorization state.
   */
  async controlSurface(episodeId: string) {
    const stored = await this.latestForEpisode(episodeId);
    const shots = (stored?.blueprint.content.shots ?? []).map((shot) => ({
      shotId: shot.shotId,
      index: shot.index,
      beatPurpose: shot.beatPurpose,
      durationSeconds: shot.durationSeconds,
      composition: shot.camera.composition,
      move: shot.camera.move,
      lightingRecipe: shot.lighting.recipe,
      vfxPresets: shot.vfx.instances.map((instance) => instance.presetId),
      trackCount: shot.audio.tracks.length,
      qcStatus: shot.qc.status,
      failedChecks: [...shot.qc.motion, ...shot.qc.facial, ...shot.qc.sound]
        .filter((measurement) => measurement.status === 'FAIL')
        .map((measurement) => measurement.check),
      estimatedCloudCostUsd: shot.cost.estimatedCloudCostUsd,
      cacheHit: shot.cost.cacheHit,
      renderTier: shot.render.tier,
      renderEngine: shot.render.engine,
      // The two statuses side by side, because showing only the first is how a
      // green dashboard gets read as a creative sign-off.
      technicalStatus: shot.acceptance.technical,
      artisticStatus: shot.acceptance.artistic,
      acceptance: shot.acceptance.overall,
      isMasterCandidate: shot.render.isMasterCandidate,
      assetQuality: shot.assetBindings[0]?.quality ?? 'PROTOTYPE',
    }));
    const gate = evaluateTheatricalGate();
    return {
      studioName: STUDIO_DISPLAY_NAME,
      provider: readProviderStatus(),
      blueprint: stored,
      shots,
      issues: stored?.blueprint.content.issues ?? [],
      /** Episode-level acceptance and what blocks it from being called final. */
      acceptance: stored?.blueprint.content.acceptance ?? null,
      qualityContext: stored?.blueprint.content.qualityContext ?? null,
      /** The review checklist, so the UI enumerates gaps rather than a thumbs-up. */
      artisticReviewItems: [...ARTISTIC_REVIEW_ITEMS],
      /** Roadmap position and the Steps 9-16 gate, reported read-only. */
      roadmap: {
        currentStage: currentStage(),
        stages: ROADMAP.map((stage) => ({ order: stage.order, id: stage.id, name: stage.name, status: stage.status })),
        theatricalGate: gate,
        baselines: QUALITY_BASELINES.map((baseline) => ({
          id: baseline.id,
          kind: baseline.kind,
          status: baseline.status,
          establishesVisualStandard: baseline.establishesVisualStandard,
        })),
      },
      overrideBounds: {
        emotionIntensityMax: CHILD_SAFE_POLICY.maxIntensity,
        voiceIds: {
          [PIP_LOCK.characterCode]: PIP_LOCK.voice.voiceId,
          [GOAT_LOCK.characterCode]: GOAT_LOCK.voice.voiceId,
        },
      },
    };
  }

  /**
   * Record one human artistic review against a stored blueprint.
   *
   * Written to the blueprint's stored content rather than derived, because it is the
   * one field in the document that no computation may produce. The review is
   * attributed and timestamped; an approval without a reviewer, or against DRAFT
   * frames, is refused by `recordArtisticReview()` before it reaches the database.
   *
   * Approving every item still does not make the episode a theatrical pass on its
   * own — the golden reference does not exist yet, so
   * `GOLDEN_REFERENCE_COMPARISON` cannot honestly be approved and the episode stays
   * out of `ACCEPTED`. That is the intended behaviour, not a gap.
   */
  async recordReview(params: {
    episodeId: string;
    item: ArtisticReviewItem;
    status: ArtisticStatus;
    reviewer: string;
    renderTier: 'DRAFT' | 'REVIEW' | 'FINAL';
    notes?: string;
  }): Promise<StoredBlueprint> {
    const stored = await this.latestForEpisode(params.episodeId);
    if (!stored) throw new AppError('No blueprint stored for episode', 'BLUEPRINT_REQUIRED', 404);

    const acceptance = recordArtisticReview(stored.blueprint.content.acceptance, {
      item: params.item,
      status: params.status,
      reviewer: params.reviewer,
      reviewedAt: new Date().toISOString(),
      renderTier: params.renderTier,
      notes: params.notes,
    });

    // Shots inherit the episode-level review: these items are judgements about the
    // cut, and recording them per shot from one review would be inventing detail
    // that the reviewer did not give.
    const content = {
      ...stored.blueprint.content,
      acceptance,
      shots: stored.blueprint.content.shots.map((shot) => ({
        ...shot,
        acceptance: this.mergeShotAcceptance(shot.acceptance, acceptance),
      })),
    };

    const record = await prisma.productionBlueprintRecord.update({
      where: { id: stored.id },
      data: { content: content as unknown as object },
    });
    return this.toStored(record);
  }

  /**
   * Fold an episode review into a shot's acceptance.
   *
   * The shot keeps its own technical status — that is its own measurements — and
   * takes the episode's artistic verdict, because the review was of the cut.
   */
  private mergeShotAcceptance(shot: Acceptance, episode: Acceptance): Acceptance {
    const artisticReviews = episode.artisticReviews;
    const artistic = weakestArtisticStatus(artisticReviews);
    return {
      ...shot,
      artistic,
      artisticReviews,
      reviewedRenderTier: episode.reviewedRenderTier,
      overall: deriveOverall(shot.technical, artistic),
      blockedBy: episode.blockedBy,
    };
  }

  /**
   * Whether a roadmap stage may begin.
   *
   * Reported rather than enforced here — the enforcement is `assertStageAllowed()`
   * in the direction package, which throws. This exists so the control surface can
   * show why Steps 9-16 is not startable without having to catch an exception.
   */
  theatricalGate() {
    return {
      ...evaluateTheatricalGate(),
      goldenScene: THEATRICAL_GOLDEN_SCENE,
      currentStage: currentStage(),
    };
  }

  /**
   * Projection for the render pipeline. Throws when the blueprint failed QC, which
   * is what stops a known-bad plan from reaching a provider.
   */
  async renderProjection(episodeId: string) {
    const stored = await this.latestForEpisode(episodeId);
    if (!stored) throw new AppError('No blueprint stored for episode', 'BLUEPRINT_REQUIRED', 404);
    return projectBlueprintForRender(stored.blueprint);
  }

  private toStored(record: {
    id: string;
    episodeId: string;
    schemaVersion: string;
    contentHash: string;
    cacheKey: string;
    status: string;
    validationStatus: string;
    errorCount: number;
    warningCount: number;
    shotCount: number;
    durationSeconds: number;
    estimatedCloudCostUsd: number;
    content: unknown;
    meta: unknown;
    createdAt: Date;
  }): StoredBlueprint {
    // Migrate on read. A blueprint stored under an older schema version is upgraded
    // here rather than at write time, so an old row stays readable without a
    // backfill and a rollback leaves the row exactly as it was found.
    const { blueprint: upgraded } = upgradeBlueprint({
      content: record.content,
      meta: record.meta ?? { storedSchemaVersion: record.schemaVersion },
    });
    return {
      id: record.id,
      episodeId: record.episodeId,
      schemaVersion: upgraded.content.schemaVersion,
      contentHash: record.contentHash,
      cacheKey: record.cacheKey,
      status: record.status,
      validationStatus: record.validationStatus,
      errorCount: record.errorCount,
      warningCount: record.warningCount,
      shotCount: record.shotCount,
      durationSeconds: record.durationSeconds,
      estimatedCloudCostUsd: record.estimatedCloudCostUsd,
      blueprint: upgraded,
      createdAt: record.createdAt,
    };
  }
}

export const directionService = new DirectionService();

/** Subsystem versions, surfaced so the UI can show what planned a blueprint. */
export const DIRECTION_SYSTEM_VERSIONS = SUBSYSTEM_VERSIONS;

export type { ProductionBlueprint, ScenePlan, DirectorOverride };
export { parseBlueprint };
