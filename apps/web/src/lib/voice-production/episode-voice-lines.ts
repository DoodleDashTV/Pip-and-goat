import { containsProhibitedLegacyBrand } from '../brand-canon';
import { publicScriptCharacters } from './script-line';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from './types';

export const EPISODE_LINE_BRAND_MESSAGE =
  'This line contains legacy-brand wording. Rewrite it using TivvleJoy-compatible language before generating.';

export const EPISODE_VOICE_SESSION_KEY = 'tivvlejoy.episode-voice-lines.v1';

export const EPISODE_VOICE_COPY = {
  sectionTitle: 'Episode voice lines',
  voicesTitle: 'Final approved Pip and Goat voices',
  cadence: 'Review and confirm one line at a time',
  paidWarning: 'Paid ElevenLabs generation — individual confirmation required',
  generateOnce: 'Generate this line once',
  reviewLine: 'Review voice line',
  nextLine: 'Work on next line',
} as const;

export const EPISODE_LINE_STATUSES = [
  'Draft',
  'Ready for review',
  'Reviewed',
  'Confirmation required',
  'Confirmed',
  'Generating',
  'Generated',
  'Approved',
  'Rejected',
  'Failed without charge',
] as const;

export type EpisodeLineStatus = (typeof EPISODE_LINE_STATUSES)[number];
export type EpisodeSpeaker = 'pip' | 'goat';

export type PublicEpisodeVoiceLine = {
  episodeId: string;
  sceneId: string;
  lineId: string;
  lineNumber: number;
  character: EpisodeSpeaker;
  dialogue: string;
  characterCount: number;
  reviewStatus: 'draft' | 'ready' | 'reviewed';
  confirmationStatus: 'required' | 'confirmed' | 'invalidated';
  generationStatus: 'idle' | 'generating' | 'generated' | 'failed';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  visibleStatus: EpisodeLineStatus;
  receiptRef: string | null;
};

export function speakerToCharacterId(speaker: EpisodeSpeaker): RegisteredCharacterId {
  return speaker === 'pip' ? PIP_CHARACTER_ID : GOAT_CHARACTER_ID;
}

export function characterIdToSpeaker(characterId: string): EpisodeSpeaker {
  if (characterId === PIP_CHARACTER_ID || characterId === 'pip') return 'pip';
  if (characterId === GOAT_CHARACTER_ID || characterId === 'goat') return 'goat';
  throw new VoiceProductionError('Only Pip and Goat are accepted as speakers.', 'UNKNOWN_CHARACTER');
}

export function displayNameForSpeaker(speaker: EpisodeSpeaker): 'Pip' | 'Goat' {
  return speaker === 'pip' ? 'Pip' : 'Goat';
}

export function publicEpisodeCharacters() {
  return publicScriptCharacters();
}

export function confirmationKey(input: {
  episodeId: string;
  sceneId: string;
  lineId: string;
  lineNumber: number;
  character: EpisodeSpeaker;
  dialogue: string;
}): string {
  return [
    String(input.episodeId ?? '').trim(),
    String(input.sceneId ?? '').trim(),
    String(input.lineId ?? '').trim(),
    String(input.lineNumber),
    input.character,
    String(input.dialogue ?? '').trim(),
  ].join('|');
}

export function visibleStatusFor(line: Pick<
  PublicEpisodeVoiceLine,
  'reviewStatus' | 'confirmationStatus' | 'generationStatus' | 'approvalStatus'
>): EpisodeLineStatus {
  if (line.approvalStatus === 'approved') return 'Approved';
  if (line.approvalStatus === 'rejected') return 'Rejected';
  if (line.generationStatus === 'failed') return 'Failed without charge';
  if (line.generationStatus === 'generating') return 'Generating';
  if (line.generationStatus === 'generated') return 'Generated';
  if (line.confirmationStatus === 'confirmed') return 'Confirmed';
  if (line.reviewStatus === 'reviewed' && line.confirmationStatus === 'required') return 'Confirmation required';
  if (line.reviewStatus === 'reviewed') return 'Reviewed';
  if (line.reviewStatus === 'ready') return 'Ready for review';
  return 'Draft';
}

function assertSpeaker(raw: string): EpisodeSpeaker {
  const folded = raw.trim().toLowerCase();
  if (folded === 'pip') return 'pip';
  if (folded === 'goat') return 'goat';
  throw new VoiceProductionError('Only Pip and Goat are accepted as speakers.', 'UNKNOWN_CHARACTER');
}

export function parseEpisodeScript(
  script: string,
  context: { episodeId: string; sceneId: string } = { episodeId: 'episode-preview', sceneId: 'scene-1' },
): PublicEpisodeVoiceLine[] {
  if (Array.isArray(script as unknown)) {
    throw new VoiceProductionError(
      'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
      'SINGLE_LINE_REQUIRED',
    );
  }
  const rows = String(script ?? '').split(/\r\n|\n|\u2028|\u2029/);
  const lines: PublicEpisodeVoiceLine[] = [];
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(pip|goat)\s*:\s*(.+)$/i);
    if (!match) {
      throw new VoiceProductionError(
        'Every episode line must start with Pip: or Goat:. Only one speaker is allowed per line.',
        'UNKNOWN_CHARACTER',
      );
    }
    const character = assertSpeaker(match[1] ?? '');
    const dialogue = String(match[2] ?? '').trim();
    if (!dialogue) {
      throw new VoiceProductionError('Dialogue text is empty.', 'EMPTY_DIALOGUE');
    }
    if (/\b(?:pip|goat)\s*:/i.test(dialogue)) {
      throw new VoiceProductionError(
        'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
        'SINGLE_LINE_REQUIRED',
      );
    }
    const lineNumber = lines.length + 1;
    const lineId = `eline-${lineNumber}`;
    const next: PublicEpisodeVoiceLine = {
      episodeId: context.episodeId,
      sceneId: context.sceneId,
      lineId,
      lineNumber,
      character,
      dialogue,
      characterCount: Array.from(dialogue).length,
      reviewStatus: 'ready',
      confirmationStatus: 'required',
      generationStatus: 'idle',
      approvalStatus: 'pending',
      visibleStatus: 'Ready for review',
      receiptRef: null,
    };
    next.visibleStatus = visibleStatusFor(next);
    lines.push(next);
  }
  if (!lines.length) {
    throw new VoiceProductionError('Dialogue text is empty.', 'EMPTY_DIALOGUE');
  }
  return lines;
}

export function assertEpisodeLineBrandFields(fields: Record<string, string | null | undefined>): void {
  for (const value of Object.values(fields)) {
    if (containsProhibitedLegacyBrand(value)) {
      throw new VoiceProductionError(EPISODE_LINE_BRAND_MESSAGE, 'LEGACY_BRAND_REFUSED');
    }
  }
}

export function invalidateConfirmation(line: PublicEpisodeVoiceLine): PublicEpisodeVoiceLine {
  const next: PublicEpisodeVoiceLine = {
    ...line,
    reviewStatus: line.dialogue.trim() ? 'ready' : 'draft',
    confirmationStatus: 'invalidated',
    generationStatus: line.generationStatus === 'generated' ? 'idle' : line.generationStatus,
    approvalStatus: 'pending',
    receiptRef: null,
    visibleStatus: 'Ready for review',
  };
  next.visibleStatus = visibleStatusFor(next);
  return next;
}

export function applyEpisodeLineEdit(
  line: PublicEpisodeVoiceLine,
  patch: Partial<Pick<PublicEpisodeVoiceLine, 'dialogue' | 'character' | 'episodeId' | 'sceneId' | 'lineNumber'>>,
): PublicEpisodeVoiceLine {
  const next = { ...line, ...patch };
  next.characterCount = Array.from(String(next.dialogue ?? '')).length;
  const changed =
    next.dialogue !== line.dialogue ||
    next.character !== line.character ||
    next.episodeId !== line.episodeId ||
    next.sceneId !== line.sceneId ||
    next.lineNumber !== line.lineNumber;
  if (changed) {
    return invalidateConfirmation(next);
  }
  next.visibleStatus = visibleStatusFor(next);
  return next;
}

export function readEpisodeVoiceSession(): {
  lines: PublicEpisodeVoiceLine[];
  playback: Record<string, string>;
  approvals: Record<string, 'approved' | 'rejected'>;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(EPISODE_VOICE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      lines?: PublicEpisodeVoiceLine[];
      playback?: Record<string, string>;
      approvals?: Record<string, 'approved' | 'rejected'>;
    };
    return {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      playback: parsed.playback ?? {},
      approvals: parsed.approvals ?? {},
    };
  } catch {
    return null;
  }
}

export function writeEpisodeVoiceSession(input: {
  lines: PublicEpisodeVoiceLine[];
  playback: Record<string, string>;
  approvals: Record<string, 'approved' | 'rejected'>;
}): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(
    EPISODE_VOICE_SESSION_KEY,
    JSON.stringify({
      lines: input.lines.map((line) => ({
        ...line,
        receiptRef: line.receiptRef,
      })),
      playback: input.playback,
      approvals: input.approvals,
    }),
  );
}
