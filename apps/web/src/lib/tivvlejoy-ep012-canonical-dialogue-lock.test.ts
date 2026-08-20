import { describe, expect, it } from 'vitest';
import {
  EP012_CANONICAL_DIALOGUE_LOCK,
  EP012_CANONICAL_DIALOGUE_SCHEMA,
  EP012_CANONICAL_DIALOGUE_SHA256,
  getEp012CanonicalLine,
  verifyEp012CanonicalDialogueLock,
} from './tivvlejoy-real-production-unblock/ep012-canonical-dialogue';

describe('TIVVLEJOY_EP012_CANONICAL_DIALOGUE_V1', () => {
  it('locks exactly seven canonical line records', () => {
    expect(EP012_CANONICAL_DIALOGUE_LOCK.schemaVersion).toBe(EP012_CANONICAL_DIALOGUE_SCHEMA);
    expect(EP012_CANONICAL_DIALOGUE_LOCK.episodeId).toBe('EP012');
    expect(EP012_CANONICAL_DIALOGUE_LOCK.title).toBe('The Bakery Map');
    expect(EP012_CANONICAL_DIALOGUE_LOCK.lineCount).toBe(7);
    expect(EP012_CANONICAL_DIALOGUE_LOCK.lines).toHaveLength(7);
  });

  it('locks the exact dialogue IDs and top-level speakers', () => {
    expect(EP012_CANONICAL_DIALOGUE_LOCK.lines.map((line) => [line.dialogueRef, line.speaker])).toEqual([
      ['DL_HOOK_01', 'PIP_AND_GOAT'],
      ['DL_DISCOVERY_01', 'PIP'],
      ['DL_DECISION_01', 'GOAT'],
      ['DL_ACTION_01', 'PIP_AND_GOAT'],
      ['DL_COMPLICATION_01', 'PIP_AND_GOAT'],
      ['DL_PAYOFF_01', 'PIP'],
      ['DL_BUTTON_01', 'PIP_AND_GOAT'],
    ]);
  });

  it('locks the hook exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_HOOK_01').canonicalText).toBe(
      'Pip: “Goat, wait—that flour trail is shaped like our map!” Goat: “Then breakfast just became a clue.”',
    );
  });

  it('locks the discovery line exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_DISCOVERY_01').canonicalText).toBe(
      'Look! The trail leads behind the bakery shelves. Someone wanted us to find this.',
    );
  });

  it('locks the decision line exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_DECISION_01').canonicalText).toBe(
      'Then we follow it before the baker sweeps our clue away.',
    );
  });

  it('locks the action line exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_ACTION_01').canonicalText).toBe(
      'Pip: “I’ll check the shelves.” Goat: “I’ll check the oven—carefully.”',
    );
  });

  it('locks the complication line exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_COMPLICATION_01').canonicalText).toBe(
      'Goat: “Nothing here. Just crumbs.” Pip: “Crumbs don’t sparkle. Lift that tray!”',
    );
  });

  it('locks the payoff line exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_PAYOFF_01').canonicalText).toBe(
      'It’s a missing map piece! The bakery was hiding part of the trail.',
    );
  });

  it('locks the button line exactly as approved', () => {
    expect(getEp012CanonicalLine('DL_BUTTON_01').canonicalText).toBe(
      'Goat: “Mystery solved. Bun time?” Pip: “One bun. Then we follow the map.”',
    );
  });

  it('splits each shared line into exact Pip/Goat spoken subsegments', () => {
    expect(getEp012CanonicalLine('DL_HOOK_01').subsegments.map((segment) => [segment.speaker, segment.canonicalText])).toEqual([
      ['PIP', 'Goat, wait—that flour trail is shaped like our map!'],
      ['GOAT', 'Then breakfast just became a clue.'],
    ]);
    expect(getEp012CanonicalLine('DL_ACTION_01').subsegments.map((segment) => [segment.speaker, segment.canonicalText])).toEqual([
      ['PIP', 'I’ll check the shelves.'],
      ['GOAT', 'I’ll check the oven—carefully.'],
    ]);
    expect(getEp012CanonicalLine('DL_COMPLICATION_01').subsegments.map((segment) => [segment.speaker, segment.canonicalText])).toEqual([
      ['GOAT', 'Nothing here. Just crumbs.'],
      ['PIP', 'Crumbs don’t sparkle. Lift that tray!'],
    ]);
    expect(getEp012CanonicalLine('DL_BUTTON_01').subsegments.map((segment) => [segment.speaker, segment.canonicalText])).toEqual([
      ['GOAT', 'Mystery solved. Bun time?'],
      ['PIP', 'One bun. Then we follow the map.'],
    ]);
  });

  it('has eleven total spoken utterance segments', () => {
    expect(EP012_CANONICAL_DIALOGUE_LOCK.utteranceSegmentCount).toBe(11);
    expect(EP012_CANONICAL_DIALOGUE_LOCK.lines.reduce((sum, line) => sum + line.subsegments.length, 0)).toBe(11);
  });

  it('locks the aggregate canonical dialogue hash', () => {
    expect(EP012_CANONICAL_DIALOGUE_SHA256).toBe('f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4');
    expect(EP012_CANONICAL_DIALOGUE_LOCK.dialogueSha256).toBe(EP012_CANONICAL_DIALOGUE_SHA256);
    expect(verifyEp012CanonicalDialogueLock()).toBe(true);
  });

  it('requires a 64-character text hash, line hash, and segment hashes', () => {
    for (const line of EP012_CANONICAL_DIALOGUE_LOCK.lines) {
      expect(line.textSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(line.lineSha256).toMatch(/^[0-9a-f]{64}$/);
      for (const segment of line.subsegments) {
        expect(segment.textSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(segment.segmentSha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('does not generate voices or download scenery', () => {
    expect(EP012_CANONICAL_DIALOGUE_LOCK.voiceGenerationPerformed).toBe(false);
    expect(EP012_CANONICAL_DIALOGUE_LOCK.commercialBytesDownloaded).toBe(0);
  });
});
