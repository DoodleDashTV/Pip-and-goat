import { describe, expect, it } from 'vitest';
import { evaluateEpisodeQc } from './tivvlejoy-production-studio/qc';
import { QC_PROFILES } from './tivvlejoy-production-studio/types';

function complete(overrides: Parameters<typeof evaluateEpisodeQc>[0] = { episodeId: 'EP012' }) {
  return evaluateEpisodeQc({
    episodeId: 'EP012',
    profileId: 'SHORT_60',
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 60,
    frameCount: 1800,
    audioPresent: true,
    audioDurationSec: 60,
    dialogueTimingOk: true,
    audioPeakOk: true,
    loudnessOk: true,
    captionTimingOk: true,
    captionSafeAreaOk: true,
    textOverflowOk: true,
    shotContinuityOk: true,
    characterContinuityOk: true,
    propContinuityOk: true,
    locationContinuityOk: true,
    visualApprovalPresent: true,
    visualApprovalFresh: true,
    assetProvenanceOk: true,
    assetHashOk: true,
    characterRigVersion: 'PIP_V1',
    renderManifestMatch: true,
    deliveryManifestMatch: true,
    ...overrides,
  });
}

describe('episode QC', () => {
  it('passes a complete SHORT_60 profile', () => {
    const report = complete();
    expect(report.passed).toBe(true);
    expect(report.hardBlockers).toEqual([]);
    expect(report.profileId).toBe('SHORT_60');
    expect(report.episodeQcSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses profile configuration instead of hard-coded ad-hoc sizes', () => {
    expect(QC_PROFILES.SHORT_15).toMatchObject({ width: 1080, height: 1920, fps: 30, durationSec: 15 });
    expect(QC_PROFILES.SHORT_30.durationSec).toBe(30);
    expect(QC_PROFILES.SHORT_60.durationSec).toBe(60);
  });

  it('fails wrong resolution as a hard blocker', () => {
    const report = complete({ width: 1920, height: 1080 });
    expect(report.passed).toBe(false);
    expect(report.hardBlockers).toEqual(expect.arrayContaining(['RESOLUTION', 'ASPECT_RATIO', 'VIDEO_FORMAT']));
  });

  it('fails wrong frame rate', () => {
    expect(complete({ fps: 24 }).hardBlockers).toContain('FRAME_RATE');
  });

  it('fails incomplete frames', () => {
    expect(complete({ frameCount: 1700 }).hardBlockers).toContain('FRAME_COMPLETENESS');
  });

  it('fails missing audio', () => {
    expect(complete({ audioPresent: false }).hardBlockers).toContain('AUDIO_PRESENT');
  });

  it('fails mismatched audio duration', () => {
    expect(complete({ audioDurationSec: 40 }).hardBlockers).toContain('AUDIO_DURATION');
  });

  it('treats loudness and peak policy as warnings, not hard blockers', () => {
    const report = complete({ loudnessOk: false, audioPeakOk: false });
    expect(report.hardBlockers).toEqual([]);
    expect(report.warnings).toEqual(expect.arrayContaining(['LOUDNESS_POLICY', 'AUDIO_PEAK_POLICY']));
    expect(report.checks.find((item) => item.category === 'LOUDNESS_POLICY')?.state).toBe('WARNING');
  });

  it('treats caption issues as warnings', () => {
    const report = complete({ captionTimingOk: false, captionSafeAreaOk: false, textOverflowOk: false });
    expect(report.hardBlockers).toEqual([]);
    expect(report.warnings).toEqual(expect.arrayContaining(['CAPTION_TIMING', 'CAPTION_SAFE_AREA', 'TEXT_OVERFLOW']));
  });

  it('fails continuity hard blockers', () => {
    const report = complete({
      shotContinuityOk: false,
      characterContinuityOk: false,
      propContinuityOk: false,
      locationContinuityOk: false,
    });
    expect(report.hardBlockers).toEqual(
      expect.arrayContaining(['SHOT_CONTINUITY', 'CHARACTER_CONTINUITY', 'PROP_CONTINUITY', 'LOCATION_CONTINUITY']),
    );
  });

  it('fails missing or stale visual approval', () => {
    expect(complete({ visualApprovalPresent: false }).hardBlockers).toContain('VISUAL_APPROVAL_PRESENT');
    expect(complete({ visualApprovalFresh: false }).hardBlockers).toContain('VISUAL_APPROVAL_FRESH');
  });

  it('fails asset provenance and hash mismatches', () => {
    expect(complete({ assetProvenanceOk: false }).hardBlockers).toContain('ASSET_PROVENANCE');
    expect(complete({ assetHashOk: false }).hardBlockers).toContain('ASSET_HASH');
  });

  it('fails unresolved character rigs', () => {
    expect(complete({ characterRigVersion: 'UNRESOLVED_PRODUCTION_RIG' }).hardBlockers).toContain('CHARACTER_RIG_VERSION');
  });

  it('fails render and delivery manifest mismatches', () => {
    expect(complete({ renderManifestMatch: false }).hardBlockers).toContain('RENDER_MANIFEST_MATCH');
    expect(complete({ deliveryManifestMatch: false }).hardBlockers).toContain('DELIVERY_MANIFEST_MATCH');
  });

  it('marks omitted fields NOT_EVALUATED instead of passing them', () => {
    const report = evaluateEpisodeQc({ episodeId: 'EP012' });
    expect(report.passed).toBe(false);
    expect(report.checks.filter((item) => item.state === 'NOT_EVALUATED').length).toBeGreaterThan(10);
    expect(report.warnings.length).toBeGreaterThan(10);
    expect(report.hardBlockers).toEqual([]);
  });

  it('evaluates SHORT_15 frame completeness from the profile', () => {
    const report = complete({ profileId: 'SHORT_15', durationSec: 15, frameCount: 450, audioDurationSec: 15 });
    expect(report.profileId).toBe('SHORT_15');
    expect(report.passed).toBe(true);
    expect(complete({ profileId: 'SHORT_15', durationSec: 15, frameCount: 449, audioDurationSec: 15 }).hardBlockers).toContain(
      'FRAME_COMPLETENESS',
    );
  });

  it('evaluates SHORT_30 duration from the profile', () => {
    expect(complete({ profileId: 'SHORT_30', durationSec: 30, frameCount: 900, audioDurationSec: 30 }).passed).toBe(true);
    expect(complete({ profileId: 'SHORT_30', durationSec: 44, frameCount: 900, audioDurationSec: 44 }).hardBlockers).toContain(
      'DURATION',
    );
  });

  it('is deterministic', () => {
    expect(complete().episodeQcSha256).toBe(complete().episodeQcSha256);
  });

  it('changes hash when a check flips', () => {
    expect(complete().episodeQcSha256).not.toBe(complete({ audioPresent: false }).episodeQcSha256);
  });

  it('covers every required QC category', () => {
    const categories = new Set(complete().checks.map((item) => item.category));
    for (const category of [
      'VIDEO_FORMAT',
      'RESOLUTION',
      'ASPECT_RATIO',
      'FRAME_RATE',
      'DURATION',
      'FRAME_COMPLETENESS',
      'AUDIO_PRESENT',
      'AUDIO_DURATION',
      'DIALOGUE_TIMING',
      'AUDIO_PEAK_POLICY',
      'LOUDNESS_POLICY',
      'CAPTION_TIMING',
      'CAPTION_SAFE_AREA',
      'TEXT_OVERFLOW',
      'SHOT_CONTINUITY',
      'CHARACTER_CONTINUITY',
      'PROP_CONTINUITY',
      'LOCATION_CONTINUITY',
      'VISUAL_APPROVAL_PRESENT',
      'VISUAL_APPROVAL_FRESH',
      'ASSET_PROVENANCE',
      'ASSET_HASH',
      'CHARACTER_RIG_VERSION',
      'RENDER_MANIFEST_MATCH',
      'DELIVERY_MANIFEST_MATCH',
    ]) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it('keeps hard blockers and warnings in separate lists', () => {
    const report = complete({ audioPresent: false, loudnessOk: false });
    expect(report.hardBlockers).toContain('AUDIO_PRESENT');
    expect(report.hardBlockers).not.toContain('LOUDNESS_POLICY');
    expect(report.warnings).toContain('LOUDNESS_POLICY');
  });

  it('does not encode or inspect media bytes', () => {
    expect(JSON.stringify(complete())).not.toMatch(/ffmpeg|base64|\.mp4/);
  });

  it('uses 9:16 1080x1920 30fps as the primary production profile', () => {
    expect(QC_PROFILES.SHORT_60).toEqual({
      profileId: 'SHORT_60',
      width: 1080,
      height: 1920,
      aspect: '9:16',
      fps: 30,
      durationSec: 60,
    });
  });

  it('allows a two-second duration tolerance', () => {
    expect(complete({ durationSec: 58 }).hardBlockers).not.toContain('DURATION');
    expect(complete({ durationSec: 57 }).hardBlockers).toContain('DURATION');
  });

  it('keeps dialogue timing as a warning', () => {
    expect(complete({ dialogueTimingOk: false }).checks.find((item) => item.category === 'DIALOGUE_TIMING')?.state).toBe(
      'WARNING',
    );
  });
});
