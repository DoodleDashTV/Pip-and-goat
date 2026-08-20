import { sha256Canonical } from './hash';
import { BEAT_TYPES, STORY_BEAT_SCHEMA, type BeatType } from './types';
import type { EpisodeCreativeIntent } from './showrunner';

export type StoryBeat = {
  schemaVersion: typeof STORY_BEAT_SCHEMA;
  beatId: string;
  beatType: BeatType;
  purpose: string;
  characters: Array<'PIP' | 'GOAT'>;
  location: string;
  prop: string | null;
  dialogueRefs: string[];
  requiredReaction: string | null;
  requiredVisualInformation: string;
  requiredAudienceKnowledge: string;
  energy: number;
  durationTarget: number;
  cutPriority: 'MUST_HOLD' | 'FLEXIBLE' | 'CUTTABLE';
  continuityRequirements: string[];
  directorNotes: string;
  beatDependencySha256: string;
};

const DEFAULT_SEQUENCE: BeatType[] = [
  'HOOK',
  'SETUP',
  'DISCOVERY',
  'QUESTION',
  'REACTION',
  'DECISION',
  'MOVEMENT',
  'REVEAL',
  'COMEDY',
  'TENSION',
  'PAYOFF',
  'TRANSITION',
  'BUTTON',
];

export function beatTypes(): readonly BeatType[] {
  return BEAT_TYPES;
}

export function buildStoryBeats(input: {
  intent: EpisodeCreativeIntent;
  shotCount?: number;
  locations?: string[];
  heroProp?: string;
}): StoryBeat[] {
  const shotCount = input.shotCount ?? 12;
  const locations = input.locations ?? ['village', 'path'];
  const sequence = DEFAULT_SEQUENCE.slice(0, Math.max(3, Math.min(shotCount, DEFAULT_SEQUENCE.length)));
  while (sequence.length < shotCount) {
    sequence.push(sequence[sequence.length - 2] === 'BUTTON' ? 'TRANSITION' : DEFAULT_SEQUENCE[sequence.length % DEFAULT_SEQUENCE.length]!);
  }
  return sequence.map((beatType, index) => {
    const location = locations[index === 0 || beatType === 'HOOK' ? 0 : index >= shotCount - 2 ? locations.length - 1 : Math.min(locations.length - 1, 1)]!;
    const dialogue = beatType === 'HOOK' || beatType === 'TRANSITION' || beatType === 'BUTTON' ? [] : [`${input.intent.episodeId}_L${String(index + 1).padStart(2, '0')}`];
    const body = {
      schemaVersion: STORY_BEAT_SCHEMA,
      beatId: `${input.intent.episodeId}_BEAT_${String(index + 1).padStart(2, '0')}`,
      beatType,
      purpose: purposeFor(beatType, input.intent),
      characters: (beatType === 'INSERT' ? ['PIP'] : ['PIP', 'GOAT']) as Array<'PIP' | 'GOAT'>,
      location,
      prop: beatType === 'DISCOVERY' || beatType === 'REVEAL' ? input.heroProp ?? 'map' : null,
      dialogueRefs: dialogue,
      requiredReaction: beatType === 'REACTION' || beatType === 'PAYOFF' ? 'shared look' : beatType === 'COMEDY' ? 'Goat wait-hold' : null,
      requiredVisualInformation: visualFor(beatType, location, input.heroProp ?? 'map'),
      requiredAudienceKnowledge: knowledgeFor(beatType, input.intent),
      energy: energyFor(beatType, input.intent.energyProfile),
      durationTarget: durationFor(beatType, input.intent.paceProfile),
      cutPriority: beatType === 'BUTTON' || beatType === 'REVEAL' || beatType === 'HOOK' ? 'MUST_HOLD' : beatType === 'TRANSITION' ? 'CUTTABLE' : 'FLEXIBLE',
      continuityRequirements: [`location:${location}`, `axis:${input.intent.episodeId}`],
      directorNotes: `${beatType} should serve ${input.intent.episodeGoal} without inventing a final script.`,
    };
    return { ...body, beatDependencySha256: sha256Canonical({ ...body, directorNotes: undefined }) };
  });
}

function purposeFor(type: BeatType, intent: EpisodeCreativeIntent): string {
  if (type === 'HOOK') return intent.openingHook;
  if (type === 'REVEAL') return intent.climaxIntent;
  if (type === 'BUTTON') return intent.endingButtonIntent;
  if (type === 'DISCOVERY') return intent.discoveryGoal;
  return `${type} advances "${intent.episodeGoal}".`;
}

function visualFor(type: BeatType, location: string, prop: string): string {
  if (type === 'HOOK' || type === 'TRANSITION') return `Readable ${location} geography`;
  if (type === 'DISCOVERY' || type === 'REVEAL') return `Readable ${prop}`;
  if (type === 'REACTION' || type === 'BUTTON') return 'Both faces readable';
  return 'Pip and Goat spatial relationship';
}

function knowledgeFor(type: BeatType, intent: EpisodeCreativeIntent): string {
  if (type === 'HOOK' || type === 'SETUP') return 'Audience does not yet know the answer.';
  if (type === 'REVEAL' || type === 'PAYOFF' || type === 'BUTTON') return intent.discoveryGoal;
  return 'Audience holds the open question.';
}

function energyFor(type: BeatType, profile: EpisodeCreativeIntent['energyProfile']): number {
  const base = profile === 'HIGH' ? 0.72 : profile === 'LOW' ? 0.38 : 0.55;
  if (type === 'TENSION' || type === 'REVEAL') return Math.min(1, base + 0.2);
  if (type === 'BUTTON' || type === 'SETUP') return Math.max(0.2, base - 0.15);
  return base;
}

function durationFor(type: BeatType, pace: EpisodeCreativeIntent['paceProfile']): number {
  const hold = pace === 'EMOTIONAL_HOLD' || pace === 'CALM_DISCOVERY' ? 1.25 : pace === 'FAST_COMEDY' || pace === 'ACTION_BURST' ? 0.75 : 1;
  if (type === 'HOOK' || type === 'REVEAL') return Math.round(150 * hold);
  if (type === 'BUTTON') return Math.round(90 * hold);
  if (type === 'TRANSITION') return Math.round(60 * hold);
  return Math.round(120 * hold);
}
