import { fixturePlaybackDataUrl } from './fixtures';
import { sortVoiceLines } from './form-state';
import {
  PIP_CHARACTER_ID,
  VoiceProductionError,
  VOICE_PRODUCTION_STORAGE_KEY,
  type RegisteredCharacterId,
} from './types';

export type BrowserVoiceLine = {
  id: string;
  episodeId: string;
  sceneId: string;
  characterId: string;
  voiceProfileVersion: string;
  dialogueText: string;
  performanceDirection: string;
  pronunciationNotes: string;
  emotion: string;
  generationStatus: string;
  approvalStatus: string;
  audioObjectKey: string | null;
  fixtureRevision?: string;
  characterCount: number;
  providerContacted: boolean;
};

export type VoiceBrowserSession = {
  episodeId: string;
  lines: BrowserVoiceLine[];
  playback: Record<string, string>;
};

export function applyLocalDecision(
  line: BrowserVoiceLine,
  decision: 'APPROVE' | 'REJECT',
): BrowserVoiceLine {
  if (decision === 'REJECT') {
    return {
      ...line,
      approvalStatus: 'REJECTED',
      generationStatus: 'REJECTED',
    };
  }
  return {
    ...line,
    approvalStatus: 'APPROVED',
    generationStatus: 'APPROVED_FOR_LIPSYNC',
  };
}

export function applyLocalEdit(
  line: BrowserVoiceLine,
  patch: {
    dialogueText?: string;
    performanceDirection?: string;
    pronunciationNotes?: string;
    emotion?: string;
  },
  maxCharsPerRequest: number,
): BrowserVoiceLine {
  const next = { ...line };
  if (patch.dialogueText !== undefined) {
    const characterCount = Array.from(patch.dialogueText).length;
    if (characterCount <= 0) {
      throw new VoiceProductionError('Dialogue text is empty.', 'EMPTY_DIALOGUE');
    }
    if (characterCount > maxCharsPerRequest) {
      throw new VoiceProductionError(
        `Line exceeds the per-request limit of ${maxCharsPerRequest} characters.`,
        'REQUEST_LIMIT',
      );
    }
    next.dialogueText = patch.dialogueText;
    next.characterCount = characterCount;
    next.approvalStatus = 'PENDING';
    next.generationStatus = 'DRAFT_TEXT';
  }
  if (patch.performanceDirection !== undefined) next.performanceDirection = patch.performanceDirection;
  if (patch.pronunciationNotes !== undefined) next.pronunciationNotes = patch.pronunciationNotes;
  if (patch.emotion !== undefined) next.emotion = patch.emotion;
  return next;
}

export function buildLocalPackage(episodeId: string, lines: BrowserVoiceLine[]) {
  const approved = lines.filter(
    (line) => line.approvalStatus === 'APPROVED' && line.generationStatus === 'APPROVED_FOR_LIPSYNC',
  );
  const rejected = lines.filter((line) => line.approvalStatus === 'REJECTED');
  return {
    kind: 'TIVVLEJOY_VOICE_PACKAGE',
    episodeId,
    readyForLipSync: approved,
    rejectedExcluded: rejected.map((line) => line.id),
    canEnterFinalRendering: false,
    providerContacted: approved.some((line) => line.providerContacted),
    downloadedAt: new Date().toISOString(),
  };
}

export function playbackOrFixture(
  characterId: string = PIP_CHARACTER_ID,
  existing?: string | null,
  revision = 'v1',
): string {
  return existing || fixturePlaybackDataUrl(characterId as RegisteredCharacterId, revision);
}

export function persistableLines(lines: BrowserVoiceLine[]): BrowserVoiceLine[] {
  return sortVoiceLines(lines);
}

export function readVoiceBrowserSession(episodeId: string): VoiceBrowserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VOICE_PRODUCTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VoiceBrowserSession;
    if (parsed.episodeId !== episodeId || !Array.isArray(parsed.lines)) return null;
    return { ...parsed, lines: sortVoiceLines(parsed.lines) };
  } catch {
    return null;
  }
}

export function writeVoiceBrowserSession(session: VoiceBrowserSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VOICE_PRODUCTION_STORAGE_KEY, JSON.stringify(session));
}
