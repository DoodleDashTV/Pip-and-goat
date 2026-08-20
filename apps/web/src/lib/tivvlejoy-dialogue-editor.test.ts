import { describe, expect, it } from 'vitest';
import {
  buildVoiceTimingReceipt,
  planDialogueEdit,
  planJlCut,
  upgradeTimingConfidence,
  visemeConfidenceFor,
} from './tivvlejoy-nightshift-production';

describe('dialogue editor and voice timing', () => {
  it('keeps line-level receipts from inventing phonemes', () => {
    const receipt = buildVoiceTimingReceipt({ dialogueRef: 'DL1', speaker: 'PIP', lineDurationFrames: 48 });
    expect(receipt.confidence).toBe('LINE_LEVEL');
    expect(receipt.phonemeTimings).toBeUndefined();
    expect(receipt.voiceIdChanged).toBe(false);
  });

  it('upgrades LINE to WORD to PHONEME without touching scenery', () => {
    const line = buildVoiceTimingReceipt({ dialogueRef: 'DL2', speaker: 'GOAT', lineDurationFrames: 60 });
    const word = upgradeTimingConfidence({ ...line, wordTimings: [{ word: 'hello', startFrame: 0, endFrame: 30 }] }, 'WORD_LEVEL');
    const phoneme = upgradeTimingConfidence(
      buildVoiceTimingReceipt({ dialogueRef: 'DL2', speaker: 'GOAT', lineDurationFrames: 60, words: ['hello'], phonemes: ['h', 'eh', 'l', 'o'] }),
      'PHONEME_LEVEL',
    );
    expect(visemeConfidenceFor(line.confidence)).toBe('LOW');
    expect(visemeConfidenceFor(word.confidence === 'LINE_LEVEL' ? 'WORD_LEVEL' : word.confidence)).toBe('MEDIUM');
    expect(visemeConfidenceFor(phoneme.confidence)).toBe('HIGH');
    expect(phoneme.receiptSha256).not.toBe(line.receiptSha256);
  });

  it('plans pre and post reactions without synthesizing audio', () => {
    const receipt = buildVoiceTimingReceipt({ dialogueRef: 'DL3', speaker: 'PIP', lineDurationFrames: 40 });
    const edit = planDialogueEdit({ lineId: 'DL3', speaker: 'PIP', shotId: 'SH01', pictureIn: 100, receipt, comedy: true });
    expect(edit.synthesized).toBe(false);
    expect(edit.startFrame).toBe(108);
    expect(edit.endFrame).toBe(148);
    expect(edit.comedyBeat).toBe(8);
  });

  for (const speaker of ['PIP', 'GOAT'] as const) {
    it(`plans a ${speaker} line with breath space and no synthesis`, () => {
      const receipt = buildVoiceTimingReceipt({ dialogueRef: `${speaker}_L`, speaker, lineDurationFrames: 36, words: ['I', 'see'] });
      const edit = planDialogueEdit({ lineId: `${speaker}_L`, speaker, shotId: 'SHX', pictureIn: 30, receipt });
      expect(edit.breathSpace).toBeGreaterThan(0);
      expect(edit.synthesized).toBe(false);
      expect(edit.confidence).toBe('WORD_LEVEL');
    });
  }

  it('plans J and L cuts without duplicating dialogue', () => {
    const receipt = buildVoiceTimingReceipt({ dialogueRef: 'DL4', speaker: 'PIP', lineDurationFrames: 30 });
    const outgoing = planDialogueEdit({ lineId: 'DL4', speaker: 'PIP', shotId: 'A', pictureIn: 0, receipt });
    const incoming = planDialogueEdit({ lineId: 'DL5', speaker: 'GOAT', shotId: 'B', pictureIn: 80, receipt: buildVoiceTimingReceipt({ dialogueRef: 'DL5', speaker: 'GOAT', lineDurationFrames: 30 }) });
    const j = planJlCut({ outgoing: { shotId: 'A', outFrame: 80 }, incoming: { shotId: 'B', inFrame: 80, dialogue: incoming }, prefer: 'J_CUT' });
    const same = planJlCut({ outgoing: { shotId: 'A', outFrame: 80, dialogue: outgoing }, incoming: { shotId: 'B', inFrame: 80, dialogue: outgoing } });
    expect(j.kind).toBe('J_CUT');
    expect(j.duplicateDialogue).toBe(false);
    expect(same.kind).toBe('NONE');
  });
});
