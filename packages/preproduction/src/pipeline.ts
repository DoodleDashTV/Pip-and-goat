/**
 * Compose the character-independent pre-production pipeline.
 *
 * Order: story → continuity → storyboard → animatic → shots → library →
 * audio → orchestration → QC → output gates. Same brief, same seed, same
 * bundle. Nothing here writes production-library or launches a paid provider.
 */
import { FOUNDING_CODES } from '@doodle-dash/domain';
import {
  SCENE_PLAN_SCHEMA_VERSION,
  ScenePlanSchema,
  type ScenePlan,
  type StoryEmotion,
} from '@doodle-dash/direction';
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SCHEMA_VERSION } from './versions';
import {
  errorsOf,
  issueStatus,
  type OccupantCode,
  type OutputClass,
  type PlanIssue,
} from './schema';
import { isProxyCode } from './proxy';
import { planStory, StoryBriefSchema, type StoryBrief, type StoryDraft } from './story';
import { planContinuity, type ContinuityLedger } from './continuity';
import { planStoryboard, type StoryboardPlan } from './storyboard';
import { planAnimatic, type AnimaticPlan } from './animatic';
import { planShots, type ShotPlan } from './shotplan';
import { planLibrary, type LibraryBinding } from './library';
import { planAudio, type AudioPlan } from './audio';
import { planOrchestration, type OrchestrationPlan } from './orchestration';
import { planQc, type QcReport } from './qc';
import {
  evaluateProductionOutputGate,
  gateIssuesFrom,
  mayEmitScenePlan,
  type ProductionOutputGate,
} from './gates';

const EMOTION_MAP: Record<string, StoryEmotion> = {
  curious: 'curious',
  determined: 'determined',
  surprised: 'surprised',
  confused: 'confused',
  tender: 'tender',
  proud: 'proud',
  happy: 'happy',
};

export type PreproductionBundle = {
  schemaVersion: typeof PREPRODUCTION_SCHEMA_VERSION;
  outputClass: OutputClass;
  draft: StoryDraft;
  continuity: ContinuityLedger;
  storyboard: StoryboardPlan;
  animatic: AnimaticPlan;
  shotPlan: ShotPlan;
  library: LibraryBinding;
  audio: AudioPlan;
  orchestration: OrchestrationPlan;
  qc: QcReport;
  gate: ProductionOutputGate;
  issues: PlanIssue[];
  status: 'PASS' | 'FAIL';
  cacheKey: string;
  scenePlan: ScenePlan | null;
};

export function runPreproduction(input: Parameters<typeof StoryBriefSchema.parse>[0]): PreproductionBundle {
  const brief = StoryBriefSchema.parse(input);
  const issues: PlanIssue[] = [];

  const story = planStory(brief);
  issues.push(...story.issues);
  const continuity = planContinuity(story.draft);
  issues.push(...continuity.issues);
  const storyboard = planStoryboard(story.draft);
  issues.push(...storyboard.issues);
  const animatic = planAnimatic(story.draft, storyboard.storyboard);
  issues.push(...animatic.issues);
  const shots = planShots(story.draft);
  issues.push(...shots.issues);
  const library = planLibrary(story.draft);
  issues.push(...library.issues);
  const audio = planAudio(story.draft);
  issues.push(...audio.issues);
  const orchestration = planOrchestration(animatic.animatic, shots.shotPlan);
  issues.push(...orchestration.issues);
  const qc = planQc({
    draft: story.draft,
    storyboard: storyboard.storyboard,
    animatic: animatic.animatic,
    shotPlan: shots.shotPlan,
    audio: audio.audio,
  });
  issues.push(...qc.issues);

  const usesProxy = story.draft.occupants.some(isProxyCode);
  const outputClass: OutputClass = usesProxy
    ? 'PIPELINE_TEST'
    : story.draft.storyApproved
      ? 'STORY_APPROVED_PLAN'
      : 'STORY_DRAFT';

  const voiceBindings = Object.fromEntries(
    audio.audio.tracks
      .filter((track) => track.occupant && track.voiceId)
      .map((track) => [track.occupant!, track.voiceId!]),
  );

  const gate = evaluateProductionOutputGate({
    outputClass,
    renderTier: 'DRAFT',
    assetQuality: 'PROTOTYPE',
    occupants: story.draft.occupants,
    voiceBindings,
    writeProductionLibrary: false,
    claimMaster: false,
    launchPaidGpu: false,
    emitScenePlan: false,
    storyApproved: story.draft.storyApproved,
  });
  issues.push(...gateIssuesFrom(gate));

  const emission = mayEmitScenePlan({
    characterMode: story.draft.characterMode,
    storyApproved: story.draft.storyApproved,
    occupants: story.draft.occupants,
    issues,
  });
  const scenePlan = emission.allowed ? emitScenePlan(story.draft) : null;

  const status = issueStatus(issues);
  const cacheKey = stableHash({
    schemaVersion: PREPRODUCTION_SCHEMA_VERSION,
    story: story.draft.cacheKey,
    continuity: continuity.ledger.cacheKey,
    storyboard: storyboard.storyboard.cacheKey,
    animatic: animatic.animatic.cacheKey,
    shots: shots.shotPlan.cacheKey,
    library: library.library.cacheKey,
    audio: audio.audio.cacheKey,
    orchestration: orchestration.orchestration.cacheKey,
    qc: qc.qc.cacheKey,
    gate: gate.codes,
    status,
  });

  return {
    schemaVersion: PREPRODUCTION_SCHEMA_VERSION,
    outputClass,
    draft: story.draft,
    continuity: continuity.ledger,
    storyboard: storyboard.storyboard,
    animatic: animatic.animatic,
    shotPlan: shots.shotPlan,
    library: library.library,
    audio: audio.audio,
    orchestration: orchestration.orchestration,
    qc: qc.qc,
    gate,
    issues,
    status,
    cacheKey,
    scenePlan,
  };
}

export function emitScenePlan(draft: StoryDraft): ScenePlan {
  if (draft.characterMode === 'PROXY' || draft.occupants.some(isProxyCode)) {
    throw new Error('Refuse: proxy occupants cannot emit a ScenePlan.');
  }
  if (!draft.storyApproved) {
    throw new Error('Refuse: ScenePlan emission requires storyApproved on a canonical draft.');
  }

  const beats = draft.beats.map((beat) => ({
    beatId: beat.beatId,
    purpose: beat.purpose,
    summary: beat.summary,
    locationId: beat.locationId,
    timeOfDay: beat.purpose === 'DISCOVERY' ? 'GOLDEN_HOUR' : 'MIDDAY',
    durationSeconds: beat.durationSeconds,
    characters: beat.occupants
      .filter((code): code is typeof FOUNDING_CODES.PIP | typeof FOUNDING_CODES.GOAT =>
        code === FOUNDING_CODES.PIP || code === FOUNDING_CODES.GOAT,
      )
      .map((code) => ({
        characterCode: code,
        objective: beat.objective,
        emotion: EMOTION_MAP[beat.emotion] ?? 'curious',
        focus: code === beat.focus,
      })),
    dialogue: [],
    requiredProps: beat.requiredProps,
    continuityRefs: beat.continuityRefs,
    vfxRequests: beat.vfxRequests,
    musicIntent: beat.musicIntent,
  }));

  return ScenePlanSchema.parse({
    planVersion: SCENE_PLAN_SCHEMA_VERSION,
    episodeId: draft.episodeId,
    episodeTitle: draft.title,
    seed: `preproduction-${draft.episodeId}`,
    delivery: {
      aspect: '9:16',
      resolution: '1080x1920',
      fps: 30,
      targetDurationSeconds: draft.targetDurationSeconds,
      renderTier: 'DRAFT',
      assetQuality: 'PROTOTYPE',
    },
    beats,
    storyApproved: true,
    approvedGatedEmotions: [],
  });
}

export function bundleHasErrors(bundle: PreproductionBundle): boolean {
  return errorsOf(bundle.issues).length > 0;
}

export type { StoryBrief, OccupantCode };
