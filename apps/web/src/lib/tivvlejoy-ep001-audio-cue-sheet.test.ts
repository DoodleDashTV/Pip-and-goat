import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';
import {
  EP001_AUDIO_CUE_SHEET_SCHEMA,
  compileEp001AudioCueSheet,
} from './tivvlejoy-ep001-audio-cue-sheet';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_AUDIO_CUE_SHEET_V1', () => {
  it('compiles deterministically and binds to the exact Episode 1 package', () => {
    const episode = compileEp001ProductionPackage();
    const first = compileEp001AudioCueSheet(episode);
    const second = compileEp001AudioCueSheet(episode);

    expect(first.schemaVersion).toBe(EP001_AUDIO_CUE_SHEET_SCHEMA);
    expect(first.episodeId).toBe('EP001');
    expect(first.productionPackageSha256).toBe(episode.packageSha256);
    expect(first.cueSheetSha256).toBe(second.cueSheetSha256);
    expect(first.cueSheetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds all eight exact dialogue lines to approved public voice profiles', () => {
    const episode = compileEp001ProductionPackage();
    const sheet = compileEp001AudioCueSheet(episode);

    expect(sheet.dialogueCues).toHaveLength(8);
    expect(sheet.metrics).toMatchObject({
      dialogueCueCount: 8,
      pipDialogueCueCount: 5,
      goatDialogueCueCount: 3,
    });
    expect(sheet.dialogueCues.map((cue) => cue.text)).toEqual(
      episode.dialogue.map((line) => line.text),
    );
    for (const cue of sheet.dialogueCues) {
      const line = episode.dialogue.find((candidate) => candidate.lineId === cue.lineId)!;
      const shot = episode.shots.find((candidate) => candidate.shotId === cue.shotId)!;
      expect(cue).toMatchObject({
        startFrame: line.startFrame,
        endFrame: line.endFrame,
        voiceIdentityCheckpoint: 'TIVVLEJOY_VOICE_IDENTITY_LOCK_V1',
        bindingState: 'AWAITING_APPROVED_REAL_VOICE_RECEIPT',
        voiceReceiptRef: null,
        audioSourceSha256: null,
        audioIncluded: false,
        generationAuthorized: false,
      });
      expect(cue.voiceProfileVersion).toBe(
        cue.speaker === 'PIP' ? 'pip_default_v1' : 'goat_default_v1',
      );
      expect(cue.startFrame).toBeGreaterThanOrEqual(shot.inFrame);
      expect(cue.endFrame).toBeLessThanOrEqual(shot.outFrame);
    }
  });

  it('turns all 23 semantic sound requirements into in-shot sync cues', () => {
    const episode = compileEp001ProductionPackage();
    const sheet = compileEp001AudioCueSheet(episode);

    expect(sheet.sfxCues).toHaveLength(23);
    expect(sheet.metrics.storySfxCueCount).toBe(6);
    for (const shot of episode.shots) {
      const cues = sheet.sfxCues.filter((cue) => cue.shotId === shot.shotId);
      expect(cues.map((cue) => cue.semanticType)).toEqual(shot.sfx);
      expect(
        cues.every((cue) => cue.frame >= shot.inFrame && cue.frame + cue.duration <= shot.outFrame),
      ).toBe(true);
    }
    expect(sheet.sfxCues.every((cue) => cue.syncTarget.length > 20)).toBe(true);
    expect(
      sheet.sfxCues.every(
        (cue) =>
          cue.audioBinaryIncluded === false &&
          cue.sourceAssetId === null &&
          cue.sourceSha256 === null &&
          cue.licenseReceiptRef === null &&
          /^[a-f0-9]{64}$/.test(cue.sfxDependencySha256),
      ),
    ).toBe(true);
  });

  it('covers the entire picture with exact ambience, music, and ducking plans', () => {
    const episode = compileEp001ProductionPackage();
    const sheet = compileEp001AudioCueSheet(episode);

    expect(sheet.ambienceCues).toHaveLength(5);
    expect(sheet.musicCues).toHaveLength(10);
    expect(sheet.shotMixRows).toHaveLength(10);
    expect(sheet.ambienceCues[0]).toMatchObject({ startFrame: 0, endFrame: 480 });
    expect(sheet.ambienceCues.at(-1)).toMatchObject({ startFrame: 1_620, endFrame: 1_800 });
    for (let index = 1; index < sheet.ambienceCues.length; index += 1) {
      expect(sheet.ambienceCues[index]!.startFrame).toBe(sheet.ambienceCues[index - 1]!.endFrame);
    }
    expect(sheet.musicCues.map((cue) => cue.role)).toEqual(
      episode.shots.map((shot) => shot.musicRole),
    );
    expect(sheet.musicCues.every((cue) => !cue.copyrightedAudioIncluded)).toBe(true);
    expect(sheet.duckWindows).toHaveLength(8);
    expect(sheet.duckWindows.filter((window) => window.state === 'STRONG_DUCK')).toHaveLength(3);
    expect(sheet.shotMixRows.every((row) => row.ambienceCueId && row.musicCueId)).toBe(true);
  });

  it('keeps mix execution, approval, and every external mutation fail-closed', () => {
    const sheet = compileEp001AudioCueSheet();

    expect(sheet.state).toBe('LOGICAL_AUDIO_CUE_SHEET_READY_REAL_AUDIO_UNBOUND');
    expect(sheet.mixTargets).toMatchObject({
      measurementState: 'TARGETS_ONLY_NOT_MEASURED',
      integratedLufs: -14,
      integratedLufsTolerance: 1,
      maxTruePeakDbtp: -1,
      dialoguePriority: true,
      monoCompatibilityRequired: true,
      phoneSpeakerReviewRequired: true,
    });
    expect(sheet.qualityGates).toHaveLength(12);
    expect(sheet.qualityGates.every((gate) => !gate.complete && !gate.autoApproval)).toBe(true);
    expect(sheet.authority).toEqual({
      voiceGenerationAuthorized: false,
      voiceReceiptsApproved: false,
      sfxBindingsApproved: false,
      ambienceBindingsApproved: false,
      musicBindingsApproved: false,
      mixExecutionAllowed: false,
      finalAudioApprovalIssued: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
    expect(sheet.safety).toEqual({
      logicalCuesOnly: true,
      voiceProviderCalls: 0,
      networkCalls: 0,
      paidRequests: 0,
      audioBytesIncluded: 0,
      storageMutations: 0,
      productionMutations: 0,
      copyrightedMusicIncluded: false,
    });
  });

  it('renders a read-only Studio route linked from the Episode 1 review', () => {
    const episodePage = readRepo('apps/web/src/app/episode-one/page.tsx');
    const audioPage = readRepo('apps/web/src/app/episode-one/audio/page.tsx');

    expect(episodePage).toContain("['/episode-one/audio', 'Audio cue sheet']");
    expect(episodePage).toContain('Open audio cue sheet');
    expect(audioPage).toContain('compileEp001AudioCueSheet()');
    expect(audioPage).toContain('Approved identities, zero generation');
    expect(audioPage).toContain('Every shot has a complete logical mix row');
    expect(audioPage).toContain('zero voice calls');
    expect(audioPage).not.toContain("'use client'");
    expect(audioPage).not.toContain("'use server'");
    expect(audioPage).not.toContain('fetch(');
    expect(audioPage).not.toContain('onClick=');
    expect(audioPage).not.toContain('<form');
  });
});
