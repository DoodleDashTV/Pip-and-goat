/**
 * Step 8 — Professional sound system.
 *
 * A timeline-based sound plan: dialogue, narration, ambience, music, foley,
 * footsteps, prop sounds, VFX sounds and transition accents, each on its own
 * track with provenance, and a deterministic mix configuration that FFmpeg can
 * assemble. Individual tracks are independently cache-keyed, so replacing the
 * music does not regenerate the dialogue.
 *
 * The voice identities are permanent. `pip_default_v1` and `goat_default_v1` are
 * locked and enforced here, not chosen per episode. Voice *generation* goes
 * through a provider abstraction with a cache and a local/mock provider, and this
 * tranche never issues a paid request: the planner emits a cache key and a
 * provider-agnostic request, and it is the provider layer's job — outside this
 * package — to decide whether a cached artifact already satisfies it.
 */
import { z } from 'zod';
import {
  CharacterCodeSchema,
  NonEmptyStringSchema,
  UnitScalarSchema,
  type CharacterCode,
  type Decision,
  type PlanIssue,
} from '../schema/common';
import { boundedUnit, clampQuantize, createRng, deriveSeed, quantize, shortHash } from '../determinism';
import { characterLock, voiceIdFor } from '../locks';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { EmotionPlan } from '../emotion';
import type { StoryBeat } from '../schema/scene-plan';
import type { VfxPlan } from '../vfx';

export const TRACK_KINDS = [
  'DIALOGUE',
  'NARRATION',
  'AMBIENCE',
  'MUSIC',
  'FOLEY',
  'FOOTSTEPS',
  'PROP',
  'VFX',
  'TRANSITION',
] as const;
export const TrackKindSchema = z.enum(TRACK_KINDS);
export type TrackKind = z.infer<typeof TrackKindSchema>;

/** Where an audio artifact comes from. No paid provider is invoked in planning. */
export const AudioSourceSchema = z.object({
  kind: z.enum(['VOICE_SYNTHESIS', 'SOUND_LIBRARY', 'MUSIC_LIBRARY', 'GENERATED_TONE', 'SILENCE']),
  /** Library asset id, or the voice id for synthesis. */
  ref: NonEmptyStringSchema,
  /** Provider-agnostic id. `local-espeak` and `mock` need no credentials. */
  provider: z.enum(['local-espeak', 'mock', 'cached', 'external']),
  /**
   * Cache key for this artifact. A cache hit is what keeps the tranche free: the
   * planner never asks for generation, it asks whether this key already exists.
   */
  cacheKey: NonEmptyStringSchema,
  license: NonEmptyStringSchema,
  attribution: z.string().optional(),
});
export type AudioSource = z.infer<typeof AudioSourceSchema>;

export const AudioTrackSchema = z.object({
  trackId: NonEmptyStringSchema,
  kind: TrackKindSchema,
  startMs: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  /** Trim applied at assembly, in ms. Positive delays, negative pulls earlier. */
  offsetMs: z.number().int(),
  gainDb: z.number().min(-40).max(6),
  fadeInMs: z.number().int().min(0).max(4000),
  fadeOutMs: z.number().int().min(0).max(4000),
  /** Lower numbers duck later: dialogue is 0 and ducks everything else. */
  duckPriority: z.number().int().min(0).max(9),
  characterCode: CharacterCodeSchema.optional(),
  source: AudioSourceSchema,
  /** Dialogue text, for caption and viseme cross-checking. */
  text: z.string().optional(),
  /** True when the artifact is known to exist already (cache hit). */
  cached: z.boolean(),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

export const VoiceRequestSchema = z.object({
  characterCode: CharacterCodeSchema,
  /** Permanent locked voice id. */
  voiceId: NonEmptyStringSchema,
  lineId: NonEmptyStringSchema,
  text: NonEmptyStringSchema,
  /** Prosody, already bounded by the character's voice lock. */
  prosody: z.object({
    pitchSemitones: z.number(),
    rate: z.number(),
    gainDb: z.number(),
    brightness: UnitScalarSchema,
  }),
  cacheKey: NonEmptyStringSchema,
  /** Never true in this tranche; the field exists so the boundary is explicit. */
  requiresPaidProvider: z.literal(false),
});
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;

export const DialogueTimingSchema = z.object({
  lineId: NonEmptyStringSchema,
  characterCode: CharacterCodeSchema,
  startMs: z.number().int().min(0),
  durationMs: z.number().int().positive(),
  text: NonEmptyStringSchema,
  /** Word count and estimated syllables, which is what the duration derives from. */
  words: z.number().int().positive(),
  syllables: z.number().int().positive(),
});
export type DialogueTiming = z.infer<typeof DialogueTimingSchema>;

export const SoundPlanSchema = z.object({
  tracks: z.array(AudioTrackSchema).min(1),
  dialogueTiming: z.array(DialogueTimingSchema).default([]),
  voiceRequests: z.array(VoiceRequestSchema).default([]),
  /** Ducking regions derived from dialogue, in ms, with their attenuation. */
  ducking: z
    .array(z.object({ startMs: z.number().int().min(0), endMs: z.number().int().min(0), attenuationDb: z.number().max(0) }))
    .default([]),
  loudness: z.object({
    targetLufs: z.number(),
    truePeakDb: z.number(),
    /** Dialogue must sit this far above the music bed to stay intelligible. */
    dialogueToMusicDb: z.number().min(3),
  }),
  durationMs: z.number().int().positive(),
  /**
   * Gain staging applied uniformly to every track so the summed peak clears the
   * true-peak ceiling. Uniform by design: it buys headroom without disturbing any
   * relative balance, so the dialogue-over-music margin survives it untouched.
   * Loudness normalisation back up to the LUFS target is a separate assembly
   * stage, which is why this only ever attenuates.
   */
  mixBusTrimDb: z.number().max(0),
  /** Deterministic mix configuration hash; the FFmpeg graph derives from this. */
  mixConfigKey: NonEmptyStringSchema,
  provenance: z.object({ system: z.literal('sound'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type SoundPlan = z.infer<typeof SoundPlanSchema>;

export const SoundMeasurementSchema = z.object({
  check: NonEmptyStringSchema,
  measured: z.number(),
  tolerance: z.number(),
  unit: NonEmptyStringSchema,
  status: z.enum(['PASS', 'FAIL']),
  repair: z.string().optional(),
});
export type SoundMeasurement = z.infer<typeof SoundMeasurementSchema>;

/**
 * Loudness targets for children's content.
 *
 * −16 LUFS with a −1.5 dBTP ceiling is the short-form platform norm, and a 10 dB
 * dialogue-over-music margin is what keeps a four-year-old able to follow the
 * words on a phone speaker in a moving car.
 */
export const SOUND_TARGETS = {
  targetLufs: -16,
  truePeakDb: -1.5,
  dialogueToMusicDb: 10,
  /** Attenuation applied to non-dialogue tracks while dialogue plays. */
  duckAttenuationDb: -9,
  /** Ms of pre-roll before ducking engages, so the duck is not audible as a pump. */
  duckLeadMs: 120,
  duckReleaseMs: 260,
  /** Words per minute for the studio's delivery. Sets dialogue duration. */
  wordsPerMinute: 138,
  /** A gap longer than this with no audio at all reads as a dropout. */
  maxSilenceGapMs: 1200,
  /** Peak headroom a single track may claim before clipping is likely. */
  maxTrackGainDb: 4,
  /** Extra headroom held below the true-peak ceiling when gain staging the bus. */
  busSafetyDb: 0.5,
  /** A bus trim deeper than this means the shot is over-layered, not just loud. */
  maxBusTrimDb: -12,
  /** Loudest a children's mix may be allowed to sit. */
  maxChildSafeLufs: -14,
} as const;

/** Footstep/hoofstep signature per character, from the lock. */
const FOLEY_LIBRARY: Readonly<Record<CharacterCode, { footstep: string; foley: string }>> = {
  CHAR_PIP_001: { footstep: 'sfx_footstep_chick_soil_v1', foley: 'sfx_feather_ruffle_v1' },
  CHAR_GOAT_001: { footstep: 'sfx_hoofstep_goat_soil_v1', foley: 'sfx_collar_tag_jingle_v1' },
};

const AMBIENCE_LIBRARY: Readonly<Record<string, string>> = {
  MORNING: 'amb_meadow_morning_v1',
  MIDDAY: 'amb_meadow_midday_v1',
  AFTERNOON: 'amb_meadow_afternoon_v1',
  GOLDEN_HOUR: 'amb_meadow_golden_v1',
  OVERCAST: 'amb_meadow_overcast_v1',
};

const MUSIC_LIBRARY: Readonly<Record<string, string>> = {
  NONE: '',
  CURIOUS: 'mus_curious_pizzicato_v1',
  WARM: 'mus_warm_ukulele_v1',
  PLAYFUL: 'mus_playful_marimba_v1',
  WONDER: 'mus_wonder_glockenspiel_v1',
  GENTLE_TENSION: 'mus_gentle_tension_v1',
  TRIUMPH: 'mus_triumph_brightbrass_v1',
};

/** VFX category → its sound. An effect with no sound reads as a glitch. */
const VFX_SOUNDS: Readonly<Record<string, string>> = {
  MAGICAL_SPARKLES: 'sfx_sparkle_shimmer_v1',
  GLOWING_TRAIL: 'sfx_soft_whoosh_v1',
  DUST_PUFF: 'sfx_dust_puff_v1',
  LEAVES_WIND: 'sfx_leaves_rustle_v1',
  MAP_GLOW: 'sfx_warm_hum_v1',
  SOFT_MIST: '',
  WATER_SPLASH: 'sfx_water_splash_small_v1',
  DISCOVERY_BURST: 'sfx_discovery_chime_v1',
  ENVIRONMENTAL_PARTICLES: '',
  TRANSITION_ACCENT: 'sfx_transition_swish_v1',
};

const STUDIO_LICENSE = 'Proprietary — TivvleJoy Studios internal use';

export type SoundInput = {
  readonly beat: StoryBeat;
  readonly rootSeed: string;
  readonly shotId: string;
  readonly durationSeconds: number;
  readonly emotions: ReadonlyArray<EmotionPlan>;
  readonly vfx: VfxPlan;
  readonly travellingCharacters: readonly string[];
  /** Steps planned per character, so footsteps land on the footfalls. */
  readonly stepsByCharacter: Readonly<Record<string, number>>;
  /** Cache keys already known to exist, so the plan can report cache hits. */
  readonly knownCacheKeys?: readonly string[];
  readonly isTransitionShot?: boolean;
};

export type SoundResult = {
  readonly plan: SoundPlan;
  readonly measurements: SoundMeasurement[];
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planSound(input: SoundInput): SoundResult {
  const { beat, rootSeed, shotId, durationSeconds, emotions } = input;
  const seed = deriveSeed(rootSeed, shotId, 'sound');
  const rng = createRng(seed);
  const issues: PlanIssue[] = [];
  const decisions: Decision[] = [];
  const known = new Set(input.knownCacheKeys ?? []);
  const durationMs = Math.round(durationSeconds * 1000);

  const tracks: AudioTrack[] = [];
  const dialogueTiming: DialogueTiming[] = [];
  const voiceRequests: VoiceRequest[] = [];

  // Dialogue first: everything else is timed around the words.
  let cursorMs = 180; // a beat of air before the first line
  for (const line of beat.dialogue) {
    const emotion = emotions.find((candidate) => candidate.characterCode === line.characterCode);
    const lock = characterLock(line.characterCode);
    const voiceId = voiceIdFor(line.characterCode);

    const words = line.text.trim().split(/\s+/).filter(Boolean).length;
    const syllables = estimateSyllables(line.text);
    const rate = emotion?.effects.voice.rate ?? 1;
    // Duration from syllables rather than words: "extraordinary" and "yes" are both
    // one word and take very different amounts of time to say.
    const baseMs = (syllables / (SOUND_TARGETS.wordsPerMinute * 1.4)) * 60_000;
    const lineDurationMs = Math.max(240, Math.round(baseMs / rate));
    const preDelayMs = emotion?.effects.voice.preDelayMs ?? 0;
    const startMs = cursorMs + preDelayMs;

    const prosody = {
      pitchSemitones: quantize(emotion?.effects.voice.pitchSemitones ?? 0, 3),
      rate: quantize(rate, 3),
      gainDb: quantize(emotion?.effects.voice.gainDb ?? 0, 2),
      brightness: boundedUnit(emotion?.effects.voice.brightness ?? 0.5, 3),
    };

    // Voice-lock enforcement. The emotion engine already bounds prosody; this is
    // the second, independent check, because the sound system is the last place a
    // wrong voice could reach a renderer.
    if (prosody.pitchSemitones < lock.voice.pitchRange.minSemitones - 1e-6 || prosody.pitchSemitones > lock.voice.pitchRange.maxSemitones + 1e-6) {
      issues.push({
        code: 'VOICE_LOCK_PITCH_OUT_OF_RANGE',
        severity: 'ERROR',
        system: 'sound',
        shotId,
        characterCode: line.characterCode,
        message: `${voiceId} allows ${lock.voice.pitchRange.minSemitones}..${lock.voice.pitchRange.maxSemitones} semitones; plan asked for ${prosody.pitchSemitones}.`,
        measured: { requested: prosody.pitchSemitones },
      });
    }
    if (prosody.rate < lock.voice.rateRange.min - 1e-6 || prosody.rate > lock.voice.rateRange.max + 1e-6) {
      issues.push({
        code: 'VOICE_LOCK_RATE_OUT_OF_RANGE',
        severity: 'ERROR',
        system: 'sound',
        shotId,
        characterCode: line.characterCode,
        message: `${voiceId} allows rate ${lock.voice.rateRange.min}..${lock.voice.rateRange.max}; plan asked for ${prosody.rate}.`,
        measured: { requested: prosody.rate },
      });
    }

    // The cache key is the identity of the audio: same voice, same text, same
    // prosody ⇒ same key ⇒ no regeneration, paid or otherwise.
    const cacheKey = shortHash({ voiceId, text: line.text, prosody, system: SUBSYSTEM_VERSIONS.sound }, 32);
    const cached = known.has(cacheKey);

    voiceRequests.push(
      VoiceRequestSchema.parse({
        characterCode: line.characterCode,
        voiceId,
        lineId: line.lineId,
        text: line.text,
        prosody,
        cacheKey,
        requiresPaidProvider: false,
      }),
    );
    dialogueTiming.push(
      DialogueTimingSchema.parse({
        lineId: line.lineId,
        characterCode: line.characterCode,
        startMs,
        durationMs: lineDurationMs,
        text: line.text,
        words: Math.max(1, words),
        syllables,
      }),
    );
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `dlg_${line.lineId}`,
        kind: 'DIALOGUE',
        startMs,
        durationMs: lineDurationMs,
        offsetMs: 0,
        gainDb: clampQuantize(prosody.gainDb, -40, SOUND_TARGETS.maxTrackGainDb, 2),
        fadeInMs: 15,
        fadeOutMs: 40,
        duckPriority: 0,
        characterCode: line.characterCode,
        source: {
          kind: 'VOICE_SYNTHESIS',
          ref: voiceId,
          provider: cached ? 'cached' : 'local-espeak',
          cacheKey,
          license: STUDIO_LICENSE,
        },
        text: line.text,
        cached,
      }),
    );
    cursorMs = startMs + lineDurationMs + 140;
  }

  if (beat.narration) {
    const cacheKey = shortHash({ narration: beat.narration, system: SUBSYSTEM_VERSIONS.sound }, 32);
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `nar_${shotId}`,
        kind: 'NARRATION',
        startMs: 120,
        durationMs: Math.max(400, Math.round((estimateSyllables(beat.narration) / (SOUND_TARGETS.wordsPerMinute * 1.4)) * 60_000)),
        offsetMs: 0,
        gainDb: -1,
        fadeInMs: 40,
        fadeOutMs: 120,
        duckPriority: 1,
        source: {
          kind: 'VOICE_SYNTHESIS',
          ref: 'narrator_default_v1',
          provider: known.has(cacheKey) ? 'cached' : 'local-espeak',
          cacheKey,
          license: STUDIO_LICENSE,
        },
        text: beat.narration,
        cached: known.has(cacheKey),
      }),
    );
  }

  // Ambience: always present. A shot with no room tone reads as a dead recording.
  const ambienceRef = AMBIENCE_LIBRARY[beat.timeOfDay] ?? AMBIENCE_LIBRARY.MIDDAY;
  tracks.push(
    AudioTrackSchema.parse({
      trackId: `amb_${shotId}`,
      kind: 'AMBIENCE',
      startMs: 0,
      durationMs,
      offsetMs: 0,
      gainDb: -22,
      fadeInMs: 200,
      fadeOutMs: 300,
      duckPriority: 4,
      source: { kind: 'SOUND_LIBRARY', ref: ambienceRef, provider: 'mock', cacheKey: shortHash({ ambienceRef }, 24), license: STUDIO_LICENSE },
      cached: true,
    }),
  );

  const musicRef = MUSIC_LIBRARY[beat.musicIntent];
  if (musicRef) {
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `mus_${shotId}`,
        kind: 'MUSIC',
        startMs: 0,
        durationMs,
        offsetMs: 0,
        // Music sits well under dialogue by construction; the ducking regions below
        // then pull it further for the words themselves.
        gainDb: -(SOUND_TARGETS.dialogueToMusicDb + 6),
        fadeInMs: 400,
        fadeOutMs: 600,
        duckPriority: 3,
        source: { kind: 'MUSIC_LIBRARY', ref: musicRef, provider: 'mock', cacheKey: shortHash({ musicRef }, 24), license: STUDIO_LICENSE },
        cached: true,
      }),
    );
  }

  // Footsteps land on the footfalls the acting plan planned. Same step count, same
  // sound count: audio and animation cannot disagree about how many steps happened.
  for (const characterCode of [...input.travellingCharacters].sort()) {
    const steps = input.stepsByCharacter[characterCode] ?? 0;
    if (steps <= 0) continue;
    const foley = FOLEY_LIBRARY[characterCode as CharacterCode];
    if (!foley) continue;
    const spacing = durationMs / (steps + 1);
    for (let step = 1; step <= steps; step += 1) {
      tracks.push(
        AudioTrackSchema.parse({
          trackId: `step_${characterCode}_${step}`,
          kind: 'FOOTSTEPS',
          startMs: Math.round(step * spacing),
          durationMs: 180,
          offsetMs: 0,
          gainDb: quantize(-16 + rng.float(-1.2, 1.2), 2),
          fadeInMs: 0,
          fadeOutMs: 60,
          duckPriority: 5,
          characterCode: characterCode as CharacterCode,
          source: {
            kind: 'SOUND_LIBRARY',
            ref: foley.footstep,
            provider: 'mock',
            cacheKey: shortHash({ ref: foley.footstep, step }, 24),
            license: STUDIO_LICENSE,
          },
          cached: true,
        }),
      );
    }
  }

  // Character foley for the accessories the lock requires: Goat's tag jingles, and
  // that jingle is part of how the audience knows he is there.
  for (const character of [...beat.characters].sort((a, b) => a.characterCode.localeCompare(b.characterCode))) {
    const foley = FOLEY_LIBRARY[character.characterCode];
    const emotion = emotions.find((candidate) => candidate.characterCode === character.characterCode);
    if (!foley || !emotion || emotion.effects.body.fidget < 0.15) continue;
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `foley_${character.characterCode}`,
        kind: 'FOLEY',
        startMs: Math.round(durationMs * 0.25),
        durationMs: Math.min(900, Math.round(durationMs * 0.5)),
        offsetMs: 0,
        gainDb: quantize(-24 + emotion.effects.body.fidget * 4, 2),
        fadeInMs: 60,
        fadeOutMs: 160,
        duckPriority: 6,
        characterCode: character.characterCode,
        source: {
          kind: 'SOUND_LIBRARY',
          ref: foley.foley,
          provider: 'mock',
          cacheKey: shortHash({ ref: foley.foley }, 24),
          license: STUDIO_LICENSE,
        },
        cached: true,
      }),
    );
  }

  for (const prop of [...beat.requiredProps].sort()) {
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `prop_${prop}`,
        kind: 'PROP',
        startMs: Math.round(durationMs * 0.3),
        durationMs: 420,
        offsetMs: 0,
        gainDb: -19,
        fadeInMs: 20,
        fadeOutMs: 120,
        duckPriority: 5,
        source: {
          kind: 'SOUND_LIBRARY',
          ref: `sfx_prop_${prop.toLowerCase()}_v1`,
          provider: 'mock',
          cacheKey: shortHash({ prop }, 24),
          license: STUDIO_LICENSE,
        },
        cached: true,
      }),
    );
  }

  for (const instance of input.vfx.instances) {
    const ref = VFX_SOUNDS[instance.category];
    if (!ref) continue;
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `vfx_${instance.instanceId}`,
        kind: 'VFX',
        startMs: instance.startMs,
        durationMs: Math.min(instance.durationMs, 1400),
        offsetMs: 0,
        gainDb: quantize(-20 + instance.intensity * 5, 2),
        fadeInMs: 20,
        fadeOutMs: 180,
        duckPriority: 5,
        source: {
          kind: 'SOUND_LIBRARY',
          ref,
          provider: 'mock',
          cacheKey: shortHash({ ref, intensity: instance.intensity }, 24),
          license: STUDIO_LICENSE,
        },
        cached: true,
      }),
    );
  }

  if (input.isTransitionShot) {
    tracks.push(
      AudioTrackSchema.parse({
        trackId: `trans_${shotId}`,
        kind: 'TRANSITION',
        startMs: Math.max(0, durationMs - 500),
        durationMs: 500,
        offsetMs: 0,
        gainDb: -18,
        fadeInMs: 60,
        fadeOutMs: 220,
        duckPriority: 4,
        source: {
          kind: 'SOUND_LIBRARY',
          ref: 'sfx_transition_swish_v1',
          provider: 'mock',
          cacheKey: shortHash({ ref: 'sfx_transition_swish_v1' }, 24),
          license: STUDIO_LICENSE,
        },
        cached: true,
      }),
    );
  }

  // Ducking: derived from the dialogue, not authored. Every word gets its space.
  const ducking = dialogueTiming
    .map((line) => ({
      startMs: Math.max(0, line.startMs - SOUND_TARGETS.duckLeadMs),
      endMs: Math.min(durationMs, line.startMs + line.durationMs + SOUND_TARGETS.duckReleaseMs),
      attenuationDb: SOUND_TARGETS.duckAttenuationDb,
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const sorted = tracks.sort((a, b) => a.startMs - b.startMs || a.trackId.localeCompare(b.trackId));

  // Gain staging. Per-track gains are chosen for balance, one track at a time, and
  // balance alone says nothing about what happens when eleven of them play at once.
  // Summing the loudest overlap and trimming the whole bus by the overflow is what
  // a mix engineer does with a master fader: every relative level is preserved, and
  // the sum lands under the ceiling. Trim only, never boost — pushing a quiet shot
  // up is loudness normalisation's job at assembly, not the planner's.
  const untrimmedPeakDb = estimateTrackPeakDb(sorted, ducking);
  const peakCeilingDb = SOUND_TARGETS.truePeakDb - SOUND_TARGETS.busSafetyDb;
  const mixBusTrimDb = untrimmedPeakDb > peakCeilingDb ? quantize(peakCeilingDb - untrimmedPeakDb, 2) : 0;
  const staged =
    mixBusTrimDb === 0
      ? sorted
      : sorted.map((track) =>
          AudioTrackSchema.parse({
            ...track,
            gainDb: clampQuantize(track.gainDb + mixBusTrimDb, -40, SOUND_TARGETS.maxTrackGainDb, 2),
          }),
        );

  if (mixBusTrimDb < SOUND_TARGETS.maxBusTrimDb) {
    // Past this depth the shot is not loud, it is over-layered: trimming further
    // would bury the ambience rather than fix the stack. Fail closed and say so.
    issues.push({
      code: 'SOUND_BUS_TRIM_EXCESSIVE',
      severity: 'ERROR',
      system: 'sound',
      shotId,
      message: `Mix needs ${mixBusTrimDb}dB of bus trim to clear the ceiling, past the ${SOUND_TARGETS.maxBusTrimDb}dB limit. Reduce the number of simultaneous tracks rather than trimming further.`,
      measured: { mixBusTrimDb, untrimmedPeakDb, trackCount: sorted.length },
    });
  }

  const plan: SoundPlan = SoundPlanSchema.parse({
    tracks: staged,
    mixBusTrimDb,
    dialogueTiming: dialogueTiming.sort((a, b) => a.startMs - b.startMs),
    voiceRequests: voiceRequests.sort((a, b) => a.lineId.localeCompare(b.lineId)),
    ducking,
    loudness: {
      targetLufs: SOUND_TARGETS.targetLufs,
      truePeakDb: SOUND_TARGETS.truePeakDb,
      dialogueToMusicDb: SOUND_TARGETS.dialogueToMusicDb,
    },
    durationMs,
    // The mix graph is a pure function of this key, so an unchanged key means the
    // existing mix is still correct and FFmpeg does not need to run again.
    mixConfigKey: shortHash(
      {
        tracks: staged.map((track) => ({
          trackId: track.trackId,
          kind: track.kind,
          startMs: track.startMs,
          durationMs: track.durationMs,
          offsetMs: track.offsetMs,
          gainDb: track.gainDb,
          fadeInMs: track.fadeInMs,
          fadeOutMs: track.fadeOutMs,
          duckPriority: track.duckPriority,
          source: track.source.cacheKey,
        })),
        ducking,
        loudness: SOUND_TARGETS.targetLufs,
        mixBusTrimDb,
        system: SUBSYSTEM_VERSIONS.sound,
      },
      32,
    ),
    provenance: { system: 'sound', version: SUBSYSTEM_VERSIONS.sound, seed },
  });

  decisions.push({
    system: 'sound',
    shotId,
    decision: 'mix',
    chose: `${plan.tracks.length} tracks, ${plan.dialogueTiming.length} dialogue line(s), ${mixBusTrimDb}dB bus trim`,
    because: `${beat.musicIntent} music intent, ${beat.timeOfDay} ambience, ${plan.ducking.length} ducking region(s) derived from dialogue; summed peak was ${untrimmedPeakDb}dB against a ${peakCeilingDb}dB staging ceiling`,
    alternatives: [],
    seed,
  });

  const measurements = measureSound(plan);
  for (const measurement of measurements) {
    if (measurement.status === 'FAIL') {
      issues.push({
        code: `SOUND_${measurement.check}`,
        severity: 'ERROR',
        system: 'sound',
        shotId,
        message: `${measurement.check}: measured ${measurement.measured}${measurement.unit}, tolerance ${measurement.tolerance}${measurement.unit}.${
          measurement.repair ? ` ${measurement.repair}` : ''
        }`,
        measured: { measured: measurement.measured, tolerance: measurement.tolerance },
      });
    }
  }

  return { plan, measurements, issues, decisions };
}

/** Deterministic syllable estimate. Crude, documented, and stable. */
export function estimateSyllables(text: string): number {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0;
  for (const word of words) {
    const groups = word.replace(/e\b/, '').match(/[aeiouy]+/g);
    total += Math.max(1, groups ? groups.length : 1);
  }
  return Math.max(1, total);
}

export function measureSound(plan: SoundPlan): SoundMeasurement[] {
  const out: SoundMeasurement[] = [];
  const add = (check: string, measured: number, tolerance: number, unit: string, pass: boolean, repair?: string) =>
    out.push({ check, measured: quantize(measured, 3), tolerance, unit, status: pass ? 'PASS' : 'FAIL', repair });

  // Missing audio: a shot with no track at all is a silent shot nobody asked for.
  add('MISSING_AUDIO', plan.tracks.length, 1, 'tracks', plan.tracks.length >= 1, 'Every shot needs at least an ambience bed.');

  // Duration validation: nothing may run past the end of the shot.
  const overrun = Math.max(0, ...plan.tracks.map((track) => track.startMs + track.durationMs - plan.durationMs));
  add(
    'DURATION_OVERRUN',
    overrun,
    0,
    'ms',
    overrun <= 0,
    'Trim the offending track or lengthen the shot; audio past the cut is discarded.',
  );

  // Silence/dropout: the longest window with nothing playing at all.
  const covered = plan.tracks
    .map((track) => ({ start: track.startMs, end: track.startMs + track.durationMs }))
    .sort((a, b) => a.start - b.start);
  let cursor = 0;
  let longestGap = 0;
  for (const span of covered) {
    if (span.start > cursor) longestGap = Math.max(longestGap, span.start - cursor);
    cursor = Math.max(cursor, span.end);
  }
  longestGap = Math.max(longestGap, plan.durationMs - cursor);
  add(
    'SILENCE_DROPOUT',
    longestGap,
    SOUND_TARGETS.maxSilenceGapMs,
    'ms',
    longestGap <= SOUND_TARGETS.maxSilenceGapMs,
    'Extend the ambience bed to cover the whole shot.',
  );

  // Clipping: sum the simultaneous gains of the loudest overlap. A crude but
  // effective pre-check — the real limiter still runs at assembly.
  const peakSum = estimatePeakDb(plan);
  add(
    'CLIPPING_RISK',
    peakSum,
    SOUND_TARGETS.truePeakDb,
    'dB',
    peakSum <= SOUND_TARGETS.truePeakDb,
    'Lower the loudest overlapping tracks or increase ducking.',
  );

  // Child-appropriate loudness.
  add(
    'CHILD_SAFE_LOUDNESS',
    plan.loudness.targetLufs,
    SOUND_TARGETS.maxChildSafeLufs,
    'LUFS',
    plan.loudness.targetLufs <= SOUND_TARGETS.maxChildSafeLufs,
    'Lower the loudness target; children listen close and often on speakers with no limiter.',
  );

  // Dialogue intelligibility over music.
  const dialogueGain = Math.max(
    ...[0, ...plan.tracks.filter((track) => track.kind === 'DIALOGUE').map((track) => track.gainDb)],
  );
  const musicGain = Math.max(
    ...[-60, ...plan.tracks.filter((track) => track.kind === 'MUSIC').map((track) => track.gainDb)],
  );
  const margin = dialogueGain - musicGain;
  const hasDialogue = plan.tracks.some((track) => track.kind === 'DIALOGUE');
  add(
    'DIALOGUE_INTELLIGIBILITY',
    hasDialogue ? margin : SOUND_TARGETS.dialogueToMusicDb,
    SOUND_TARGETS.dialogueToMusicDb,
    'dB',
    !hasDialogue || margin >= SOUND_TARGETS.dialogueToMusicDb,
    'Lower the music bed or raise the dialogue; children cannot follow words buried under a score.',
  );

  // Every dialogue line must be ducked, or the duck is decorative.
  const unducked = plan.dialogueTiming.filter(
    (line) => !plan.ducking.some((region) => region.startMs <= line.startMs && region.endMs >= line.startMs + line.durationMs),
  ).length;
  add('DUCKING_COVERAGE', unducked, 0, 'lines', unducked === 0, 'Add a ducking region covering every dialogue line.');

  // No paid provider may be required. Structural, and measured so it stays true.
  const paid = plan.voiceRequests.filter((request) => request.requiresPaidProvider).length +
    plan.tracks.filter((track) => track.source.provider === 'external').length;
  add('NO_PAID_PROVIDER', paid, 0, 'requests', paid === 0, 'Route the request through the local or cached provider.');

  return out;
}

type DuckRegion = { readonly startMs: number; readonly endMs: number; readonly attenuationDb: number };

/**
 * Worst-case summed peak across the timeline, in dB.
 *
 * The set of simultaneous tracks only changes at a track boundary, so sampling the
 * boundaries finds the loudest overlap exactly without walking every millisecond.
 * Amplitudes are summed linearly, which is the pessimistic case (coherent signals);
 * the real limiter still runs at assembly, so erring loud here is the safe direction.
 */
function estimateTrackPeakDb(tracks: readonly AudioTrack[], ducking: readonly DuckRegion[]): number {
  const boundaries = [...new Set(tracks.flatMap((track) => [track.startMs, track.startMs + track.durationMs]))].sort(
    (a, b) => a - b,
  );
  let peak = -60;
  for (const at of boundaries) {
    let linear = 0;
    for (const track of tracks) {
      if (at < track.startMs || at >= track.startMs + track.durationMs) continue;
      const ducked =
        track.kind !== 'DIALOGUE' && ducking.some((region) => at >= region.startMs && at <= region.endMs)
          ? SOUND_TARGETS.duckAttenuationDb
          : 0;
      linear += 10 ** ((track.gainDb + ducked) / 20);
    }
    if (linear > 0) peak = Math.max(peak, 20 * Math.log10(linear));
  }
  return quantize(peak, 2);
}

function estimatePeakDb(plan: SoundPlan): number {
  return estimateTrackPeakDb(plan.tracks, plan.ducking);
}
