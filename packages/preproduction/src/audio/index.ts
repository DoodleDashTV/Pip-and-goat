/**
 * Voice, dialogue, music and sound pipeline infrastructure.
 *
 * Declares tracks and cache keys. Does not synthesise, clone, or replace locked
 * voices. Proxies may only use `proxy_voice_placeholder_v1`. Founding characters
 * keep `pip_default_v1` / `goat_default_v1` and those ids cannot be reassigned.
 */
import { z } from 'zod';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type OccupantCode, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, LOCKED_VOICE_IDS, PROXY_VOICE_PLACEHOLDER } from '../proxy';
import type { StoryDraft } from '../story';

export const AudioTrackSchema = z.object({
  trackId: z.string(),
  kind: z.enum(['DIALOGUE', 'NARRATION', 'MUSIC', 'AMBIENCE', 'FOLEY', 'PLACEHOLDER']),
  occupant: z.string().optional(),
  voiceId: z.string().optional(),
  requiresPaidProvider: z.literal(false),
  gainDb: z.number(),
  cacheKey: z.string(),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

export const AudioPlanSchema = z.object({
  episodeId: z.string(),
  tracks: z.array(AudioTrackSchema),
  mixTargetLufs: z.literal(-16),
  lockedVoicesUntouched: z.literal(true),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.audio),
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;

export function voiceIdForOccupant(code: OccupantCode): string {
  if (code === FOUNDING_CODES.PIP) return 'pip_default_v1';
  if (code === FOUNDING_CODES.GOAT) return 'goat_default_v1';
  return PROXY_VOICE_PLACEHOLDER;
}

export function planAudio(draft: StoryDraft): { audio: AudioPlan; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const tracks: AudioTrack[] = [];

  for (const occupant of draft.occupants) {
    const voiceId = voiceIdForOccupant(occupant);
    if (isProxyCode(occupant) && LOCKED_VOICE_IDS.includes(voiceId as (typeof LOCKED_VOICE_IDS)[number])) {
      issues.push({
        code: 'AUDIO_PROXY_BOUND_LOCKED_VOICE',
        severity: 'ERROR',
        system: 'audio',
        message: `Proxy ${occupant} cannot bind locked voice ${voiceId}.`,
      });
    }
    if (!isProxyCode(occupant) && voiceId === PROXY_VOICE_PLACEHOLDER) {
      issues.push({
        code: 'AUDIO_CANON_BOUND_PROXY_VOICE',
        severity: 'ERROR',
        system: 'audio',
        message: `Canonical ${occupant} cannot be reassigned to the proxy placeholder voice.`,
      });
    }
    tracks.push({
      trackId: `dialogue_${occupant}`,
      kind: isProxyCode(occupant) ? 'PLACEHOLDER' : 'DIALOGUE',
      occupant,
      voiceId,
      requiresPaidProvider: false,
      gainDb: 0,
      cacheKey: stableHash({ occupant, voiceId, episodeId: draft.episodeId }),
    });
  }

  tracks.push({
    trackId: 'music_bed',
    kind: 'MUSIC',
    requiresPaidProvider: false,
    gainDb: -8,
    cacheKey: stableHash({ episodeId: draft.episodeId, kind: 'MUSIC', theme: draft.theme }),
  });
  tracks.push({
    trackId: 'ambience_meadow',
    kind: 'AMBIENCE',
    requiresPaidProvider: false,
    gainDb: -14,
    cacheKey: stableHash({ episodeId: draft.episodeId, kind: 'AMBIENCE' }),
  });
  tracks.push({
    trackId: 'foley_steps',
    kind: 'FOLEY',
    requiresPaidProvider: false,
    gainDb: -10,
    cacheKey: stableHash({ episodeId: draft.episodeId, kind: 'FOLEY' }),
  });

  const audio = AudioPlanSchema.parse({
    episodeId: draft.episodeId,
    tracks,
    mixTargetLufs: -16,
    lockedVoicesUntouched: true,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.audio,
  });
  audio.cacheKey = stableHash({ version: audio.version, tracks: audio.tracks });

  return { audio, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}
