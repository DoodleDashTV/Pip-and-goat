/**
 * The authoritative roadmap, the quality baselines, and the stop gate.
 *
 * Written as data rather than prose in a document for one reason: a document
 * cannot refuse. The ordering below has a rule attached — Steps 9–16 may not begin
 * until the Theatrical CGI Asset Foundation is complete, a golden scene has been
 * rendered, Justin has approved it, and the Reference Quality Lock is engaged —
 * and `assertStageAllowed()` enforces it against the recorded state of those
 * prerequisites. Something that reads the roadmap and throws is worth more than
 * something that reads the roadmap and reminds.
 *
 * The prerequisite state lives here as constants because nothing has satisfied any
 * of them yet. When the asset foundation tranche lands it flips its own flag in
 * the same commit that produces the evidence, and the gate opens on its own.
 */
import { z } from 'zod';
import { NonEmptyStringSchema } from './schema/common';

export const ROADMAP_STAGE_STATUSES = ['COMPLETE', 'CURRENT', 'BLOCKED', 'NOT_STARTED'] as const;
export const RoadmapStageStatusSchema = z.enum(ROADMAP_STAGE_STATUSES);
export type RoadmapStageStatus = z.infer<typeof RoadmapStageStatusSchema>;

export const RoadmapStageSchema = z.object({
  order: z.number().int().min(1),
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  status: RoadmapStageStatusSchema,
  /** Stage ids that must reach COMPLETE before this one may begin. */
  requires: z.array(NonEmptyStringSchema).default([]),
  /** What this stage produces, so "complete" is checkable rather than declared. */
  deliverable: NonEmptyStringSchema,
  /** True when a human's visual approval is part of completing the stage. */
  requiresHumanApproval: z.boolean(),
});
export type RoadmapStage = z.infer<typeof RoadmapStageSchema>;

/**
 * The twelve stages, in the mandated order.
 *
 * Stage 1 is complete and stage 2 is current. Everything from stage 3 onward is
 * blocked behind its predecessor, and stage 7 (Steps 9–16) is blocked behind four
 * separate things rather than one, which is why it gets its own assertion below.
 */
export const ROADMAP: readonly RoadmapStage[] = [
  {
    order: 1,
    id: 'FINAL_1080P_TECHNICAL_BASELINE',
    name: 'FINAL_1080P technical baseline',
    status: 'COMPLETE',
    requires: [],
    deliverable:
      'Accepted 1080x1920 render proving the pipeline executes end to end. Technical evidence only; establishes no visual standard.',
    requiresHumanApproval: false,
  },
  {
    order: 2,
    id: 'DDP_STEPS_1_8',
    name: 'DDP Steps 1–8 filmmaking engine',
    status: 'CURRENT',
    requires: ['FINAL_1080P_TECHNICAL_BASELINE'],
    deliverable:
      'Deterministic direction, acting, emotion, face, camera, lighting, VFX and sound planning, able to drive theatrical assets it does not yet have.',
    requiresHumanApproval: false,
  },
  {
    order: 3,
    id: 'THEATRICAL_ASSET_FOUNDATION',
    name: 'TivvleJoy Theatrical CGI Asset Foundation',
    status: 'NOT_STARTED',
    requires: ['DDP_STEPS_1_8'],
    deliverable:
      'Visual development, production-quality Pip and Goat, feature-grade rigs, professional animation libraries, movie-quality environments, and the three-tier render system.',
    requiresHumanApproval: true,
  },
  {
    order: 4,
    id: 'GOLDEN_SCENE',
    name: 'Movie-quality golden scene',
    status: 'BLOCKED',
    requires: ['THEATRICAL_ASSET_FOUNDATION'],
    deliverable:
      'One 5–10 second Cycles render with premium characters, acting, dialogue, environment, lighting, VFX, sound, compositing and grade.',
    requiresHumanApproval: true,
  },
  {
    order: 5,
    id: 'VISUAL_APPROVAL',
    name: "Justin's explicit visual approval",
    status: 'BLOCKED',
    requires: ['GOLDEN_SCENE'],
    deliverable: 'Recorded, attributable artistic approval of the golden scene. Not derivable from any test.',
    requiresHumanApproval: true,
  },
  {
    order: 6,
    id: 'REFERENCE_QUALITY_LOCK',
    name: 'Reference Quality Lock',
    status: 'BLOCKED',
    requires: ['VISUAL_APPROVAL'],
    deliverable: 'The approved golden scene locked as the standard no later shot may fall visibly below.',
    requiresHumanApproval: false,
  },
  {
    order: 7,
    id: 'DDP_STEPS_9_16',
    name: 'DDP Steps 9–16',
    status: 'BLOCKED',
    requires: ['THEATRICAL_ASSET_FOUNDATION', 'GOLDEN_SCENE', 'VISUAL_APPROVAL', 'REFERENCE_QUALITY_LOCK'],
    deliverable: 'The second studio upgrade tranche, built against a locked visual standard rather than a guess.',
    requiresHumanApproval: false,
  },
  {
    order: 8,
    id: 'PIXEL_LEVEL_ANIMATION',
    name: 'Pixel-Level Animation System',
    status: 'BLOCKED',
    requires: ['DDP_STEPS_9_16'],
    deliverable: 'Frame-accurate animation refinement above the Steps 9–16 layer.',
    requiresHumanApproval: false,
  },
  {
    order: 9,
    id: 'DDP_STEPS_17_24',
    name: 'DDP Steps 17–24',
    status: 'BLOCKED',
    requires: ['PIXEL_LEVEL_ANIMATION'],
    deliverable: 'Third studio upgrade tranche.',
    requiresHumanApproval: false,
  },
  {
    order: 10,
    id: 'DDP_STEPS_25_32',
    name: 'DDP Steps 25–32',
    status: 'BLOCKED',
    requires: ['DDP_STEPS_17_24'],
    deliverable: 'Fourth studio upgrade tranche.',
    requiresHumanApproval: false,
  },
  {
    order: 11,
    id: 'THEATRICAL_EPISODE_ACCEPTANCE',
    name: 'Full theatrical-quality episode acceptance',
    status: 'BLOCKED',
    requires: ['DDP_STEPS_25_32'],
    deliverable: 'A complete episode accepted against the locked standard, shot by shot.',
    requiresHumanApproval: true,
  },
  {
    order: 12,
    id: 'SEASON_1',
    name: 'Season 1 production',
    status: 'BLOCKED',
    requires: ['THEATRICAL_EPISODE_ACCEPTANCE'],
    deliverable: 'Repeatable theatrical-quality episode production.',
    requiresHumanApproval: true,
  },
].map((stage) => RoadmapStageSchema.parse(stage));

export const ROADMAP_STAGE_IDS = ROADMAP.map((stage) => stage.id);

export function roadmapStage(id: string): RoadmapStage {
  const stage = ROADMAP.find((candidate) => candidate.id === id);
  if (!stage) throw new Error(`Unknown roadmap stage "${id}"; known stages are ${ROADMAP_STAGE_IDS.join(', ')}.`);
  return stage;
}

/**
 * Quality baselines.
 *
 * Two kinds, and the distinction is the whole reason this exists. A
 * `TECHNICAL_BASELINE` proves machinery works. A `GOLDEN_SCENE` defines what good
 * looks like. The accepted FINAL_1080P render is emphatically the first kind, and
 * `establishesVisualStandard: false` says so in a field rather than a comment, so
 * a dashboard cannot present it as the studio's quality bar.
 */
export const QualityBaselineSchema = z.object({
  id: NonEmptyStringSchema,
  kind: z.enum(['TECHNICAL_BASELINE', 'GOLDEN_SCENE']),
  status: z.enum(['ACCEPTED', 'NOT_PRODUCED']),
  /** Whether this baseline defines the studio's visual standard. */
  establishesVisualStandard: z.boolean(),
  description: NonEmptyStringSchema,
  artifactSha256: z.string().optional(),
  resolution: z.string().optional(),
  renderEngine: z.string().optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  /** Properties frozen by this baseline. Empty until a golden scene is approved. */
  lockedProperties: z.array(NonEmptyStringSchema).default([]),
});
export type QualityBaseline = z.infer<typeof QualityBaselineSchema>;

/**
 * The closed FINAL_1080P acceptance, as a baseline record.
 *
 * Preserved exactly. This render is not re-run, not invalidated, and not
 * reinterpreted — and it is not the visual standard.
 */
export const FINAL_1080P_TECHNICAL_BASELINE: QualityBaseline = QualityBaselineSchema.parse({
  id: 'FINAL_1080P_2026_08_13',
  kind: 'TECHNICAL_BASELINE',
  status: 'ACCEPTED',
  establishesVisualStandard: false,
  description:
    'Accepted 1080x1920 EEVEE render of prototype assets, 90 frames at 30fps, chest seam repair verified. Proves the pipeline executes; establishes no visual standard.',
  artifactSha256: 'aefdd0b05881d336c489ba984a891f04eec0a44e889c6b3b3f61002554655458',
  resolution: '1080x1920',
  renderEngine: 'EEVEE',
  lockedProperties: [],
});

/**
 * The properties the golden scene will freeze once approved.
 *
 * Listed now, while the list is cheap to argue about, so that "Reference Quality
 * Lock" is a defined operation rather than a ceremony. Nothing is locked yet.
 */
export const REFERENCE_LOCK_PROPERTIES = [
  'character appearance',
  'proportions',
  'colours',
  'feathers and fur',
  'materials',
  'accessories',
  'facial performance',
  'eye performance',
  'acting quality',
  'character chemistry',
  'voice identity',
  'prosody',
  'lip sync',
  'camera language',
  'lighting',
  'environments',
  'VFX',
  'simulation',
  'secondary motion',
  'sound',
  'music mix',
  'compositing',
  'colour grade',
  'temporal quality',
  'continuity',
] as const;

/**
 * The golden scene, not yet produced.
 *
 * A placeholder with `status: 'NOT_PRODUCED'` rather than an absent record,
 * because the absence is the load-bearing fact: every acceptance record points at
 * this to explain why golden-reference comparison is impossible today.
 */
export const THEATRICAL_GOLDEN_SCENE: QualityBaseline = QualityBaselineSchema.parse({
  id: 'THEATRICAL_GOLDEN_SCENE_V1',
  kind: 'GOLDEN_SCENE',
  status: 'NOT_PRODUCED',
  establishesVisualStandard: true,
  description:
    '5–10 second Cycles render of premium Pip and Goat with full acting, dialogue, environment, lighting, VFX, sound, compositing and grade. Requires explicit approval before it locks anything.',
  lockedProperties: [...REFERENCE_LOCK_PROPERTIES],
});

export const QUALITY_BASELINES: readonly QualityBaseline[] = [
  FINAL_1080P_TECHNICAL_BASELINE,
  THEATRICAL_GOLDEN_SCENE,
];

/**
 * State of the four prerequisites guarding Steps 9–16.
 *
 * All false. Each flips in the commit that produces its evidence, not before, and
 * the artifact hash is required alongside the flag so "complete" is checkable.
 */
export const THEATRICAL_GATE_STATE = {
  assetFoundationComplete: false,
  goldenSceneRendered: false,
  goldenSceneArtifactSha256: undefined as string | undefined,
  justinApproved: false,
  justinApprovedAt: undefined as string | undefined,
  referenceQualityLockEngaged: false,
} as const;

export type TheatricalGateState = {
  readonly assetFoundationComplete: boolean;
  readonly goldenSceneRendered: boolean;
  readonly goldenSceneArtifactSha256?: string;
  readonly justinApproved: boolean;
  readonly justinApprovedAt?: string;
  readonly referenceQualityLockEngaged: boolean;
};

export type GateEvaluation = {
  readonly allowed: boolean;
  readonly blockers: readonly string[];
};

/**
 * Evaluate the Steps 9–16 gate.
 *
 * Returns blockers rather than a boolean alone so a caller can show all four at
 * once. Every message names what would satisfy it, because a gate that says "not
 * allowed" without saying what is missing gets worked around.
 */
export function evaluateTheatricalGate(state: TheatricalGateState = THEATRICAL_GATE_STATE): GateEvaluation {
  const blockers: string[] = [];
  if (!state.assetFoundationComplete) {
    blockers.push(
      'Theatrical CGI Asset Foundation is not complete: premium characters, feature rigs, environments and the three-tier render system must ship first.',
    );
  }
  if (!state.goldenSceneRendered) {
    blockers.push('No golden scene has been rendered: a 5–10 second Cycles render with compositing and grade is required.');
  } else if (!state.goldenSceneArtifactSha256) {
    blockers.push('The golden scene is marked rendered but carries no artifact hash, so it cannot be verified.');
  }
  if (!state.justinApproved) {
    blockers.push("Justin has not given explicit visual approval of the golden scene. No automated result substitutes for it.");
  }
  if (!state.referenceQualityLockEngaged) {
    blockers.push('The Reference Quality Lock is not engaged: the approved golden scene must be locked as the standard first.');
  }
  return { allowed: blockers.length === 0, blockers };
}

/**
 * Refuse to start a stage whose prerequisites are unmet.
 *
 * Throws, deliberately. Any tooling that begins a tranche calls this first, so
 * starting Steps 9–16 early is an error at the point of the attempt rather than a
 * discovery in review. The message carries every blocker so the caller does not
 * have to ask twice.
 */
export function assertStageAllowed(stageId: string, state: TheatricalGateState = THEATRICAL_GATE_STATE): void {
  const stage = roadmapStage(stageId);
  if (stage.status === 'COMPLETE' || stage.status === 'CURRENT') return;

  if (stageId === 'DDP_STEPS_9_16') {
    const evaluation = evaluateTheatricalGate(state);
    if (!evaluation.allowed) {
      throw new Error(
        `Stage ${stage.name} is blocked. ${evaluation.blockers.length} prerequisite(s) unmet:\n` +
          evaluation.blockers.map((blocker) => `  - ${blocker}`).join('\n'),
      );
    }
    return;
  }

  const unmet = stage.requires.filter((required) => roadmapStage(required).status !== 'COMPLETE');
  if (unmet.length > 0) {
    throw new Error(
      `Stage ${stage.name} requires ${unmet.map((id) => roadmapStage(id).name).join(', ')} to be complete first.`,
    );
  }
}

/** The stage the studio is currently working. Exactly one, by construction. */
export function currentStage(): RoadmapStage {
  const current = ROADMAP.filter((stage) => stage.status === 'CURRENT');
  if (current.length !== 1) {
    throw new Error(`Expected exactly one CURRENT roadmap stage; found ${current.length}.`);
  }
  return current[0];
}
