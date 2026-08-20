import { describe, expect, it } from 'vitest';
import {
  captionsFromDialogue,
  evaluateCaptionQc,
  formatCaptionText,
  planCaptionCue,
  buildVoiceTimingReceipt,
  planDialogueEdit,
} from './tivvlejoy-nightshift-production';

describe('caption system', () => {
  it('builds caption cues from dialogue receipts', () => {
    const receipt = buildVoiceTimingReceipt({ dialogueRef: 'DL1', speaker: 'PIP', lineDurationFrames: 60 });
    const edit = planDialogueEdit({ lineId: 'DL1', speaker: 'PIP', shotId: 'SH01', pictureIn: 0, receipt });
    const [cue] = captionsFromDialogue([edit], () => 'Did you see that?');
    expect(cue?.text).toBe('Did you see that?');
    expect(cue?.speaker).toBe('PIP');
    expect(cue?.captionDependencySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not introduce DoodleDash wording', () => {
    const cue = planCaptionCue({ captionId: 'C1', speaker: 'GOAT', text: 'I see it.', startFrame: 0, endFrame: 45 });
    expect(JSON.stringify(cue)).not.toMatch(/DoodleDash/i);
  });

  it('flags overlap, reading speed, overflow, and shot-boundary issues', () => {
    const qc = evaluateCaptionQc({
      captions: [
        planCaptionCue({ captionId: 'A', speaker: 'PIP', text: 'word '.repeat(30), startFrame: 0, endFrame: 10 }),
        planCaptionCue({ captionId: 'B', speaker: 'GOAT', text: 'Next', startFrame: 8, endFrame: 40 }),
      ],
      shotRanges: [{ shotId: 'SH01', inFrame: 0, outFrame: 20 }],
      faceBoxes: [{ y: 0.86, h: 0.1 }],
    });
    expect(qc.findings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['READING_SPEED', 'LINE_LENGTH', 'TEXT_OVERFLOW', 'OVERLAP', 'SHOT_BOUNDARY', 'SAFE_AREA']),
    );
  });

  it('only formats whitespace, never rewrites dialogue', () => {
    expect(formatCaptionText('  I   see   it.  ')).toBe('I see it.');
  });

  for (const speaker of ['PIP', 'GOAT'] as const) {
    it(`keeps ${speaker} captions inside a covering shot`, () => {
      const cue = planCaptionCue({ captionId: speaker, speaker, text: 'Look.', startFrame: 10, endFrame: 40 });
      const qc = evaluateCaptionQc({
        captions: [cue],
        shotRanges: [{ shotId: 'SH01', inFrame: 0, outFrame: 48 }],
      });
      expect(qc.passed).toBe(true);
    });
  }

  it('flags a speaker change that collides with the previous cue', () => {
    const qc = evaluateCaptionQc({
      captions: [
        planCaptionCue({ captionId: 'A', speaker: 'PIP', text: 'Hello there friend', startFrame: 0, endFrame: 40 }),
        planCaptionCue({ captionId: 'B', speaker: 'GOAT', text: 'Hi', startFrame: 40, endFrame: 70 }),
      ],
      shotRanges: [{ shotId: 'SH01', inFrame: 0, outFrame: 80 }],
    });
    expect(qc.findings.some((item) => item.code === 'SPEAKER_CHANGE')).toBe(true);
  });
});
