/**
 * Deterministic story generation for children’s episodes.
 *
 * Pure: no database, no network, no clock. The same brief plus the same seed
 * produces the same draft. This is a story document — beats, lesson, dialogue
 * intent — not a camera or lighting plan.
 *
 * Child-safety is fail-closed. A brief that asks for violence, horror, or an
 * adult tone is refused rather than rewritten into something "close enough".
 */
import { z } from 'zod';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { deriveSeed, createRng, stableHash } from '@doodle-dash/direction';
import {
  CANONICAL_CHARACTER_CODES,
  CharacterModeSchema,
  OccupantCodeSchema,
  PlanIssueSchema,
  type OccupantCode,
  type PlanIssue,
  type CharacterMode,
} from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, PROXY_IDS } from '../proxy';

export const STORY_BEAT_PURPOSES = [
  'HOOK',
  'SETUP',
  'DISCOVERY',
  'COMPLICATION',
  'TURN',
  'PAYOFF',
  'RESOLUTION',
  'BUTTON',
] as const;
export const StoryBeatPurposeSchema = z.enum(STORY_BEAT_PURPOSES);
export type StoryBeatPurpose = z.infer<typeof StoryBeatPurposeSchema>;

export const CHILD_SAFE_REFUSALS = [
  'violence',
  'weapon',
  'blood',
  'kill',
  'die',
  'horror',
  'nightmare',
  'abduct',
  'kidnap',
  'romance',
  'dating',
  'swear',
  'alcohol',
  'drug',
] as const;

export const StoryBriefSchema = z.object({
  episodeId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  logline: z.string().trim().min(1),
  theme: z.string().trim().min(1),
  seed: z.string().trim().min(1),
  characterMode: CharacterModeSchema,
  targetDurationSeconds: z.number().positive().max(600).default(30),
  storyApproved: z.boolean().default(false),
  requestedOccupants: z.array(OccupantCodeSchema).min(1).max(4).optional(),
});
export type StoryBrief = z.infer<typeof StoryBriefSchema>;

export const StoryBeatDraftSchema = z.object({
  beatId: z.string(),
  purpose: StoryBeatPurposeSchema,
  summary: z.string(),
  locationId: z.string(),
  durationSeconds: z.number().positive(),
  occupants: z.array(OccupantCodeSchema).min(1),
  focus: OccupantCodeSchema,
  objective: z.string(),
  emotion: z.string(),
  dialogueIntent: z.string(),
  requiredProps: z.array(z.string()),
  continuityRefs: z.array(z.string()),
  musicIntent: z.enum(['NONE', 'CURIOUS', 'WARM', 'PLAYFUL', 'WONDER', 'GENTLE_TENSION', 'TRIUMPH']),
  vfxRequests: z.array(z.string()),
});
export type StoryBeatDraft = z.infer<typeof StoryBeatDraftSchema>;

export const StoryDraftSchema = z.object({
  episodeId: z.string(),
  title: z.string(),
  logline: z.string(),
  theme: z.string(),
  lesson: z.string(),
  characterMode: CharacterModeSchema,
  storyApproved: z.boolean(),
  targetDurationSeconds: z.number(),
  occupants: z.array(OccupantCodeSchema),
  beats: z.array(StoryBeatDraftSchema).min(4),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.story),
});
export type StoryDraft = z.infer<typeof StoryDraftSchema>;

const DEFAULT_BEAT_TEMPLATES: ReadonlyArray<{
  purpose: StoryBeatPurpose;
  summary: (a: string, b: string, theme: string) => string;
  locationId: string;
  durationSeconds: number;
  emotion: string;
  musicIntent: StoryBeatDraft['musicIntent'];
  requiredProps: string[];
  vfxRequests: string[];
}> = [
  {
    purpose: 'HOOK',
    summary: (a, b, theme) => `${a} notices something small that does not match ${theme}.`,
    locationId: 'env_meadow_edge_v1',
    durationSeconds: 3,
    emotion: 'curious',
    musicIntent: 'CURIOUS',
    requiredProps: [],
    vfxRequests: [],
  },
  {
    purpose: 'SETUP',
    summary: (a, b) => `${b} names a careful first step so ${a} feels safe to try.`,
    locationId: 'env_meadow_path_v1',
    durationSeconds: 4,
    emotion: 'determined',
    musicIntent: 'WARM',
    requiredProps: ['prop_adventure_map_v1'],
    vfxRequests: [],
  },
  {
    purpose: 'DISCOVERY',
    summary: (a, b) => `${a} and ${b} find a clue that reframes the problem as a kindness.`,
    locationId: 'env_creek_bank_v1',
    durationSeconds: 5,
    emotion: 'surprised',
    musicIntent: 'WONDER',
    requiredProps: ['prop_adventure_map_v1'],
    vfxRequests: ['vfx_map_glow_v1'],
  },
  {
    purpose: 'COMPLICATION',
    summary: (a) => `The first try is playful but incomplete, and ${a} pauses to think.`,
    locationId: 'env_creek_bank_v1',
    durationSeconds: 4,
    emotion: 'confused',
    musicIntent: 'GENTLE_TENSION',
    requiredProps: ['prop_adventure_map_v1'],
    vfxRequests: ['vfx_dust_puff_v1'],
  },
  {
    purpose: 'TURN',
    summary: (a, b) => `${b} offers the kinder solution and ${a} chooses it.`,
    locationId: 'env_meadow_path_v1',
    durationSeconds: 5,
    emotion: 'tender',
    musicIntent: 'WARM',
    requiredProps: ['prop_adventure_map_v1'],
    vfxRequests: [],
  },
  {
    purpose: 'PAYOFF',
    summary: (a, b, theme) => `${a} and ${b} use the lesson about ${theme} together.`,
    locationId: 'env_meadow_clearing_v1',
    durationSeconds: 5,
    emotion: 'proud',
    musicIntent: 'TRIUMPH',
    requiredProps: ['prop_adventure_map_v1'],
    vfxRequests: ['vfx_discovery_burst_v1'],
  },
  {
    purpose: 'RESOLUTION',
    summary: (a, b) => `${a} and ${b} put the map away and leave the place as they found it.`,
    locationId: 'env_meadow_clearing_v1',
    durationSeconds: 3,
    emotion: 'happy',
    musicIntent: 'PLAYFUL',
    requiredProps: [],
    vfxRequests: [],
  },
  {
    purpose: 'BUTTON',
    summary: (a, b) => `A gentle hook: ${a} wonders what they will notice next, and ${b} smiles.`,
    locationId: 'env_meadow_edge_v1',
    durationSeconds: 1,
    emotion: 'curious',
    musicIntent: 'CURIOUS',
    requiredProps: [],
    vfxRequests: [],
  },
];

function occupantsFor(mode: CharacterMode, requested?: readonly OccupantCode[]): OccupantCode[] {
  if (requested && requested.length > 0) {
    const proxies = requested.filter(isProxyCode);
    const canonical = requested.filter((code) => !isProxyCode(code));
    if (mode === 'PROXY' && canonical.length > 0) {
      throw new Error('PROXY mode cannot include canonical founding character codes.');
    }
    if (mode === 'CANONICAL' && proxies.length > 0) {
      throw new Error('CANONICAL mode cannot include proxy occupants.');
    }
    return [...requested];
  }
  return mode === 'PROXY' ? [...PROXY_IDS] : [...CANONICAL_CHARACTER_CODES];
}

function displayName(code: OccupantCode): string {
  if (code === FOUNDING_CODES.PIP) return 'Pip';
  if (code === FOUNDING_CODES.GOAT) return 'Goat';
  if (code === 'PROXY_NONCANONICAL_BIRD_A') return 'Proxy Bird A';
  return 'Proxy Quadruped A';
}

function scanChildSafety(text: string): PlanIssue[] {
  const lowered = text.toLowerCase();
  return CHILD_SAFE_REFUSALS.filter((needle) => lowered.includes(needle)).map((needle) => ({
    code: 'STORY_CHILD_SAFE_REFUSAL',
    severity: 'ERROR' as const,
    system: 'story',
    message: `Story brief contains refused material: "${needle}". The planner will not rewrite it.`,
    measured: { needle },
  }));
}

export function planStory(input: z.input<typeof StoryBriefSchema>): {
  draft: StoryDraft;
  issues: PlanIssue[];
  decisions: Array<{ system: string; decision: string; chose: string; because: string }>;
} {
  const brief = StoryBriefSchema.parse(input);
  const issues: PlanIssue[] = [
    ...scanChildSafety(`${brief.title} ${brief.logline} ${brief.theme}`),
  ];
  const occupants = occupantsFor(brief.characterMode, brief.requestedOccupants);
  const [lead, partner] = [displayName(occupants[0]!), displayName(occupants[1] ?? occupants[0]!)];

  if (brief.characterMode === 'PROXY' && brief.storyApproved) {
    issues.push({
      code: 'PROXY_STORY_CANNOT_BE_PRODUCTION_APPROVED',
      severity: 'ERROR',
      system: 'story',
      message:
        'A PROXY-mode story cannot be marked storyApproved. Approval is for canonical founding-character stories only.',
    });
  }

  const rng = createRng(deriveSeed(brief.seed, brief.episodeId, 'story'));
  const lessonPick = rng.int(0, 2);
  const lesson =
    lessonPick === 0
      ? `Notice first, then try a kind step about ${brief.theme}.`
      : lessonPick === 1
        ? `Small problems stay small when friends share ${brief.theme}.`
        : `Leave the place kinder than you found it — that is ${brief.theme}.`;

  const beats: StoryBeatDraft[] = DEFAULT_BEAT_TEMPLATES.map((template, index) => {
    const beatId = `beat_${String(index + 1).padStart(3, '0')}`;
    const previous = index > 0 ? [`beat_${String(index).padStart(3, '0')}`] : [];
    return StoryBeatDraftSchema.parse({
      beatId,
      purpose: template.purpose,
      summary: template.summary(lead, partner, brief.theme),
      locationId: template.locationId,
      durationSeconds: template.durationSeconds,
      occupants,
      focus: template.purpose === 'SETUP' || template.purpose === 'TURN' ? occupants[1] ?? occupants[0] : occupants[0],
      objective:
        template.purpose === 'HOOK'
          ? 'notice'
          : template.purpose === 'COMPLICATION'
            ? 'pause and think'
            : 'help a friend',
      emotion: template.emotion,
      dialogueIntent: `${lead} and ${partner} keep the lesson readable for preschool viewers.`,
      requiredProps: template.requiredProps,
      continuityRefs: previous,
      musicIntent: template.musicIntent,
      vfxRequests: template.vfxRequests,
    });
  });

  const duration = beats.reduce((sum, beat) => sum + beat.durationSeconds, 0);
  if (Math.abs(duration - brief.targetDurationSeconds) > 8) {
    issues.push({
      code: 'STORY_DURATION_DRIFT',
      severity: 'WARNING',
      system: 'story',
      message: `Planned beats total ${duration}s against a ${brief.targetDurationSeconds}s target.`,
      measured: { duration, target: brief.targetDurationSeconds },
    });
  }

  const draft = StoryDraftSchema.parse({
    episodeId: brief.episodeId,
    title: brief.title,
    logline: brief.logline,
    theme: brief.theme,
    lesson,
    characterMode: brief.characterMode,
    storyApproved: brief.storyApproved && brief.characterMode === 'CANONICAL' && issues.every((issue) => issue.severity !== 'ERROR'),
    targetDurationSeconds: brief.targetDurationSeconds,
    occupants,
    beats,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.story,
  });
  draft.cacheKey = stableHash({
    version: draft.version,
    episodeId: draft.episodeId,
    title: draft.title,
    logline: draft.logline,
    theme: draft.theme,
    lesson: draft.lesson,
    characterMode: draft.characterMode,
    occupants: draft.occupants,
    beats: draft.beats,
  });

  return {
    draft,
    issues: issues.map((issue) => PlanIssueSchema.parse(issue)),
    decisions: [
      {
        system: 'story',
        decision: 'characterMode',
        chose: brief.characterMode,
        because:
          brief.characterMode === 'PROXY'
            ? 'Pipeline testing must use labeled noncanonical proxies until retopo is delivered.'
            : 'Canonical founding codes are story roles only; no character asset is written.',
      },
      {
        system: 'story',
        decision: 'lesson',
        chose: lesson,
        because: 'Preschool-readable kindness lesson derived from the brief theme.',
      },
    ],
  };
}
