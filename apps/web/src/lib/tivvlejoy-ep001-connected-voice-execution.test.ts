import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('EP001 connected voice execution', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/tivvlejoy-ep001-connected-voice-execution.ts'), 'utf8');
  const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/voice-production/ep001/execute/route.ts'), 'utf8');

  it('is preview-only, hash-token guarded, and one-line whitelisted', () => {
    expect(source).toContain("VERCEL_ENV !== 'preview'");
    expect(source).toContain('timingSafeEqual');
    expect(source).toContain("/^EP001_DL_0[1-8]$/");
    expect(source).not.toContain('uGNluPFHy9eJ_0fBxTBQhbZUmNkOKvVRNGfxMKtct30');
  });

  it('reserves before provider contact and refuses uncertain replay', () => {
    const reservationWrite = source.indexOf("putAndVerify(r2, reservationKey");
    const providerCreate = source.indexOf('createEp012ElevenLabsTransport');
    expect(reservationWrite).toBeGreaterThan(-1);
    expect(providerCreate).toBeGreaterThan(reservationWrite);
    expect(source).toContain("return blocked('EP001_RECOVERY_REQUIRED'");
    expect(source).toContain("status: 'ALREADY_SUCCEEDED'");
  });

  it('verifies R2 reads, preserves exact voice identity, and never auto-approves', () => {
    expect(source).toContain('lockedVoiceIdFor(line.characterId)');
    expect(source).toContain('APPROVED_ELEVENLABS_MODEL');
    expect(source).toContain('elevenLabsVoiceSettingsBody()');
    expect(source).toContain('putAndVerify(r2, audioKey');
    expect(source).toContain('putAndVerify(r2, receiptKey');
    expect(source).toContain('humanApproved: false');
    expect(source).toContain('productionEnabled: false');
  });

  it('makes execution responses non-cacheable', () => {
    expect(route).toContain("'Cache-Control': 'no-store, private'");
    expect(route).toContain("'X-Robots-Tag': 'noindex, nofollow'");
  });
});
