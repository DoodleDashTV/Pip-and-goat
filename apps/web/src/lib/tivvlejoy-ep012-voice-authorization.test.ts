import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP012_CANONICAL_DIALOGUE_LOCK,
  EP012_CANONICAL_DIALOGUE_SHA256,
  EP012_VOICE_AUTHORIZATION,
  EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256,
  EP012_VOICE_AUTHORIZATION_SCHEMA,
  EP012_VOICE_AUTHORIZATION_SHA256,
  assertEp012VoiceRequestAuthorized,
  getEp012AuthorizedVoiceRequest,
  verifyEp012VoiceAuthorization,
} from './tivvlejoy-real-production-unblock';

const expectedSegments = [
  ['DL_HOOK_01__PIP', 'PIP'],
  ['DL_HOOK_01__GOAT', 'GOAT'],
  ['DL_DISCOVERY_01__PIP', 'PIP'],
  ['DL_DECISION_01__GOAT', 'GOAT'],
  ['DL_ACTION_01__PIP', 'PIP'],
  ['DL_ACTION_01__GOAT', 'GOAT'],
  ['DL_COMPLICATION_01__GOAT', 'GOAT'],
  ['DL_COMPLICATION_01__PIP', 'PIP'],
  ['DL_PAYOFF_01__PIP', 'PIP'],
  ['DL_BUTTON_01__GOAT', 'GOAT'],
  ['DL_BUTTON_01__PIP', 'PIP'],
] as const;

function exactInput(segmentId: string) {
  const request = getEp012AuthorizedVoiceRequest(segmentId);
  return {
    requestId: request.requestId,
    episodeId: request.episodeId,
    dialogueRef: request.dialogueRef,
    segmentId: request.segmentId,
    speaker: request.speaker,
    canonicalText: request.canonicalText,
    textSha256: request.textSha256,
    segmentSha256: request.segmentSha256,
    dialogueSha256: request.dialogueSha256,
  };
}

describe('TIVVLEJOY_EP012_VOICE_AUTHORIZATION_V1', () => {
  it('is issued only for EP012 canonical subsegments', () => {
    expect(EP012_VOICE_AUTHORIZATION.schemaVersion).toBe(EP012_VOICE_AUTHORIZATION_SCHEMA);
    expect(EP012_VOICE_AUTHORIZATION.authorizationStatus).toBe('ISSUED');
    expect(EP012_VOICE_AUTHORIZATION.scope).toBe('EP012_CANONICAL_SUBSEGMENTS_ONLY');
    expect(EP012_VOICE_AUTHORIZATION.episodeId).toBe('EP012');
  });

  it('pins the exact approved aggregate dialogue hash', () => {
    expect(EP012_VOICE_AUTHORIZATION_DIALOGUE_SHA256).toBe(
      'f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4',
    );
    expect(EP012_VOICE_AUTHORIZATION.dialogueSha256).toBe(EP012_CANONICAL_DIALOGUE_SHA256);
  });

  it('authorizes exactly eleven requests for eleven utterance subsegments', () => {
    expect(EP012_CANONICAL_DIALOGUE_LOCK.utteranceSegmentCount).toBe(11);
    expect(EP012_VOICE_AUTHORIZATION.authorizedSegmentCount).toBe(11);
    expect(EP012_VOICE_AUTHORIZATION.maxProviderRequests).toBe(11);
    expect(EP012_VOICE_AUTHORIZATION.authorizedRequests).toHaveLength(11);
  });

  it('authorizes the exact Pip and Goat segment identities', () => {
    expect(EP012_VOICE_AUTHORIZATION.authorizedRequests.map((request) => [request.segmentId, request.speaker])).toEqual(
      expectedSegments,
    );
  });

  it('binds every request back to its locked canonical segment', () => {
    for (const request of EP012_VOICE_AUTHORIZATION.authorizedRequests) {
      const line = EP012_CANONICAL_DIALOGUE_LOCK.lines.find((item) => item.dialogueRef === request.dialogueRef);
      const segment = line?.subsegments.find((item) => item.segmentId === request.segmentId);
      expect(segment).toBeDefined();
      expect(request.speaker).toBe(segment?.speaker);
      expect(request.canonicalText).toBe(segment?.canonicalText);
      expect(request.textSha256).toBe(segment?.textSha256);
      expect(request.segmentSha256).toBe(segment?.segmentSha256);
    }
  });

  it('uses one deterministic request id per speaker segment', () => {
    const ids = EP012_VOICE_AUTHORIZATION.authorizedRequests.map((request) => request.requestId);
    expect(new Set(ids).size).toBe(11);
    expect(ids.every((id) => /^ep012_voice_[0-9a-f]{24}$/.test(id))).toBe(true);
    expect(EP012_VOICE_AUTHORIZATION.authorizedRequests.every((request) => request.oneRequestPerSpeaker)).toBe(true);
  });

  it('forbids automatic retry so a provider request cannot be silently billed twice', () => {
    expect(EP012_VOICE_AUTHORIZATION.automaticRetryAllowed).toBe(false);
    expect(EP012_VOICE_AUTHORIZATION.authorizedRequests.every((request) => !request.automaticRetryAllowed)).toBe(true);
  });

  it('does not weaken the durable-ledger or server-gate requirements', () => {
    expect(EP012_VOICE_AUTHORIZATION.durableLedgerRequired).toBe(true);
    expect(EP012_VOICE_AUTHORIZATION.existingServerGatesRequired).toBe(true);
  });

  it('does not enable Production', () => {
    expect(EP012_VOICE_AUTHORIZATION.productionEnabled).toBe(false);
  });

  it('does not authorize scenery access', () => {
    expect(EP012_VOICE_AUTHORIZATION.sceneryAccessAllowed).toBe(false);
    expect(EP012_VOICE_AUTHORIZATION.commercialBytesDownloaded).toBe(0);
  });

  it('does not alter or authorize alteration of the dialogue lock', () => {
    expect(EP012_VOICE_AUTHORIZATION.dialogueLockMutationAllowed).toBe(false);
    expect(EP012_CANONICAL_DIALOGUE_LOCK.dialogueSha256).toBe(
      'f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4',
    );
  });

  it('creates authorization without performing voice generation', () => {
    expect(EP012_VOICE_AUTHORIZATION.generationPerformed).toBe(false);
  });

  it('passes the fail-closed authorization verifier', () => {
    expect(verifyEp012VoiceAuthorization()).toBe(true);
  });

  it('has a deterministic authorization hash', () => {
    expect(EP012_VOICE_AUTHORIZATION.authorizationSha256).toBe(EP012_VOICE_AUTHORIZATION_SHA256);
    expect(EP012_VOICE_AUTHORIZATION_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts an exact authorized request', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(assertEp012VoiceRequestAuthorized(input).segmentId).toBe('DL_HOOK_01__PIP');
  });

  it('rejects any other episode', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, episodeId: 'EP013' })).toThrow(/WRONG_EPISODE/);
  });

  it('rejects an aggregate-dialogue hash mismatch', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, dialogueSha256: '0'.repeat(64) })).toThrow(
      /DIALOGUE_HASH_MISMATCH/,
    );
  });

  it('rejects a segment outside the authorization', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, segmentId: 'DL_UNKNOWN__PIP' })).toThrow(
      /SEGMENT_NOT_AUTHORIZED/,
    );
  });

  it('rejects changed canonical text', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, canonicalText: `${input.canonicalText} changed` })).toThrow(
      /REQUEST_MISMATCH/,
    );
  });

  it('rejects a speaker swap', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, speaker: 'GOAT' })).toThrow(/REQUEST_MISMATCH/);
  });

  it('rejects a text hash change', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, textSha256: '1'.repeat(64) })).toThrow(/REQUEST_MISMATCH/);
  });

  it('rejects a segment hash change', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, segmentSha256: '2'.repeat(64) })).toThrow(/REQUEST_MISMATCH/);
  });

  it('rejects an unbound request id', () => {
    const input = exactInput('DL_HOOK_01__PIP');
    expect(() => assertEp012VoiceRequestAuthorized({ ...input, requestId: 'ep012_voice_deadbeefdeadbeefdeadbeef' })).toThrow(
      /REQUEST_MISMATCH/,
    );
  });

  it('contains no network or scenery download implementation', () => {
    const source = readFileSync(
      path.resolve(__dirname, 'tivvlejoy-real-production-unblock/ep012-voice-authorization.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/R2_|r2\.cloudflarestorage|commercial.*GET/i);
  });
});
