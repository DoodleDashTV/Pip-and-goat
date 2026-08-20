import { sha256Canonical } from './hash';
import { DIALOGUE_EDITOR_SCHEMA, type TimingConfidence } from './types';

export type VoiceTimingReceipt = {
  dialogueRef: string;
  speaker: 'PIP' | 'GOAT';
  lineDurationFrames: number;
  wordTimings?: Array<{ word: string; startFrame: number; endFrame: number }>;
  phonemeTimings?: Array<{ phoneme: string; startFrame: number; endFrame: number }>;
  confidence: TimingConfidence;
  receiptSha256: string;
  voiceIdChanged: false;
};

export type DialogueEdit = {
  schemaVersion: typeof DIALOGUE_EDITOR_SCHEMA;
  lineId: string;
  speaker: 'PIP' | 'GOAT';
  shotId: string;
  startFrame: number;
  endFrame: number;
  preLineReaction: number;
  postLineReaction: number;
  interCharacterPause: number;
  interruption: boolean;
  overlap: boolean;
  breathSpace: number;
  comedyBeat: number;
  confidence: TimingConfidence;
  synthesized: false;
  dialogueEditSha256: string;
};

export function buildVoiceTimingReceipt(input: {
  dialogueRef: string;
  speaker: 'PIP' | 'GOAT';
  lineDurationFrames: number;
  words?: string[];
  phonemes?: string[];
  confidence?: TimingConfidence;
}): VoiceTimingReceipt {
  const confidence = input.confidence ?? (input.phonemes?.length ? 'PHONEME_LEVEL' : input.words?.length ? 'WORD_LEVEL' : 'LINE_LEVEL');
  const wordTimings = input.words?.map((word, index) => ({
    word,
    startFrame: Math.round((index / input.words!.length) * input.lineDurationFrames),
    endFrame: Math.round(((index + 1) / input.words!.length) * input.lineDurationFrames),
  }));
  const phonemeTimings = input.phonemes?.map((phoneme, index) => ({
    phoneme,
    startFrame: Math.round((index / input.phonemes!.length) * input.lineDurationFrames),
    endFrame: Math.round(((index + 1) / input.phonemes!.length) * input.lineDurationFrames),
  }));
  const body = {
    dialogueRef: input.dialogueRef,
    speaker: input.speaker,
    lineDurationFrames: input.lineDurationFrames,
    wordTimings,
    phonemeTimings,
    confidence,
    voiceIdChanged: false as const,
  };
  return { ...body, receiptSha256: sha256Canonical(body) };
}

export function planDialogueEdit(input: {
  lineId: string;
  speaker: 'PIP' | 'GOAT';
  shotId: string;
  pictureIn: number;
  receipt: VoiceTimingReceipt;
  comedy?: boolean;
  interrupt?: boolean;
}): DialogueEdit {
  const pre = input.comedy ? 8 : 4;
  const post = input.comedy ? 10 : 6;
  const startFrame = input.pictureIn + pre;
  const endFrame = startFrame + input.receipt.lineDurationFrames;
  const body = {
    schemaVersion: DIALOGUE_EDITOR_SCHEMA,
    lineId: input.lineId,
    speaker: input.speaker,
    shotId: input.shotId,
    startFrame,
    endFrame,
    preLineReaction: pre,
    postLineReaction: post,
    interCharacterPause: input.interrupt ? 0 : 6,
    interruption: input.interrupt === true,
    overlap: false,
    breathSpace: 3,
    comedyBeat: input.comedy ? 8 : 0,
    confidence: input.receipt.confidence,
    synthesized: false as const,
  };
  return { ...body, dialogueEditSha256: sha256Canonical(body) };
}

export function upgradeTimingConfidence(receipt: VoiceTimingReceipt, next: TimingConfidence): VoiceTimingReceipt {
  const order: TimingConfidence[] = ['LINE_LEVEL', 'WORD_LEVEL', 'PHONEME_LEVEL', 'EXACT'];
  if (order.indexOf(next) < order.indexOf(receipt.confidence)) return receipt;
  return buildVoiceTimingReceipt({
    dialogueRef: receipt.dialogueRef,
    speaker: receipt.speaker,
    lineDurationFrames: receipt.lineDurationFrames,
    words: receipt.wordTimings?.map((item) => item.word),
    phonemes: receipt.phonemeTimings?.map((item) => item.phoneme),
    confidence: next,
  });
}

export function visemeConfidenceFor(confidence: TimingConfidence): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (confidence === 'EXACT' || confidence === 'PHONEME_LEVEL') return 'HIGH';
  if (confidence === 'WORD_LEVEL') return 'MEDIUM';
  return 'LOW';
}
