import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppError, assertSafePath } from '@doodle-dash/shared';
import { z } from 'zod';

export const VoiceProfileSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().uuid().optional(),
  name: z.string().min(1),
  provider: z.string().min(1).optional(),
  providerVoiceId: z.string().min(1).optional(),
  pitch: z.string().optional(),
  cadence: z.string().optional(),
  speed: z.string().optional(),
  energy: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export const DialogueLineSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().uuid().optional(),
  voiceProfileId: z.string().min(1).optional(),
  text: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0).optional(),
  emotion: z.string().optional(),
  direction: z.string().optional(),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const VisemeCueSchema = z.object({
  viseme: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  weight: z.number().min(0).max(1).default(1),
});
export type VisemeCue = z.infer<typeof VisemeCueSchema>;

export const LipSyncTimelineSchema = z.object({
  id: z.string().min(1),
  dialogueLineId: z.string().min(1),
  audioAssetId: z.string().min(1).optional(),
  cues: z.array(VisemeCueSchema),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LipSyncTimeline = z.infer<typeof LipSyncTimelineSchema>;

export type AudioLibraryItem = {
  id: string;
  name: string;
  uri: string;
  durationMs?: number;
  tags: string[];
  category?: string;
  metadata: Record<string, unknown>;
};

export type AudioTrack = {
  id: string;
  uri: string;
  kind: 'dialogue' | 'sfx' | 'music' | 'ambience';
  startMs: number;
  durationMs: number;
  gainDb?: number;
  duckingPriority?: number;
};

export type DuckingRegion = {
  targetTrackId: string;
  sourceTrackId: string;
  startMs: number;
  endMs: number;
  gainDb: number;
};

export type AudioMixMetadata = {
  tracks: AudioTrack[];
  ducking: DuckingRegion[];
  normalization: {
    targetLufs: number;
    truePeakDb: number;
    strategy: 'metadata_only';
  };
};

export interface KeyValueRepository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  save(value: T): Promise<T>;
  delete(id: string): Promise<void>;
}

export class InMemoryRepository<T extends { id: string }> implements KeyValueRepository<T> {
  private values = new Map<string, T>();

  async list(): Promise<T[]> {
    return [...this.values.values()];
  }

  async get(id: string): Promise<T | null> {
    return this.values.get(id) ?? null;
  }

  async save(value: T): Promise<T> {
    this.values.set(value.id, value);
    return value;
  }

  async delete(id: string): Promise<void> {
    this.values.delete(id);
  }
}

export class JsonFileRepository<T extends { id: string }> implements KeyValueRepository<T> {
  constructor(
    private readonly filePath: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  async list(): Promise<T[]> {
    return this.read();
  }

  async get(id: string): Promise<T | null> {
    return (await this.read()).find((value) => value.id === id) ?? null;
  }

  async save(value: T): Promise<T> {
    const parsed = this.schema.parse(value);
    const values = (await this.read()).filter((existing) => existing.id !== parsed.id);
    await this.write([...values, parsed]);
    return parsed;
  }

  async delete(id: string): Promise<void> {
    await this.write((await this.read()).filter((value) => value.id !== id));
  }

  private async read(): Promise<T[]> {
    try {
      const text = await fs.readFile(assertSafePath(this.filePath), 'utf8');
      return z.array(this.schema).parse(JSON.parse(text));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(values: T[]): Promise<void> {
    const target = assertSafePath(this.filePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(values, null, 2));
    await fs.rename(tmp, target);
  }
}

export class VoiceProfileService {
  constructor(private readonly repository: KeyValueRepository<VoiceProfile> = new InMemoryRepository<VoiceProfile>()) {}

  async create(input: Omit<VoiceProfile, 'metadata'> & { metadata?: Record<string, unknown> }): Promise<VoiceProfile> {
    return this.repository.save(VoiceProfileSchema.parse(input));
  }

  async get(id: string): Promise<VoiceProfile> {
    const profile = await this.repository.get(id);
    if (!profile) throw new AppError('Voice profile not found.', 'VOICE_PROFILE_NOT_FOUND', 404);
    return profile;
  }

  async list(characterId?: string): Promise<VoiceProfile[]> {
    const profiles = await this.repository.list();
    return characterId ? profiles.filter((profile) => profile.characterId === characterId) : profiles;
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

export class DialogueService {
  normalizeLines(lines: DialogueLine[], wordsPerMinute = 145): DialogueLine[] {
    return lines.map((line) => {
      const parsed = DialogueLineSchema.parse(line);
      const endMs =
        parsed.endMs ?? parsed.startMs + Math.max(500, Math.ceil((wordCount(parsed.text) / wordsPerMinute) * 60_000));
      if (endMs <= parsed.startMs) {
        throw new AppError('Dialogue line endMs must be after startMs.', 'DIALOGUE_INVALID_TIMING', 400);
      }
      return { ...parsed, endMs };
    });
  }

  groupByVoice(lines: DialogueLine[]): Map<string, DialogueLine[]> {
    const groups = new Map<string, DialogueLine[]>();
    for (const line of lines) {
      const key = line.voiceProfileId ?? line.characterId ?? 'unassigned';
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    return groups;
  }
}

export class LipSyncService {
  constructor(private readonly repository: KeyValueRepository<LipSyncTimeline> = new InMemoryRepository<LipSyncTimeline>()) {}

  async persistTimeline(input: {
    id?: string;
    dialogueLineId: string;
    audioAssetId?: string;
    cues: VisemeCue[];
    metadata?: Record<string, unknown>;
  }): Promise<LipSyncTimeline> {
    const existing = input.id ? await this.repository.get(input.id) : null;
    const now = new Date().toISOString();
    const timeline = LipSyncTimelineSchema.parse({
      id: input.id ?? `lip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      dialogueLineId: input.dialogueLineId,
      audioAssetId: input.audioAssetId,
      cues: input.cues.map((cue) => VisemeCueSchema.parse(cue)).sort((a, b) => a.startMs - b.startMs),
      metadata: input.metadata ?? existing?.metadata ?? {},
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    validateCueTiming(timeline.cues);
    return this.repository.save(timeline);
  }

  async getTimeline(id: string): Promise<LipSyncTimeline> {
    const timeline = await this.repository.get(id);
    if (!timeline) throw new AppError('Lip-sync timeline not found.', 'LIP_SYNC_NOT_FOUND', 404);
    return timeline;
  }

  async listForDialogue(dialogueLineId: string): Promise<LipSyncTimeline[]> {
    return (await this.repository.list()).filter((timeline) => timeline.dialogueLineId === dialogueLineId);
  }
}

export class SoundLibraryService {
  constructor(private readonly repository: KeyValueRepository<AudioLibraryItem> = new InMemoryRepository<AudioLibraryItem>()) {}

  async add(item: AudioLibraryItem): Promise<AudioLibraryItem> {
    return this.repository.save(parseLibraryItem(item));
  }

  async search(query: { tag?: string; category?: string; text?: string } = {}): Promise<AudioLibraryItem[]> {
    return searchLibrary(await this.repository.list(), query);
  }
}

export class MusicLibraryService {
  constructor(private readonly repository: KeyValueRepository<AudioLibraryItem> = new InMemoryRepository<AudioLibraryItem>()) {}

  async add(item: AudioLibraryItem): Promise<AudioLibraryItem> {
    return this.repository.save(parseLibraryItem(item));
  }

  async search(query: { tag?: string; category?: string; text?: string } = {}): Promise<AudioLibraryItem[]> {
    return searchLibrary(await this.repository.list(), query);
  }
}

export class AudioMixService {
  buildMixMetadata(
    tracks: AudioTrack[],
    options: { targetLufs?: number; truePeakDb?: number; duckMusicUnderDialogueDb?: number } = {},
  ): AudioMixMetadata {
    const parsedTracks = tracks.map(parseAudioTrack);
    const dialogue = parsedTracks.filter((track) => track.kind === 'dialogue');
    const ducking: DuckingRegion[] = [];
    for (const target of parsedTracks.filter((track) => track.kind === 'music' || track.kind === 'ambience')) {
      for (const source of dialogue) {
        const startMs = Math.max(target.startMs, source.startMs);
        const endMs = Math.min(target.startMs + target.durationMs, source.startMs + source.durationMs);
        if (endMs > startMs) {
          ducking.push({
            targetTrackId: target.id,
            sourceTrackId: source.id,
            startMs,
            endMs,
            gainDb: options.duckMusicUnderDialogueDb ?? -12,
          });
        }
      }
    }
    return {
      tracks: parsedTracks,
      ducking,
      normalization: {
        targetLufs: options.targetLufs ?? -16,
        truePeakDb: options.truePeakDb ?? -1,
        strategy: 'metadata_only',
      },
    };
  }
}

export type CaptionCue = {
  index?: number;
  startMs: number;
  endMs: number;
  text: string;
};

export class CaptionService {
  static formatSrtTimestamp(ms: number): string {
    if (!Number.isInteger(ms) || ms < 0) {
      throw new AppError('Caption timestamp must be a non-negative integer.', 'CAPTION_INVALID_TIME', 400);
    }
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1_000);
    const millis = ms % 1_000;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, '0')}`;
  }

  static toSrt(cues: CaptionCue[]): string {
    return cues
      .map((cue, position) => {
        const parsed = parseCaptionCue(cue);
        return [
          String(parsed.index ?? position + 1),
          `${CaptionService.formatSrtTimestamp(parsed.startMs)} --> ${CaptionService.formatSrtTimestamp(parsed.endMs)}`,
          sanitizeCaptionText(parsed.text),
        ].join('\n');
      })
      .join('\n\n')
      .concat('\n');
  }
}

export const formatSrtTimestamp = CaptionService.formatSrtTimestamp;
export const generateSrt = CaptionService.toSrt;

const AudioLibraryItemSchema: z.ZodType<AudioLibraryItem> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  durationMs: z.number().int().min(0).optional(),
  tags: z.array(z.string().min(1)).default([]),
  category: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

const AudioTrackSchema: z.ZodType<AudioTrack> = z.object({
  id: z.string().min(1),
  uri: z.string().min(1),
  kind: z.enum(['dialogue', 'sfx', 'music', 'ambience']),
  startMs: z.number().int().min(0),
  durationMs: z.number().int().positive(),
  gainDb: z.number().optional(),
  duckingPriority: z.number().int().optional(),
});

const CaptionCueSchema: z.ZodType<CaptionCue> = z.object({
  index: z.number().int().positive().optional(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().min(1),
});

function parseLibraryItem(item: AudioLibraryItem): AudioLibraryItem {
  return AudioLibraryItemSchema.parse(item);
}

function parseAudioTrack(track: AudioTrack): AudioTrack {
  return AudioTrackSchema.parse(track);
}

function parseCaptionCue(cue: CaptionCue): CaptionCue {
  const parsed = CaptionCueSchema.parse(cue);
  if (parsed.endMs <= parsed.startMs) {
    throw new AppError('Caption endMs must be after startMs.', 'CAPTION_INVALID_TIMING', 400);
  }
  return parsed;
}

function searchLibrary(items: AudioLibraryItem[], query: { tag?: string; category?: string; text?: string }): AudioLibraryItem[] {
  const text = query.text?.toLowerCase();
  return items.filter((item) => {
    if (query.tag && !item.tags.includes(query.tag)) return false;
    if (query.category && item.category !== query.category) return false;
    if (text && !`${item.name} ${item.tags.join(' ')} ${item.category ?? ''}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

function validateCueTiming(cues: VisemeCue[]): void {
  for (const cue of cues) {
    if (cue.endMs <= cue.startMs) {
      throw new AppError('Viseme cue endMs must be after startMs.', 'VISEME_INVALID_TIMING', 400);
    }
  }
}

function sanitizeCaptionText(text: string): string {
  return text.replace(/\r/g, '').replace(/[^\S\n]+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
