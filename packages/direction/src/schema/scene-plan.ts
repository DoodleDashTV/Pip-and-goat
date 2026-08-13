/**
 * `ddp-scene-plan-v1` — the approved story input the Director AI consumes.
 *
 * This is deliberately a *story* document: beats, purposes, objectives, dialogue.
 * It says nothing about cameras, lights, or shape keys. Everything cinematic is
 * the direction layer's job to decide and to explain.
 */
import { z } from 'zod';
import {
  CharacterCodeSchema,
  DeliverySchema,
  NonEmptyStringSchema,
  UnitScalarSchema,
} from './common';
import { SCENE_PLAN_SCHEMA_VERSION } from '../versions';

/** Why a beat exists in the episode. Drives hook/payoff placement and pacing. */
export const BEAT_PURPOSES = [
  'HOOK',
  'SETUP',
  'DISCOVERY',
  'COMPLICATION',
  'TURN',
  'PAYOFF',
  'RESOLUTION',
  'BUTTON',
] as const;
export const BeatPurposeSchema = z.enum(BEAT_PURPOSES);
export type BeatPurpose = z.infer<typeof BeatPurposeSchema>;

/** Emotions the story may request. Bounded for a children's audience. */
export const STORY_EMOTIONS = [
  'neutral',
  'happy',
  'curious',
  'excited',
  'determined',
  'surprised',
  'confused',
  'worried',
  'sad',
  'afraid',
  'angry',
  'laughing',
  'proud',
  'tender',
] as const;
export const StoryEmotionSchema = z.enum(STORY_EMOTIONS);
export type StoryEmotion = z.infer<typeof StoryEmotionSchema>;

export const DialogueLineSchema = z.object({
  lineId: NonEmptyStringSchema,
  characterCode: CharacterCodeSchema,
  text: NonEmptyStringSchema,
  /** What the character is trying to do by saying it, not how it sounds. */
  intent: z.string().trim().default(''),
});
export type ScenePlanDialogueLine = z.infer<typeof DialogueLineSchema>;

export const BeatCharacterSchema = z.object({
  characterCode: CharacterCodeSchema,
  /** What this character wants in this beat. The acting layer plays the objective. */
  objective: NonEmptyStringSchema,
  /** Optional story-requested emotion. The emotion engine still bounds it. */
  emotion: StoryEmotionSchema.optional(),
  /** Optional story-requested intensity, still subject to the child-safe ceiling. */
  emotionIntensity: UnitScalarSchema.optional(),
  /** True when this character is the beat's focus and framing should prioritise it. */
  focus: z.boolean().default(false),
});
export type BeatCharacter = z.infer<typeof BeatCharacterSchema>;

export const StoryBeatSchema = z.object({
  beatId: NonEmptyStringSchema,
  purpose: BeatPurposeSchema,
  /** One sentence of what happens. Read by the director, never rendered. */
  summary: NonEmptyStringSchema,
  /** Environment id — resolves to a lighting palette and an ambience bed. */
  locationId: NonEmptyStringSchema,
  timeOfDay: z.enum(['MORNING', 'MIDDAY', 'AFTERNOON', 'GOLDEN_HOUR', 'OVERCAST']).default('MIDDAY'),
  durationSeconds: z.number().positive().max(30),
  characters: z.array(BeatCharacterSchema).min(1),
  dialogue: z.array(DialogueLineSchema).default([]),
  narration: z.string().trim().optional(),
  /** Story props that must be visible. Framing may not crop a required prop. */
  requiredProps: z.array(NonEmptyStringSchema).default([]),
  /** Beat ids this one must stay continuous with (screen direction, state). */
  continuityRefs: z.array(NonEmptyStringSchema).default([]),
  /** Story-authored effect requests, by VFX registry id. */
  vfxRequests: z.array(NonEmptyStringSchema).default([]),
  /** Story-authored music cue intent. */
  musicIntent: z.enum(['NONE', 'CURIOUS', 'WARM', 'PLAYFUL', 'WONDER', 'GENTLE_TENSION', 'TRIUMPH']).default('WARM'),
});
export type StoryBeat = z.infer<typeof StoryBeatSchema>;

export const ScenePlanSchema = z.object({
  planVersion: z.literal(SCENE_PLAN_SCHEMA_VERSION),
  episodeId: NonEmptyStringSchema,
  episodeTitle: NonEmptyStringSchema,
  /**
   * Root determinism seed. Same plan + same seed + same configuration ⇒ byte
   * identical blueprint. Callers should keep it stable for the life of an episode.
   */
  seed: NonEmptyStringSchema,
  delivery: DeliverySchema,
  beats: z.array(StoryBeatSchema).min(1),
  /** Marked true only after story approval; the director refuses unapproved plans. */
  storyApproved: z.boolean().default(false),
  /**
   * Emotions from `CHILD_SAFE_POLICY.gatedEmotions` that story has explicitly
   * approved for this episode. Recorded, never inferred.
   */
  approvedGatedEmotions: z.array(StoryEmotionSchema).default([]),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export function parseScenePlan(input: unknown): ScenePlan {
  return ScenePlanSchema.parse(input);
}
