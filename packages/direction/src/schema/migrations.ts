/**
 * Blueprint schema migrations.
 *
 * A migration is a pure function from one version's shape to the next;
 * `upgradeBlueprint()` walks them in order and refuses anything it cannot place.
 *
 * The v1 → v2 migration below is the first real one, and it is the case the
 * machinery was built for: v2 added asset bindings, a render plan, a simulation
 * plan and split acceptance, and there are stored v1 blueprints that predate all
 * four. It fills them with the values that describe what a v1 blueprint actually
 * was — prototype assets, a DRAFT EEVEE render, no groom, nothing artistically
 * reviewed — rather than with the current defaults, which would silently claim
 * things about old plans that were never true of them.
 */
import { BLUEPRINT_SCHEMA_HISTORY, BLUEPRINT_SCHEMA_VERSION, SUBSYSTEM_VERSIONS } from '../versions';
import { ARTISTIC_REVIEW_ITEMS, deriveOverall } from '../acceptance';
import { RENDER_TIER_DEFAULTS, cloudRenderProfileFor } from '../quality';
import { stableHash } from '../determinism';
import { ProductionBlueprintSchema, type ProductionBlueprint } from './blueprint';

export type BlueprintMigration = {
  readonly from: string;
  readonly to: string;
  readonly describe: string;
  readonly migrate: (input: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * The acceptance record a migrated blueprint gets.
 *
 * Technical status is carried over from whatever the v1 blueprint recorded, which
 * is legitimate — those measurements were taken. Artistic status is
 * `NOT_RENDERED` with no reviewer, which is the only honest answer: v1 had no
 * concept of artistic review, so nothing in a v1 blueprint constitutes one.
 */
function migratedAcceptance(technical: 'PASS' | 'FAIL'): Record<string, unknown> {
  return {
    technical,
    technicalChecks: [
      {
        item: 'SCHEMA_VALIDATION',
        status: 'PASS',
        detail: 'Migrated from ddp-production-blueprint-v1.',
      },
      {
        item: 'MOTION_MEASUREMENTS',
        status: technical === 'PASS' ? 'PASS' : 'FAIL',
        detail: 'Carried over from the v1 qc block.',
      },
    ],
    artistic: 'NOT_RENDERED',
    artisticReviews: ARTISTIC_REVIEW_ITEMS.map((item) => ({ item, status: 'NOT_RENDERED' })),
    overall: deriveOverall(technical, 'NOT_RENDERED'),
    blockedBy: [
      ...(technical === 'FAIL' ? ['Technical checks failed; see the blueprint issues.'] : []),
      'Migrated from schema v1, which had no artistic review; nothing has been visually approved.',
      'No golden reference exists yet; comparison against the theatrical standard is not possible.',
    ],
  };
}

/**
 * The render plan a v1 shot is given.
 *
 * DRAFT/EEVEE at the shot's own resolution. A v1 blueprint carried a lighting
 * `samplesHint` and nothing else about rendering, and EEVEE draft is what it was
 * actually rendered with, so this describes rather than upgrades. Reading a v1
 * blueprint must not turn it into a Cycles master.
 */
function migratedRenderPlan(resolution: string, samplesHint: number): Record<string, unknown> {
  const defaults = RENDER_TIER_DEFAULTS.DRAFT;
  const plan = {
    tier: 'DRAFT',
    engine: 'EEVEE',
    resolution,
    samples: samplesHint,
    adaptiveSampling: { enabled: false, noiseThreshold: 0, minSamples: 0 },
    denoise: { enabled: false, denoiser: 'NONE' },
    motionBlur: { enabled: false, shutter: 0.5 },
    depthOfField: { enabled: false, motivation: '', fStop: 2.8 },
    passes: [...defaults.passes],
    compositing: { enabled: false, recipeId: '', recipeVersion: '', operations: [], usesCryptomatte: false },
    colorGrade: {
      enabled: false,
      gradeId: '',
      gradeVersion: '',
      viewTransform: 'Khronos PBR Neutral',
      look: 'None',
      exposure: 0,
      contrast: 0,
      saturation: 1,
    },
    groomValidation: false,
    atmosphere: false,
    isMasterCandidate: false,
    cloudRenderProfile: cloudRenderProfileFor('DRAFT', resolution, 'EEVEE'),
  };
  return { ...plan, cacheKey: stableHash(plan) };
}

/** An empty simulation plan: no groom, no caches, procedural secondary motion only. */
function migratedSimulationPlan(): Record<string, unknown> {
  return {
    groom: [],
    secondaryMotion: [],
    environment: [],
    requiredCaches: [],
    costWeight: 0,
    provenance: { system: 'simulation', version: SUBSYSTEM_VERSIONS.simulation, seed: 0 },
  };
}

const V1_TO_V2: BlueprintMigration = {
  from: 'ddp-production-blueprint-v1',
  to: 'ddp-production-blueprint-v2',
  describe:
    'adds asset bindings, render plan, simulation plan and split technical/artistic acceptance, described as prototype DRAFT with nothing visually reviewed',
  /**
   * `contentHash` and `cacheKey` are carried over untouched, not recomputed.
   *
   * They are the identity the row was stored under and what `byContentHash()`
   * looks up; recomputing them here would make every historical blueprint
   * unfindable by its own hash. The consequence is that a migrated blueprint's
   * hash describes its v1 content, which is correct — that is the content someone
   * planned and, if it was rendered, the content that was rendered. Re-planning
   * produces a v2 hash over v2 content, and the two coexist.
   */
  migrate: (input) => {
    const content = { ...(input.content as Record<string, unknown>) };
    const delivery = { ...(content.delivery as Record<string, unknown>) };
    const resolution = typeof delivery.resolution === 'string' ? delivery.resolution : '1080x1920';

    const shots = (content.shots as Record<string, unknown>[]).map((shot) => {
      const qc = (shot.qc ?? {}) as Record<string, unknown>;
      const technical = qc.status === 'FAIL' ? 'FAIL' : 'PASS';
      const lighting = (shot.lighting ?? {}) as Record<string, unknown>;
      const samplesHint = typeof lighting.samplesHint === 'number' ? lighting.samplesHint : 16;
      return {
        ...shot,
        // Empty rather than reconstructed. A v1 shot named `"pip"` without saying
        // which version, and inventing `prototype-1.1` here would assert a fact the
        // stored document does not contain. An empty binding list reads correctly as
        // "this plan predates version pinning".
        assetBindings: [],
        simulation: migratedSimulationPlan(),
        render: migratedRenderPlan(resolution, samplesHint),
        acceptance: migratedAcceptance(technical as 'PASS' | 'FAIL'),
      };
    });

    const validation = (content.validation ?? {}) as Record<string, unknown>;
    const episodeTechnical = validation.status === 'FAIL' ? 'FAIL' : 'PASS';

    return {
      ...input,
      content: {
        ...content,
        schemaVersion: 'ddp-production-blueprint-v2',
        delivery: {
          ...delivery,
          renderTier: 'DRAFT',
          assetQuality: 'PROTOTYPE',
        },
        shots,
        acceptance: migratedAcceptance(episodeTechnical as 'PASS' | 'FAIL'),
        qualityContext: {
          assetQuality: 'PROTOTYPE',
          renderTier: 'DRAFT',
          isMasterCandidate: false,
        },
      },
    };
  },
};

/** Ordered oldest → newest. Append only; never edit a shipped migration. */
export const BLUEPRINT_MIGRATIONS: readonly BlueprintMigration[] = [V1_TO_V2];

export type UpgradeResult = {
  readonly blueprint: ProductionBlueprint;
  readonly applied: readonly string[];
  readonly fromVersion: string;
};

/**
 * Read a stored blueprint of any known version and return it at the current one.
 *
 * Fails closed on an unknown version rather than guessing: a blueprint we cannot
 * interpret must not become a render.
 */
export function upgradeBlueprint(stored: unknown): UpgradeResult {
  if (stored === null || typeof stored !== 'object') {
    throw new Error('Stored blueprint is not an object.');
  }
  const record = stored as Record<string, unknown>;
  const content = record.content;
  if (content === null || typeof content !== 'object') {
    throw new Error('Stored blueprint has no content object.');
  }
  const version = (content as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'string') {
    throw new Error('Stored blueprint content has no schemaVersion.');
  }
  if (!(BLUEPRINT_SCHEMA_HISTORY as readonly string[]).includes(version)) {
    throw new Error(
      `Unknown blueprint schemaVersion "${version}"; known versions are ${BLUEPRINT_SCHEMA_HISTORY.join(', ')}.`,
    );
  }

  let current = record;
  let cursor = version;
  const applied: string[] = [];
  while (cursor !== BLUEPRINT_SCHEMA_VERSION) {
    const migration = BLUEPRINT_MIGRATIONS.find((candidate) => candidate.from === cursor);
    if (!migration) {
      throw new Error(`No migration path from blueprint schema "${cursor}" to "${BLUEPRINT_SCHEMA_VERSION}".`);
    }
    current = migration.migrate(current);
    applied.push(`${migration.from} → ${migration.to}: ${migration.describe}`);
    cursor = migration.to;
  }

  return { blueprint: ProductionBlueprintSchema.parse(current), applied, fromVersion: version };
}
